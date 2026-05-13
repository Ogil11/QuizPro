import { IntelligentFeedbackSchema, type AttemptForFeedback, type IntelligentFeedback } from "./types"
import { buildPedagogicalPayload } from "./analyze-attempt"

const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma4:e4b"

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

function buildPrompt(data: AttemptForFeedback) {
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

export async function generateIntelligentFeedback(data: AttemptForFeedback): Promise<{
  feedback: IntelligentFeedback
  raw: unknown
  fallback: boolean
}> {
  const prompt = buildPrompt(data)

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 30000)
    const res = await fetch(`${GEMMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEMMA_MODEL, prompt, stream: false, format: "json" }),
      signal: ctrl.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`Gemma feedback error: ${res.status}`)
    }

    const response = await res.json()
    const rawText = String(response?.response ?? "")
    const parsed = JSON.parse(cleanJsonResponse(rawText))
    const feedback = IntelligentFeedbackSchema.parse(parsed)

    return { feedback, raw: parsed, fallback: false }
  } catch (error) {
    console.error("[ai-feedback] Gemma failed, using deterministic fallback:", error)
    const feedback = fallbackFeedback(data)
    return { feedback, raw: { error: error instanceof Error ? error.message : String(error), feedback }, fallback: true }
  }
}
