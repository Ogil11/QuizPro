import { IntelligentFeedbackSchema, type AttemptForFeedback, type IntelligentFeedback } from "./types"
import { buildPedagogicalPayload } from "./analyze-attempt"

const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma3:4b"
const GEMMA_TIMEOUT_MS = Number(process.env.GEMMA_TIMEOUT_MS) || 60000
const MAX_GENERATION_ATTEMPTS = 2

type FeedbackQualityResult = {
  feedback: IntelligentFeedback
  errors: string[]
  corrections: string[]
}

type RawAttempt = {
  attempt: number
  parsed?: unknown
  errors?: string[]
  corrections?: string[]
}

function cleanJsonResponse(raw: string) {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function fallbackFeedback(data: AttemptForFeedback): IntelligentFeedback {
  const missed = data.questions.filter((question) => !question.correct)
  const level = data.attempt.score >= 80 ? "high" : data.attempt.score >= 60 ? "medium" : "low"

  return {
    summary: `Obtuviste ${Math.round(data.attempt.score)}%. ${
      missed.length === 0
        ? "Mostraste dominio sólido del quiz."
        : `Conviene reforzar ${missed.length} pregunta${missed.length === 1 ? "" : "s"} donde hubo errores.`
    }`,
    performanceLevel: level,
    strengths: data.questions.some((question) => question.correct)
      ? ["Respondiste correctamente parte del quiz y tienes una base para seguir practicando."]
      : [],
    weaknesses: missed.slice(0, 3).map((question) => ({
      topic: data.quiz.category,
      evidence: `Error en: ${question.text}`,
      recommendation: "Repasa el concepto evaluado y vuelve a resolver una pregunta similar.",
    })),
    questionFeedback: data.questions.map((question) => ({
      questionId: question.id,
      wasCorrect: question.correct,
      errorExplanation: question.correct
        ? "Respuesta correcta."
        : question.explanation || "La respuesta seleccionada no coincide con la opción correcta.",
      correctConcept: question.explanation || "Revisa la explicación y las opciones correctas de esta pregunta.",
      practiceTip: question.correct
        ? "Mantén este nivel y practica con preguntas de mayor dificultad."
        : "Compara tu respuesta con la correcta y escribe una regla breve para recordarla.",
    })),
    recommendedPractice: ["Reintenta el quiz después de repasar las preguntas incorrectas."],
    nextQuizSuggestions: [
      {
        title: `Refuerzo de ${data.quiz.category}`,
        topic: data.quiz.category,
        difficulty: data.quiz.difficulty === "hard" ? "medium" : "easy",
        reason: "Practicar conceptos base ayuda a corregir los errores detectados.",
      },
    ],
  }
}

function normalizeText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function compactKey(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function words(value: string) {
  return compactKey(value).split(" ").filter((word) => word.length > 2)
}

function textSimilarity(a: string, b: string) {
  const aWords = new Set(words(a))
  const bWords = new Set(words(b))
  if (!aWords.size || !bWords.size) return 0
  let intersection = 0
  for (const word of aWords) {
    if (bWords.has(word)) intersection += 1
  }
  return intersection / Math.min(aWords.size, bWords.size)
}

function hasCorruptText(value: string) {
  const text = normalizeText(value)
  if (!text) return true
  if (/[�]{1,}|<\|[^|]*\|>|```|\\uFFFD/i.test(text)) return true
  if (/([^\p{L}\p{N}\s])\1{5,}/u.test(text)) return true
  if (/(\b\w{1,4}\b)(?:\s+\1){4,}/iu.test(text)) return true

  const lettersAndNumbers = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  const symbols = (text.match(/[^\p{L}\p{N}\s.,;:!?¿¡()[\]{}'"%/-]/gu) ?? []).length
  if (text.length >= 18 && lettersAndNumbers / text.length < 0.45) return true
  return text.length >= 24 && symbols / text.length > 0.25
}

function isGenericText(value: string) {
  const key = compactKey(value)
  if (!key) return true
  if (words(value).length < 4) return true

  const genericPatterns = [
    /^buen trabajo$/,
    /^excelente$/,
    /^sigue practicando$/,
    /^repasa mas$/,
    /^continua estudiando$/,
    /^vas bien$/,
    /^puedes mejorar$/,
    /^revisa los temas$/,
  ]

  return genericPatterns.some((pattern) => pattern.test(key))
}

function dedupeStrings(items: string[], corrections: string[], label: string) {
  const accepted: string[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const text = normalizeText(String(item ?? ""))
    const key = compactKey(text)
    if (!text) {
      corrections.push(`${label}: se elimino un item vacio`)
      continue
    }
    if (hasCorruptText(text)) {
      corrections.push(`${label}: se elimino texto corrupto`)
      continue
    }
    if (seen.has(key) || accepted.some((existing) => textSimilarity(existing, text) >= 0.82)) {
      corrections.push(`${label}: se elimino un item repetido o redundante`)
      continue
    }
    seen.add(key)
    accepted.push(text)
  }

  return accepted
}

function expectedPerformanceLevel(score: number): IntelligentFeedback["performanceLevel"] {
  if (score >= 80) return "high"
  if (score >= 60) return "medium"
  return "low"
}

function questionFallback(data: AttemptForFeedback) {
  return fallbackFeedback(data).questionFeedback
}

function sanitizeAndValidateFeedback(
  input: IntelligentFeedback,
  data: AttemptForFeedback
): FeedbackQualityResult {
  const errors: string[] = []
  const corrections: string[] = []
  const fallback = fallbackFeedback(data)
  const missed = data.questions.filter((question) => !question.correct)
  const expectedLevel = expectedPerformanceLevel(data.attempt.score)

  let summary = normalizeText(input.summary)
  if (!summary || hasCorruptText(summary) || isGenericText(summary)) {
    errors.push("summary vacio, corrupto o demasiado generico")
    summary = fallback.summary
    corrections.push("summary reemplazado por fallback deterministico")
  }

  const performanceLevel = input.performanceLevel === expectedLevel ? input.performanceLevel : expectedLevel
  if (input.performanceLevel !== expectedLevel) {
    errors.push(`performanceLevel incoherente con score ${Math.round(data.attempt.score)}`)
    corrections.push("performanceLevel ajustado al score")
  }

  let strengths = dedupeStrings(input.strengths, corrections, "strengths")
  if (!strengths.length && data.questions.some((question) => question.correct)) {
    errors.push("strengths vacio pese a respuestas correctas")
    strengths = fallback.strengths
    corrections.push("strengths completado con fallback")
  }

  const weaknesses = input.weaknesses
    .map((weakness) => ({
      topic: normalizeText(weakness.topic),
      evidence: normalizeText(weakness.evidence),
      recommendation: normalizeText(weakness.recommendation),
    }))
    .filter((weakness) => {
      const valid =
        Boolean(weakness.topic) &&
        !hasCorruptText(weakness.topic) &&
        Boolean(weakness.evidence) &&
        !hasCorruptText(weakness.evidence) &&
        !isGenericText(weakness.evidence) &&
        Boolean(weakness.recommendation) &&
        !hasCorruptText(weakness.recommendation) &&
        !isGenericText(weakness.recommendation)
      if (!valid) corrections.push("weaknesses: se elimino una debilidad vacia, corrupta o generica")
      return valid
    })
    .filter((weakness, index, all) => {
      const current = `${weakness.topic} ${weakness.evidence} ${weakness.recommendation}`
      const duplicateIndex = all.findIndex((item) => {
        const candidate = `${item.topic} ${item.evidence} ${item.recommendation}`
        return textSimilarity(current, candidate) >= 0.82
      })
      const unique = duplicateIndex === index
      if (!unique) corrections.push("weaknesses: se elimino una debilidad repetida o redundante")
      return unique
    })

  let safeWeaknesses = weaknesses
  if (!safeWeaknesses.length && missed.length) {
    errors.push("weaknesses vacio pese a respuestas incorrectas")
    safeWeaknesses = fallback.weaknesses
    corrections.push("weaknesses completado con fallback")
  }

  const fallbackByQuestion = new Map(questionFallback(data).map((item) => [item.questionId, item] as const))
  const inputByQuestion = new Map(input.questionFeedback.map((item) => [item.questionId, item] as const))
  const repeatedQuestionFeedback = new Set<string>()
  const questionFeedbackKeys = input.questionFeedback.map((item) =>
    compactKey(`${item.errorExplanation} ${item.correctConcept} ${item.practiceTip}`)
  )
  questionFeedbackKeys.forEach((key, index) => {
    if (words(key).length >= 8 && questionFeedbackKeys.indexOf(key) !== index) {
      repeatedQuestionFeedback.add(key)
    }
  })

  const questionFeedback = data.questions.map((question) => {
    const item = inputByQuestion.get(question.id)
    const fallbackItem = fallbackByQuestion.get(question.id)
    if (!item || !fallbackItem) {
      errors.push(`questionFeedback faltante para pregunta ${question.id}`)
      return fallbackItem ?? {
        questionId: question.id,
        wasCorrect: question.correct,
        errorExplanation: question.correct ? "Respuesta correcta." : "Revisa la explicacion de esta pregunta.",
        correctConcept: question.explanation || "Compara tu respuesta con la opcion correcta.",
        practiceTip: "Practica una pregunta similar antes de avanzar.",
      }
    }

    const errorExplanation = normalizeText(item.errorExplanation)
    const correctConcept = normalizeText(item.correctConcept)
    const practiceTip = normalizeText(item.practiceTip)
    const fields = [errorExplanation, correctConcept, practiceTip]
    const invalidText = fields.some((field) => !field || hasCorruptText(field) || isGenericText(field))
    const correctMismatch = item.wasCorrect !== question.correct
    const incorrectLooksCorrect =
      !question.correct && compactKey(errorExplanation).includes("respuesta correcta") && words(errorExplanation).length <= 5
    const repeatedText = repeatedQuestionFeedback.has(compactKey(`${errorExplanation} ${correctConcept} ${practiceTip}`))

    if (invalidText || correctMismatch || incorrectLooksCorrect || repeatedText) {
      errors.push(`questionFeedback invalido para pregunta ${question.id}`)
      corrections.push("questionFeedback reemplazado por fallback en una pregunta")
      return fallbackItem
    }

    return {
      questionId: question.id,
      wasCorrect: question.correct,
      errorExplanation,
      correctConcept,
      practiceTip,
    }
  })

  const duplicateQuestionIds = input.questionFeedback.length !== new Set(input.questionFeedback.map((item) => item.questionId)).size
  if (duplicateQuestionIds) {
    errors.push("questionFeedback contiene ids repetidos")
    corrections.push("questionFeedback deduplicado por pregunta real")
  }

  let recommendedPractice = dedupeStrings(input.recommendedPractice, corrections, "recommendedPractice")
  if (!recommendedPractice.length) {
    errors.push("recommendedPractice vacio o invalido")
    recommendedPractice = fallback.recommendedPractice
    corrections.push("recommendedPractice completado con fallback")
  }

  const nextQuizSuggestions = input.nextQuizSuggestions
    .map((suggestion) => ({
      title: normalizeText(suggestion.title),
      topic: normalizeText(suggestion.topic),
      difficulty: suggestion.difficulty,
      reason: normalizeText(suggestion.reason),
    }))
    .filter((suggestion) => {
      const valid =
        Boolean(suggestion.title) &&
        !hasCorruptText(suggestion.title) &&
        Boolean(suggestion.topic) &&
        !hasCorruptText(suggestion.topic) &&
        Boolean(suggestion.reason) &&
        !hasCorruptText(suggestion.reason) &&
        !isGenericText(suggestion.reason)
      if (!valid) corrections.push("nextQuizSuggestions: se elimino una sugerencia vacia, corrupta o generica")
      return valid
    })
    .filter((suggestion, index, all) => {
      const duplicateIndex = all.findIndex((item) =>
        textSimilarity(`${item.title} ${item.topic}`, `${suggestion.title} ${suggestion.topic}`) >= 0.86
      )
      const unique = duplicateIndex === index
      if (!unique) corrections.push("nextQuizSuggestions: se elimino una sugerencia repetida")
      return unique
    })

  let safeNextQuizSuggestions = nextQuizSuggestions
  if (!safeNextQuizSuggestions.length) {
    errors.push("nextQuizSuggestions vacio o invalido")
    safeNextQuizSuggestions = fallback.nextQuizSuggestions
    corrections.push("nextQuizSuggestions completado con fallback")
  }

  const feedback = IntelligentFeedbackSchema.parse({
    summary,
    performanceLevel,
    strengths,
    weaknesses: safeWeaknesses,
    questionFeedback,
    recommendedPractice,
    nextQuizSuggestions: safeNextQuizSuggestions,
  })

  return { feedback, errors: Array.from(new Set(errors)), corrections }
}

function buildPrompt(data: AttemptForFeedback, previousErrors: string[] = []) {
  const payload = buildPedagogicalPayload(data)

  return `Eres un tutor pedagogico experto. Analiza el intento de un estudiante en un quiz.

Objetivo:
- Detectar debilidades por tema, habilidad o tipo de pregunta.
- Explicar errores de forma clara y respetuosa.
- Recomendar practica adicional.
- Generar feedback personalizado, accionable y breve.

Reglas:
- Responde EXCLUSIVAMENTE con JSON valido, sin markdown ni texto extra.
- No inventes datos fuera del quiz.
- Si no puedes inferir un tema especifico, usa la categoria del quiz.
- Para respuestas correctas, explica brevemente que habilidad demostro.
- Para errores, explica el concepto correcto sin revelar informacion que no este en los datos.
- Basa todo el feedback en score, respuestas seleccionadas, respuestas correctas y explicaciones del quiz.
- Evita frases genericas como "sigue practicando" si no incluyen una accion concreta.
- No repitas la misma idea con otras palabras entre campos o items.
- No uses caracteres aleatorios, placeholders, markdown, simbolos decorativos ni texto corrupto.
- Genera contenido breve y confiable: si hay duda, usa una recomendacion concreta basada en las preguntas falladas.
- Cada item de questionFeedback debe corresponder a una pregunta real y mantener wasCorrect igual al dato de entrada.

Calidad esperada:
- summary: diagnostico corto con resultado y enfoque principal de mejora.
- strengths: habilidades demostradas solo cuando existan respuestas correctas.
- weaknesses: debilidades evidenciadas por errores; deja vacio solo si no hubo errores.
- questionFeedback: analisis por pregunta, con errorExplanation pedagogico, correctConcept y practiceTip accionable.
- recommendedPractice: practicas relacionadas con errores o consolidacion del desempeno.
- nextQuizSuggestions: sugerencias conectadas con debilidades o categoria del quiz.
${previousErrors.length ? `\nCorrige estos problemas detectados en la respuesta anterior:\n${previousErrors.map((error) => `- ${error}`).join("\n")}\n` : ""}

Formato exacto:
{
  "summary": "resumen general",
  "performanceLevel": "low" | "medium" | "high",
  "strengths": ["fortaleza concreta"],
  "weaknesses": [
    {
      "topic": "tema o habilidad",
      "evidence": "evidencia desde el intento",
      "recommendation": "accion concreta"
    }
  ],
  "questionFeedback": [
    {
      "questionId": "id",
      "wasCorrect": true,
      "errorExplanation": "explicacion breve",
      "correctConcept": "concepto correcto",
      "practiceTip": "micro practica"
    }
  ],
  "recommendedPractice": ["actividad recomendada"],
  "nextQuizSuggestions": [
    {
      "title": "titulo sugerido",
      "topic": "tema",
      "difficulty": "easy" | "medium" | "hard",
      "reason": "por que conviene"
    }
  ]
}

Datos del intento:
${JSON.stringify(payload, null, 2)}`
}

async function requestGemmaFeedback(prompt: string) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), GEMMA_TIMEOUT_MS)
  try {
    const res = await fetch(`${GEMMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEMMA_MODEL, prompt, stream: false, format: "json" }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      throw new Error(`Gemma feedback error: ${res.status}`)
    }

    const response = await res.json()
    return String(response?.response ?? "")
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateIntelligentFeedback(data: AttemptForFeedback): Promise<{
  feedback: IntelligentFeedback
  raw: unknown
  fallback: boolean
}> {
  const rawAttempts: RawAttempt[] = []
  let previousErrors: string[] = []

  try {
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const prompt = buildPrompt(data, previousErrors)
      const rawText = await requestGemmaFeedback(prompt)
      const parsed = JSON.parse(cleanJsonResponse(rawText))
      const shaped = IntelligentFeedbackSchema.parse(parsed)
      const quality = sanitizeAndValidateFeedback(shaped, data)

      rawAttempts.push({
        attempt,
        parsed,
        errors: quality.errors,
        corrections: quality.corrections,
      })

      if (!quality.errors.length) {
        return { feedback: quality.feedback, raw: { attempts: rawAttempts }, fallback: false }
      }

      previousErrors = quality.errors
    }

    const last = rawAttempts[rawAttempts.length - 1]
    if (last?.parsed) {
      const shaped = IntelligentFeedbackSchema.parse(last.parsed)
      const quality = sanitizeAndValidateFeedback(shaped, data)
      return {
        feedback: quality.feedback,
        raw: { attempts: rawAttempts, finalCorrections: quality.corrections },
        fallback: false,
      }
    }

    throw new Error("No se pudo generar feedback valido")
  } catch (error) {
    console.error("[ai-feedback] Gemma failed, using deterministic fallback:", error)
    const feedback = fallbackFeedback(data)
    return {
      feedback,
      raw: {
        error: error instanceof Error ? error.message : String(error),
        attempts: rawAttempts,
        feedback,
      },
      fallback: true,
    }
  }
}
