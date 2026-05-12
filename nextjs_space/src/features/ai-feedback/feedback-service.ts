// Servicio de feedback IA - Genera retroalimentación personalizada con Gemma 4
// Analiza intentos de quiz para detectar debilidades y recomendar areas de estudio

export interface AnswerDetail {
  questionId: string
  questionText: string
  selected: number[]
  correct: boolean
  timeMs: number
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

export interface QuizAttemptData {
  id: string
  score: number
  correct: number
  total: number
  durationSec: number
  answers: AnswerDetail[]
  createdAt: string
}

export interface WeakArea {
  topic: string
  questions: number
  accuracy: number
  avgTimeMs: number
}

export interface FeedbackResult {
  success: boolean
  content: string
  topics: WeakArea[]
  score: number
  attemptId: string
}

// Analiza un intento y genera feedback pedagógico
export async function generateFeedback(
  attempt: QuizAttemptData,
  quizContext?: { name: string; category: string; questions: any[] }
): Promise<FeedbackResult> {
  const { correct, total, answers, score } = attempt
  const accuracy = total > 0 ? (correct / total) * 100 : 0

  // Detectar áreas débiles
  const weakAreas = detectWeakAreas(answers)

  // Detectar preguntas respondidas incorrectamente
  const incorrectAnswers = answers.filter((a) => !a.correct)

  // Construir prompt para Gemma
  const prompt = buildFeedbackPrompt({
    score,
    accuracy,
    correct,
    total,
    durationSec: attempt.durationSec,
    weakAreas,
    incorrectAnswers,
    quizContext,
  })

  // Intentar generar feedback con IA
  let feedbackContent = ""
  try {
   feedbackContent = await Promise.race([
  callGemmaForFeedback(prompt),
  new Promise<string>((resolve) =>
    setTimeout(() => resolve(""), 15000)
  ),
])
  } catch (gemmaErr) {
    console.warn("[generateFeedback] Gemma no disponible, intentando Abacus:", gemmaErr)
    // Fallback a Abacus AI
    try {
      feedbackContent = await callAbacusForFeedback(prompt) ?? ""
    } catch {
      // Silencioso
    }
    // Si ambos fallan, usar fallback básico
    if (!feedbackContent) {
      feedbackContent = generateFallbackFeedback(accuracy, weakAreas, correct, total)
    }
  }

  return {
    success: true,
    content: feedbackContent,
    topics: weakAreas,
    score,
    attemptId: attempt.id,
  }
}

function detectWeakAreas(answers: AnswerDetail[]): WeakArea[] {
  // Agrupa preguntas por patrones en el texto (simplificado)
  // En una versión más avanzada, se podrían usar categorías o tags
  const areas: Map<string, { correct: number; total: number; timeMs: number }> = new Map()

  for (const answer of answers) {
    // Extraer "tema" basándose en palabras clave del texto
    const words = answer.questionText.toLowerCase().split(/\s+/)
    const significantWords = words.filter(
      (w) => w.length > 4 && !["sobre", "entre", "como", "cuando", "donde", "porque", "cual", "tiene", "puede"].includes(w)
    )

    // Usar las primeras 2-3 palabras significativas como identificador de tema
    const topicKey = significantWords.slice(0, 2).join(" ") || "general"

    if (!areas.has(topicKey)) {
      areas.set(topicKey, { correct: 0, total: 0, timeMs: 0 })
    }
    const area = areas.get(topicKey)!
    area.total++
    if (answer.correct) area.correct++
    area.timeMs += answer.timeMs
  }

  return Array.from(areas.entries())
    .map(([topic, data]) => ({
      topic,
      questions: data.total,
      accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
      avgTimeMs: data.total > 0 ? data.timeMs / data.total : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy) // Más débiles primero
}

interface FeedbackPromptParams {
  score: number
  accuracy: number
  correct: number
  total: number
  durationSec: number
  weakAreas: WeakArea[]
  incorrectAnswers: AnswerDetail[]
  quizContext?: { name: string; category: string; questions: any[] }
}

function buildFeedbackPrompt(params: FeedbackPromptParams): string {
  const { score, accuracy, correct, total, durationSec, weakAreas, incorrectAnswers, quizContext } = params

  const incorrectDetails = incorrectAnswers
    .map((a, i) => {
      return `Pregunta: ${a.questionText}
Tus respuestas: ${a.selected.map((idx) => a.options[idx]).join(", ") || "(vacía)"}
Respuesta correcta: ${a.correctAnswers.map((idx) => a.options[idx]).join(", ")}
${a.explanation ? `Explicación: ${a.explanation}` : ""}`
    })
    .join("\n---\n")

  const weakTopics = weakAreas
    .filter((w) => w.accuracy < 70)
    .map((w) => `  - ${w.topic}: ${Math.round(w.accuracy)}% acierto (${w.questions} preg.)`)
    .join("\n")

  return `Eres un tutor pedagógico especializado. Analiza el resultado de un quiz y proporciona retroalimentación constructiva en español.

RESULTADO DEL QUIZ:
- Puntuación: ${score}/100
- Aciertos: ${correct}/${total} (${Math.round(accuracy)}%)
- Tiempo total: ${durationSec} segundos

${quizContext ? `Quiz: "${quizContext.name}" (Categoría: ${quizContext.category})` : ""}

PREGUNTAS INCORRECTAS:
${incorrectDetails || "No hay preguntas incorrectas"}

ÁREAS DÉBILES DETECTADAS:
${weakTopics || "No se detectaron áreas problemáticas significativas"}

INSTRUCCIONES:
Proporciona retroalimentación pedagógica siguiendo estos puntos:
1. Un resumen breve del desempeño general (1-2 oraciones)
2. Análisis de los errores principales (qué conceptos están fallando)
3. Áreas temáticas que necesita reforzar
4. Recomendaciones específicas de estudio
5. Un mensaje motivacional positivo

Formato: Usa markdown con encabezados (##), listas y énfasis. Sé constructivo y específico.
Tono: amigable, motivador, pedagógico.`
}

async function callGemmaForFeedback(prompt: string): Promise<string> {
  const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
  const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma:2b"

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000) // 60 segundos para feedback

  try {
    const res = await fetch(`${GEMMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) throw new Error(`Gemma respondió con estado ${res.status}`)
    const data = await res.json()
    const response = (data?.response ?? "").trim()
    if (!response) throw new Error("Gemma devolvió respuesta vacía")
    return response
  } catch (err) {
    clearTimeout(t)
    console.error("[callGemmaForFeedback] Error:", err)
    throw new Error("No se pudo conectar a Gemma")
  }
}

async function callAbacusForFeedback(prompt: string): Promise<string | null> {
  const key = process.env.ABACUSAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

function generateFallbackFeedback(
  accuracy: number,
  weakAreas: WeakArea[],
  correct: number,
  total: number
): string {
  let message = `## Tu resultado: ${correct}/${total} correctas (${Math.round(accuracy)}%)\n\n`

  if (accuracy >= 80) {
    message += `¡Excelente trabajo! Has demostrado un gran dominio del tema. `
  } else if (accuracy >= 60) {
    message += `Buen desempeño. Estás en el camino correcto, pero aún hay áreas que puedes mejorar. `
  } else if (accuracy >= 40) {
    message += `Sigue practicando. Identifica los temas que necesitas reforzar y vuelve a intentarlo. `
  } else {
    message += `No te desanimes. Repasa los conceptos básicos y vuelve a intentarlo. `
  }

  if (weakAreas.length > 0) {
    const weakest = weakAreas[0]
    message += `\n## Áreas a reforzar\n\n`
    message += `El tema "${weakest.topic}" parece necesitar más atención (${Math.round(weakest.accuracy)}% de acierto).\n\n`
  }

  message += `## Recomendaciones\n\n`
  message += `- Revisa las explicaciones de las preguntas incorrectas\n`
  message += `- Vuelve a estudiar los temas con menor puntuación\n`
  message += `- Practica con quizzes similares para consolidar el aprendizaje\n`

  return message
}
