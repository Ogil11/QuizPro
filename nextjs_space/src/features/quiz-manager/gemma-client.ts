// Gemma 4 via Ollama - generación de preguntas (con fallback a Abacus LLM API)
// Si Ollama local no está disponible, hacemos fallback a la Abacus Chat Completions API.

export interface GeneratedQuestion {
  type: "single" | "multiple" | "truefalse"
  text: string
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

const GEMMA_URL = process.env.GEMMA_API_URL ?? "http://localhost:11434"
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma2:4b"

function buildPrompt(topic: string, count: number, difficulty: string, types: string[]): string {
  return `Genera ${count} preguntas de quiz en ESPAÑOL sobre el tema: "${topic}".
Dificultad: ${difficulty}. Tipos permitidos: ${types.join(", ")}.

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin texto extra) con esta forma:
{
  "questions": [
    {
      "type": "single" | "multiple" | "truefalse",
      "text": "texto de la pregunta",
      "options": ["opción 1", "opción 2", ...],
      "correctAnswers": [0],
      "explanation": "breve explicación"
    }
  ]
}

Reglas:
- single: 4 opciones, 1 índice correcto.
- multiple: 4 opciones, 2-3 índices correctos.
- truefalse: opciones ["Verdadero","Falso"], 1 índice correcto.
- Los índices son base 0.`
}

async function tryGemma(prompt: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
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

export async function generateQuestions(
  topic: string,
  count: number,
  difficulty: string = "medium",
  types: string[] = ["single", "multiple", "truefalse"]
): Promise<GeneratedQuestion[]> {
  const prompt = buildPrompt(topic, count, difficulty, types)
  let raw = await tryGemma(prompt)
  if (!raw) raw = await tryAbacus(prompt)
  if (!raw) throw new Error("No se pudo generar preguntas (Gemma y fallback no disponibles)")

  // Strip code fences just in case
  raw = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const parsed = JSON.parse(raw)
  const arr = Array.isArray(parsed?.questions) ? parsed.questions : []
  return arr.map((q: any) => ({
    type: q?.type ?? "single",
    text: String(q?.text ?? ""),
    options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [],
    correctAnswers: Array.isArray(q?.correctAnswers) ? q.correctAnswers.map((n: any) => Number(n)) : [],
    explanation: q?.explanation ? String(q.explanation) : undefined,
  }))
}
