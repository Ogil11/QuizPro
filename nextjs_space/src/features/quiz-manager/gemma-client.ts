// Gemma via Ollama - generacion de preguntas con fallback a Abacus LLM API.

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
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma4:e4b"

function trimContext(context?: string) {
  if (!context) return ""
  return context
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, 12000)
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

Usa el contexto anterior como fuente principal. Si el contexto no contiene suficiente informacion para una pregunta, genera una pregunta conceptual claramente relacionada con el tema, sin inventar datos especificos no presentes en el contexto.
`
    : ""

  return `Genera ${count} preguntas de quiz en ESPANOL sobre el tema: "${topic}".
Dificultad: ${difficulty}. Tipos permitidos: ${types.join(", ")}.
${contextBlock}
Responde EXCLUSIVAMENTE con un JSON valido (sin markdown, sin texto extra) con esta forma:
{
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
- Cada pregunta debe ser respondible desde el contexto cuando haya contexto disponible.
- Evita preguntas ambiguas o que dependan de opiniones.`
}

async function tryGemma(prompt: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(`${GEMMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEMMA_MODEL, prompt, stream: false, format: "json" }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json()
    return data?.response ?? null
  } catch {
    return null
  }
}

async function tryAbacus(prompt: string): Promise<string | null> {
  const key = process.env.ABACUSAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2500,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

function normalizeQuestion(q: any): GeneratedQuestion {
  const type = ["single", "multiple", "truefalse"].includes(q?.type) ? q.type : "single"
  const options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : []
  const correctAnswers = Array.isArray(q?.correctAnswers)
    ? q.correctAnswers.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0)
    : []

  return {
    type,
    text: String(q?.text ?? ""),
    options,
    correctAnswers,
    explanation: q?.explanation ? String(q.explanation) : undefined,
  }
}

export async function generateQuestions(
  topic: string,
  count: number,
  difficulty: string = "medium",
  types: string[] = ["single", "multiple", "truefalse"],
  options: GenerateQuestionsOptions = {}
): Promise<GeneratedQuestion[]> {
  const prompt = buildPrompt(topic, count, difficulty, types, options)
  let raw = await tryGemma(prompt)
  if (!raw) raw = await tryAbacus(prompt)
  if (!raw) throw new Error("No se pudo generar preguntas (Gemma y fallback no disponibles)")

  raw = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const parsed = JSON.parse(raw)
  const arr = Array.isArray(parsed?.questions) ? parsed.questions : []
  return arr.map(normalizeQuestion).filter((q: GeneratedQuestion) => {
    if (!q.text || q.options.length === 0 || q.correctAnswers.length === 0) return false
    return q.correctAnswers.every((idx) => idx < q.options.length)
  })
}
