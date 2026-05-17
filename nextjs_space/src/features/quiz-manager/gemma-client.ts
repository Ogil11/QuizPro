// gemma-client.ts

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

export let lastDetectedCategory =
  "General"

function difficultyInstructions(
  difficulty: string
): string {

  switch (difficulty) {

    case "easy":
      return `
- Preguntas fáciles
- Conceptos básicos
- Lenguaje sencillo
- Nivel escolar
- Evita tecnicismos
`

    case "hard":
      return `
- Preguntas difíciles
- Conceptos avanzados
- Nivel universitario
- Usa razonamiento
- Incluye teoría profunda
`

    default:
      return `
- Preguntas intermedias
- Nivel medio
- Mezcla teoría y comprensión
`
  }
}

function buildPrompt(
  topic: string,
  count: number,
  difficulty: string,
  types: string[],
  ragContext?: string
): string {

  return `
Genera EXACTAMENTE ${count} preguntas de quiz EN ESPAÑOL.

Tema:
${topic}

Dificultad:
${difficulty}

${difficultyInstructions(
  difficulty
)}

Tipos permitidos:
${types.join(", ")}

${
  ragContext
    ? `
Contexto RAG:
${ragContext}
`
    : ""
}

IMPORTANTE:

- Devuelve SOLO JSON válido
- NO markdown
- NO comentarios
- NO texto adicional
- Genera EXACTAMENTE ${count} preguntas
- NO uses "General"
- NO uses "Categoría detectada"
- Usa una categoría específica

Formato EXACTO:

{
  "category": "Física",
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
  - options:
    ["Verdadero", "Falso"]

- correctAnswers usa índices base 0
`
}

async function tryGemma(
  prompt: string
): Promise<string | null> {

  try {

    const controller =
      new AbortController()

    const timeout =
      setTimeout(() => {
        controller.abort()
      }, 300000)

    const response =
      await fetch(
        `${GEMMA_URL}/api/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
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

      const errorText =
        await response.text()

      console.error(
        "Error Ollama:",
        errorText
      )

      return null
    }

    const data =
      await response.json()

    return data?.response ?? null

  } catch (error) {

    console.error(
      "Error conectando con Gemma:",
      error
    )

    return null
  }
}

function normalizeQuestion(
  q: any
): GeneratedQuestion {

  let type =
    q?.type === "multiple" ||
    q?.type === "truefalse"
      ? q.type
      : "single"

  let options =
    Array.isArray(q?.options)
      ? q.options.map(
          (o: any) =>
            String(o ?? "").trim()
        )
      : []

  options =
    options.filter(
      (o: string) =>
        o.length > 0
    )

  let correctAnswers =
    Array.isArray(
      q?.correctAnswers
    )
      ? q.correctAnswers
          .map((n: any) =>
            Number(n)
          )
          .filter(
            (n: number) =>
              !Number.isNaN(n)
          )
      : [0]

  if (type === "truefalse") {

    options = [
      "Verdadero",
      "Falso",
    ]

    correctAnswers = [
      correctAnswers[0] ?? 0
    ]
  }

  if (type === "single") {

    while (options.length < 4) {

      options.push(
        `Opción ${options.length + 1}`
      )
    }

    options =
      options.slice(0, 4)

    correctAnswers = [
      correctAnswers[0] ?? 0
    ]
  }

  if (type === "multiple") {

    while (options.length < 4) {

      options.push(
        `Opción ${options.length + 1}`
      )
    }

    options =
      options.slice(0, 4)

    if (
      correctAnswers.length < 2
    ) {

      correctAnswers = [0, 1]
    }
  }

  return {

    type,

    text: String(
      q?.text ?? ""
    ).trim(),

    options,

    correctAnswers,

    explanation:
      q?.explanation
        ? String(
            q.explanation
          ).trim()
        : undefined,
  }
}

function isValidQuestion(
  q: GeneratedQuestion
): boolean {

  if (!q.text.trim()) {
    return false
  }

  if (
    q.type !== "truefalse" &&
    q.options.length !== 4
  ) {
    return false
  }

  if (
    q.type === "truefalse" &&
    q.options.length !== 2
  ) {
    return false
  }

  for (const idx of q.correctAnswers) {

    if (
      idx < 0 ||
      idx >= q.options.length
    ) {
      return false
    }
  }

  const invalidWords = [
    "categoría detectada",
    "placeholder",
  ]

  const fullText =
    (
      q.text +
      " " +
      q.options.join(" ")
    ).toLowerCase()

  if (
    invalidWords.some(w =>
      fullText.includes(w)
    )
  ) {
    return false
  }

  return true
}

function extractJson(
  raw: string
): any {

  const cleaned =
    raw
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim()

  try {

    return JSON.parse(cleaned)

  } catch {}

  const first =
    cleaned.indexOf("{")

  const last =
    cleaned.lastIndexOf("}")

  if (
    first === -1 ||
    last === -1
  ) {

    throw new Error(
      "JSON no encontrado"
    )
  }

  return JSON.parse(
    cleaned.slice(
      first,
      last + 1
    )
  )
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
  ragData?: {
    context?: string
    contextSource?: string
  }

): Promise<GeneratedQuestion[]> {

  const finalQuestions:
    GeneratedQuestion[] = []

  let attempts = 0

  while (
    finalQuestions.length < count &&
    attempts < 3
  ) {

    attempts++

    const remaining =
      count -
      finalQuestions.length

    const prompt =
      buildPrompt(
        topic,
        remaining,
        difficulty,
        types,
        ragData?.context
      )

    const raw =
      await tryGemma(prompt)

    if (!raw) {
      continue
    }

    try {

      console.log(
        "RESPUESTA GEMMA:",
        raw
      )

      const parsed =
        extractJson(raw)

      const detectedCategory =
        typeof parsed?.category ===
        "string"
          ? parsed.category.trim()
          : ""

      lastDetectedCategory =

        detectedCategory &&
        detectedCategory.toLowerCase() !==
          "general" &&
        detectedCategory.toLowerCase() !==
          "categoría detectada"

          ? detectedCategory

          : topic.trim()
            ? topic.trim()
            : "Quiz IA"

      const questions =
        Array.isArray(
          parsed?.questions
        )

          ? parsed.questions
              .map(normalizeQuestion)
              .filter(isValidQuestion)

          : []

      finalQuestions.push(
        ...questions
      )

    } catch (error) {

      console.error(
        "Error parseando JSON:",
        error
      )
    }
  }

  const uniqueQuestions =
    finalQuestions.filter(
      (q, index, self) =>
        index ===
        self.findIndex(
          x =>
            x.text === q.text
        )
    )

  if (
    uniqueQuestions.length === 0
  ) {

    throw new Error(
      "Gemma no devolvió preguntas válidas"
    )
  }

  return uniqueQuestions.slice(
    0,
    count
  )
}