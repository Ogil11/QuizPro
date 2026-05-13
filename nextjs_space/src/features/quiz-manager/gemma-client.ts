import { validateQuestions } from "./validators"

import {
  safeJsonParse
} from "./json-utils"

import {
  postProcessQuestions
} from "./post-processing"

// Gemma via Ollama - generación de preguntas educativas
// con soporte para contexto RAG y validaciones robustas

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

const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma:2b"

// Limpia y valida el contexto para evitar problemas de encoding
function trimContext(context?: string): string {
  if (!context) return ""
  return context
    .replace(/\u0000/g, "") // Eliminar null bytes
    .replace(/\r\n/g, "\n") // Normalizar saltos de línea
    .replace(/\n{4,}/g, "\n\n") // Limitar espacios en blanco
    .trim()
    .slice(0, 12000) // Limitar tamaño máximo
}

function buildPrompt(
  topic: string,
  count: number,
  difficulty: string,
  types: string[],
  options: GenerateQuestionsOptions = {}
): string {
  const context = trimContext(options.context)
  const contextBlock = context
    ? `
Contexto de documentos del usuario:
"""
${context}
"""

Usa el contexto anterior como fuente principal. Si el contexto no contiene suficiente información para una pregunta, genera una pregunta conceptual claramente relacionada con el tema, sin inventar datos específicos no presentes en el contexto.
`
    : ""

  return `Genera ${count} preguntas de quiz en ESPAÑOL sobre el tema: "${topic}".
Dificultad: ${difficulty}. Tipos permitidos: ${types.join(", ")}.
${contextBlock}
Eres un generador profesional de preguntas educativas.

OBJETIVO:
Genera preguntas educativas de alta calidad, claras, variadas y útiles para aprendizaje real.

REGLAS DE CALIDAD:
- Evita preguntas ambiguas
- Evita preguntas triviales
- Evita repetir estructuras
- Varía la redacción entre preguntas
- No repitas respuestas correctas
- Las preguntas deben sonar naturales
- No uses frases como: "Según el texto", "La opción correcta es", "Todas las anteriores"

DISTRACTORES:
Las opciones incorrectas deben:
- ser plausibles
- pertenecer al mismo tema
- tener longitud similar
- no ser absurdas
- no revelar fácilmente la respuesta correcta

EXPLICACIONES:
- Explica por qué la respuesta correcta es correcta
- Sé claro y breve
- Máximo 3 frases
- La explicación debe ayudar al aprendizaje

DIFICULTAD:
easy: preguntas directas, memoria básica, definiciones simples, reconocimiento básico
medium: comprensión, comparación, aplicación de conceptos, relaciones entre ideas
hard: razonamiento, análisis, inferencia, aplicación avanzada, múltiples conceptos combinados

IMPORTANTE:
- Devuelve EXCLUSIVAMENTE JSON válido (sin markdown, sin texto extra, sin comentarios)
- NO uses comillas triples o bloques de código

Formato EXACTO:
{
  "questions": [
    {
      "type": "single",
      "text": "Pregunta",
      "options": ["A", "B", "C", "D"],
      "correctAnswers": [0],
      "explanation": "Explicación"
    }
  ]
}

REGLAS FINALES:
- single: EXACTAMENTE 4 opciones, SOLO 1 correcta
- multiple: EXACTAMENTE 4 opciones, 2-3 correctas
- truefalse: options DEBE ser ["Verdadero","Falso"], SOLO 1 correcta
- correctAnswers usa índices base 0
- Todas las preguntas deben tener texto
- Todas las opciones deben ser diferentes
- No repitas preguntas o sus opciones
- No dejes campos vacíos
- explanation es obligatorio`
}

async function tryGemma(
  prompt: string
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 20000) // Timeout: 20s

    const response = await fetch(
      `${GEMMA_URL}/api/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GEMMA_MODEL,
          prompt,
          stream: false,
          format: "json", // Forzar formato JSON desde Ollama
        }),
        signal: controller.signal,
      }
    )

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

function normalizeQuestion(q: any): GeneratedQuestion {
  let type =
    q?.type === "multiple" ||
    q?.type === "truefalse"
      ? q.type
      : "single"

  let options = Array.isArray(q?.options)
    ? q.options.map((o: any) => String(o))
    : []

  let correctAnswers = Array.isArray(q?.correctAnswers)
    ? q.correctAnswers
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 0) // Validar índices válidos
    : []

  // FIX TRUE/FALSE
  if (type === "truefalse") {
    options = ["Verdadero", "Falso"]

    if (
      correctAnswers.length === 0 ||
      correctAnswers[0] > 1
    ) {
      correctAnswers = [0]
    }
  }

  // FIX SINGLE
  if (type === "single") {
    while (options.length < 4) {
      options.push(`Opción ${options.length + 1}`)
    }

    options = options.slice(0, 4)

    correctAnswers = [
      correctAnswers[0] ?? 0
    ]
  }

  // FIX MULTIPLE
  if (type === "multiple") {
    while (options.length < 4) {
      options.push(`Opción ${options.length + 1}`)
    }

    options = options.slice(0, 4)

    if (correctAnswers.length < 2) {
      correctAnswers = [0, 1]
    }
  }

  return {
    type,
    text: String(q?.text ?? ""),
    options,
    correctAnswers,
    explanation:
      q?.explanation
        ? String(q.explanation)
        : undefined,
  }
}

export async function generateQuestions(
  topic: string,
  count: number,
  difficulty: string = "medium",
  types: string[] = [
    "single",
    "multiple",
    "truefalse",
  ],
  options: GenerateQuestionsOptions = {}
): Promise<GeneratedQuestion[]> {

  const MAX_RETRIES = 3
  let lastError: unknown = null

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `[gemma] generation attempt ${attempt}`
      )

      const prompt = buildPrompt(
        topic,
        count,
        difficulty,
        types,
        options
      )

      const raw = await tryGemma(prompt)

      if (!raw) {
        throw new Error(
          "Gemma local no está disponible"
        )
      }

      // Limpiar markdown si existe
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim()

      const parsed = safeJsonParse(cleaned)

      if (!parsed) {
        throw new Error(
          "JSON inválido después de parseo"
        )
      }

      const questions = Array.isArray(
        parsed?.questions
      )
        ? parsed.questions
        : []

      const normalized =
        questions.map(normalizeQuestion)

      const validated =
        validateQuestions(normalized)

      console.log(
        `[gemma] validated questions: ${validated.length}/${count}`
      )

      // ACCEPT IF ENOUGH QUESTIONS (70% del objetivo)
      if (
        validated.length >=
        Math.max(1, count * 0.7)
      ) {
        const finalQuestions =
          postProcessQuestions(
            validated
          )

        return finalQuestions.slice(0, count)
      }

      throw new Error(
        `Muy pocas preguntas válidas (${validated.length}/${count})`
      )

    } catch (error) {
      lastError = error

      console.error(
        `[gemma] attempt ${attempt} failed:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "No se pudieron generar preguntas válidas después de 3 intentos"
  )
}