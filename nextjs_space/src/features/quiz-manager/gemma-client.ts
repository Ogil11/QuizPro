// Gemma local mediante Ollama

export interface GeneratedQuestion {
  type: "single" | "multiple" | "truefalse"
  text: string
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

const GEMMA_URL =
  process.env.GEMMA_API_URL ??
  "http://localhost:11434"

const GEMMA_MODEL =
  process.env.GEMMA_MODEL ??
  "gemma:2b"

function buildPrompt(
  topic: string,
  count: number,
  difficulty: string,
  types: string[]
): string {

  return `
Genera ${count} preguntas de quiz EN ESPAÑOL.

Tema:
${topic}

Dificultad:
${difficulty}

Tipos permitidos:
${types.join(", ")}

IMPORTANTE:

- Devuelve SOLO JSON válido
- NO markdown
- NO texto extra
- NO explicaciones fuera del JSON

Formato EXACTO:

{
  "questions": [
    {
      "type": "single",
      "text": "Pregunta",
      "options": [
        "A",
        "B",
        "C",
        "D"
      ],
      "correctAnswers": [0],
      "explanation": "Explicación"
    }
  ]
}

REGLAS:

- single:
  - EXACTAMENTE 4 opciones
  - SOLO 1 correcta

- multiple:
  - EXACTAMENTE 4 opciones
  - 2 o más correctas

- truefalse:
  - options DEBE ser:
    ["Verdadero", "Falso"]

  - SOLO una correcta

- correctAnswers usa índices base 0
`
}

async function tryGemma(
  prompt: string
): Promise<string | null> {

  try {

    const controller = new AbortController()

    const timeout = setTimeout(() => {
      controller.abort()
    }, 3000000)

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
        }),

        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    if (!response.ok) {

      const errorText = await response.text()

      console.error(
        "Error Ollama:",
        errorText
      )

      return null
    }

    const data = await response.json()

    return data?.response ?? null

  } catch (error) {

    console.error(
      "Error conectando con Gemma:",
      error
    )

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
    ? q.correctAnswers.map((n: any) => Number(n))
    : [0]

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
  ]

): Promise<GeneratedQuestion[]> {

  const prompt = buildPrompt(
    topic,
    count,
    difficulty,
    types
  )

  const raw = await tryGemma(prompt)

  if (!raw) {
    throw new Error(
      "Gemma local no está disponible"
    )
  }

  try {

    const cleaned = raw
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)

    const questions = Array.isArray(
      parsed?.questions
    )
      ? parsed.questions
      : []

    return questions.map(normalizeQuestion)

  } catch (error) {

    console.error(
      "Error parseando JSON:",
      error
    )

    console.error(
      "Respuesta recibida:",
      raw
    )

    throw new Error(
      "Gemma devolvió un JSON inválido"
    )
  }
}