// gemma-client.ts
import { z } from "zod"

export interface GeneratedQuestion {
  type: "single" | "multiple" | "truefalse"
  text: string
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

export interface GenerateQuestionsOptions {
  context?: string
  contextSource?: "rag" | "manual"
}

const DIFFICULTIES = ["easy", "medium", "hard"] as const
const QUESTION_TYPES = ["single", "multiple", "truefalse"] as const
const MAX_ATTEMPTS = 2

const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma:2b"

export let lastDetectedCategory = "General"

const generatedQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  text: z.coerce.string().trim().min(12),
  options: z.array(z.coerce.string().trim().min(1)),
  correctAnswers: z.array(z.coerce.number().int().nonnegative()),
  explanation: z.coerce.string().trim().min(20).optional(),
})

const generatedQuizSchema = z.object({
  category: z.coerce.string().trim().optional(),
  questions: z.array(generatedQuestionSchema),
})

function trimContext(context?: string) {
  if (!context) return ""
  return context
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, 12000)
}

function normalizeDifficulty(value: string): (typeof DIFFICULTIES)[number] {
  if (DIFFICULTIES.includes(value as any)) {
    return value as (typeof DIFFICULTIES)[number]
  }
  throw new Error('difficulty invalido. Usa "easy", "medium" o "hard"')
}

function normalizeTypes(types: unknown) {
  const source = Array.isArray(types) ? types : [...QUESTION_TYPES]
  const validTypes = source.filter((type): type is GeneratedQuestion["type"] =>
    QUESTION_TYPES.includes(type as any)
  )
  return validTypes.length ? Array.from(new Set(validTypes)) : [...QUESTION_TYPES]
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim()
}

function uniqueKey(value: string) {
  return normalizeText(value).replace(/\s+/g, " ")
}

function buildAvoidanceBlock(existing: GeneratedQuestion[]) {
  if (existing.length === 0) return ""
  return `
No repitas ni parafrasees estas preguntas ya aceptadas:
${existing.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}
`
}

function buildPrompt(
  topic: string,
  count: number,
  difficulty: (typeof DIFFICULTIES)[number],
  types: string[],
  options: GenerateQuestionsOptions = {},
  existing: GeneratedQuestion[] = [],
  feedback = ""
): string {
  const context = trimContext(options.context)
  const contextBlock = context
    ? `
Contexto ${options.contextSource === "rag" ? "RAG" : "manual"} de documentos del usuario:
"""
${context}
"""

Usa el contexto anterior como fuente principal. Si el contexto no contiene suficiente informacion para una pregunta, genera una pregunta conceptual claramente relacionada con el tema, sin inventar datos especificos no presentes en el contexto.
`
    : ""

  const difficultyGuide: Record<(typeof DIFFICULTIES)[number], string> = {
    easy: "recuerdo y comprension basica; evita trampas, pero exige distinguir conceptos cercanos.",
    medium: "aplicacion e interpretacion; incluye escenarios breves y distractores basados en errores frecuentes.",
    hard: "analisis y transferencia; exige comparar, inferir o aplicar criterios, sin ambiguedad.",
  }

  return `Eres un disenador instruccional experto. Genera EXACTAMENTE ${count} preguntas de quiz en ESPANOL sobre el tema: "${topic}".
Dificultad EXACTA: "${difficulty}" (${difficultyGuide[difficulty]}). Tipos permitidos: ${types.join(", ")}.
${contextBlock}
${buildAvoidanceBlock(existing)}
${feedback ? `Corrige estos problemas detectados en el intento anterior:\n${feedback}\n` : ""}
Responde EXCLUSIVAMENTE con un JSON valido (sin markdown, sin texto extra) con esta forma:
{
  "category": "Física",
  "questions": [
    {
      "type": "single" | "multiple" | "truefalse",
      "text": "texto de la pregunta",
      "options": ["opcion 1", "opcion 2", ...],
      "correctAnswers": [0],
      "explanation": "breve explicacion"
    }
  ]
}

Reglas:
- single: 4 opciones, 1 indice correcto.
- multiple: 4 opciones, 2-3 indices correctos.
- truefalse: opciones ["Verdadero","Falso"], 1 indice correcto.
- Los indices son base 0.
- El JSON debe ser parseable por JSON.parse: comillas dobles, sin comentarios y sin comas finales.
- No incluyas preguntas repetidas, casi repetidas ni con la misma respuesta correcta formulada igual.
- No repitas opciones dentro de una pregunta.
- Los distractores deben ser plausibles: errores comunes, conceptos cercanos o matices incorrectos. No uses opciones obviamente absurdas, bromas, "todas las anteriores", "ninguna de las anteriores" ni pistas gramaticales.
- Cada explicacion debe indicar por que la respuesta correcta lo es y por que al menos un distractor plausible falla.
- Cada pregunta debe ser respondible desde el contexto cuando haya contexto disponible.
- Evita preguntas ambiguas, puramente memoristicas si la dificultad es medium/hard, o que dependan de opiniones.
- La categoria debe ser especifica y coherente con el tema.`
}

async function tryGemma(prompt: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 360000)

    const response = await fetch(`${GEMMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        prompt,
        stream: false,
        format: "json",
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Error Ollama:", errorText)
      return null
    }

    const data = await response.json()
    return data?.response ?? null
  } catch (error) {
    console.error("Error conectando con Gemma:", error)
    return null
  }
}

function stripJsonEnvelope(raw: string) {
  const clean = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
  const start = clean.indexOf("{")
  const end = clean.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return clean
  return clean.slice(start, end + 1)
}

function parseGeneratedQuiz(raw: string) {
  try {
    return generatedQuizSchema.parse(JSON.parse(stripJsonEnvelope(raw)))
  } catch (error: any) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
        : error?.message ?? "JSON mal formado"
    throw new Error(message)
  }
}

function normalizeQuestion(q: z.infer<typeof generatedQuestionSchema>): GeneratedQuestion {
  const options =
    q.type === "truefalse"
      ? ["Verdadero", "Falso"]
      : q.options.map((option) => option.replace(/\s+/g, " ").trim())

  return {
    type: q.type,
    text: q.text.replace(/\s+/g, " ").trim(),
    options,
    correctAnswers: Array.from(new Set(q.correctAnswers)).sort((a, b) => a - b),
    explanation: q.explanation?.replace(/\s+/g, " ").trim(),
  }
}

function validateQuestion(
  question: GeneratedQuestion,
  allowedTypes: GeneratedQuestion["type"][],
  seenQuestions: Set<string>
) {
  const errors: string[] = []

  if (!allowedTypes.includes(question.type)) {
    errors.push(`tipo no permitido: ${question.type}`)
  }

  if (!question.text || question.text.length < 12) {
    errors.push("texto de pregunta demasiado corto")
  }

  if (!question.explanation || question.explanation.length < 20) {
    errors.push("explicacion ausente o demasiado breve")
  }

  const questionKey = uniqueKey(question.text)
  if (seenQuestions.has(questionKey)) {
    errors.push("pregunta duplicada o repetida")
  }

  const optionKeys = question.options.map(uniqueKey)
  if (new Set(optionKeys).size !== question.options.length) {
    errors.push("opciones duplicadas dentro de la pregunta")
  }

  if (question.correctAnswers.some((idx) => idx < 0 || idx >= question.options.length)) {
    errors.push("indice correcto fuera de rango")
  }

  if (question.type === "truefalse") {
    const isTrueFalse =
      question.options.length === 2 &&
      question.options[0] === "Verdadero" &&
      question.options[1] === "Falso" &&
      question.correctAnswers.length === 1
    if (!isTrueFalse) errors.push("truefalse debe usar exactamente Verdadero/Falso y una respuesta")
  }

  if (question.type === "single") {
    if (question.options.length !== 4) errors.push("single debe tener 4 opciones")
    if (question.correctAnswers.length !== 1) errors.push("single debe tener 1 respuesta correcta")
  }

  if (question.type === "multiple") {
    if (question.options.length !== 4) errors.push("multiple debe tener 4 opciones")
    if (question.correctAnswers.length < 2 || question.correctAnswers.length > 3) {
      errors.push("multiple debe tener 2-3 respuestas correctas")
    }
  }

  return errors
}

function collectValidQuestions(
  parsedQuestions: z.infer<typeof generatedQuestionSchema>[],
  allowedTypes: GeneratedQuestion["type"][],
  existing: GeneratedQuestion[]
) {
  const accepted: GeneratedQuestion[] = []
  const errors: string[] = []
  const seenQuestions = new Set(existing.map((q) => uniqueKey(q.text)))

  parsedQuestions.forEach((rawQuestion, index) => {
    const question = normalizeQuestion(rawQuestion)
    const validationErrors = validateQuestion(question, allowedTypes, seenQuestions)

    if (validationErrors.length > 0) {
      errors.push(`pregunta ${index + 1}: ${validationErrors.join(", ")}`)
      return
    }

    seenQuestions.add(uniqueKey(question.text))
    accepted.push(question)
  })

  return { accepted, errors }
}

export async function generateQuestions(
  topic: string,
  count: number,
  difficulty: string = "medium",
  types: unknown = ["single", "multiple", "truefalse"],
  options: GenerateQuestionsOptions = {}
): Promise<GeneratedQuestion[]> {
  const safeDifficulty = normalizeDifficulty(String(difficulty))
  const safeTypes = normalizeTypes(types)
  const safeCount = Math.max(1, Math.min(15, Number(count) || 5))

  const accepted: GeneratedQuestion[] = []
  let feedback = ""
  let lastError = ""

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && accepted.length < safeCount; attempt += 1) {
    const missing = safeCount - accepted.length
    const prompt = buildPrompt(topic, missing, safeDifficulty, safeTypes, options, accepted, feedback)

    const raw = await tryGemma(prompt)
    if (!raw) {
      lastError = "No se pudo generar preguntas (Gemma no disponible)"
      feedback = lastError
      continue
    }

    try {
      const parsed = parseGeneratedQuiz(raw)

      const detectedCategory =
        typeof parsed.category === "string" ? parsed.category.trim() : ""

      lastDetectedCategory =
        detectedCategory &&
        detectedCategory.toLowerCase() !== "general" &&
        detectedCategory.toLowerCase() !== "categoría detectada"
          ? detectedCategory
          : topic.trim() || "General"

      const { accepted: newQuestions, errors } = collectValidQuestions(
        parsed.questions,
        safeTypes,
        accepted
      )

      accepted.push(...newQuestions.slice(0, missing))
      feedback = errors.length
        ? errors.slice(0, 8).join("\n")
        : "El intento anterior no completo la cantidad solicitada sin duplicados."

      if (newQuestions.length === 0 && errors.length === 0) {
        feedback = "La respuesta no aporto preguntas validas."
      }
    } catch (error: any) {
      lastError = `JSON mal formado o estructura invalida: ${error?.message ?? "respuesta invalida"}`
      feedback = `${lastError}\nDevuelve solo el objeto JSON con "category" y "questions" sin texto adicional.`
    }
  }

  if (accepted.length === 0) {
    throw new Error(lastError || "La IA no devolvio preguntas validas")
  }

  return accepted.slice(0, safeCount)
}