import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbInsert, robleDbRead } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

const QUIZ_TABLE = process.env.ROBLE_QUIZ_TABLE ?? "Quiz"
const QUESTION_TABLE = process.env.ROBLE_QUESTION_TABLE ?? "Question"
const ATTEMPT_TABLE = process.env.ROBLE_ATTEMPT_TABLE ?? "QuizAttempt"

function snake(k: string) {
  return k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
}

function val<T = any>(row: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null) return row[k] as T
    const s = snake(k)
    if (row?.[s] !== undefined && row?.[s] !== null) return row[s] as T
  }
  return undefined
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function debugLog(step: string, payload: Record<string, unknown>) {
  console.log(`[attempts:${step}]`, JSON.stringify(payload, null, 2))
}

function normalizedIds(rows: any[]) {
  return rows.map((row) => ({
    id: val(row, "id"),
    quizId: val(row, "quizId"),
    _id: val(row, "_id"),
    normalized: String(val(row, "id", "quizId", "_id") ?? ""),
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { quizId, answers, durationSec } = await req.json()
  const quizWhere = { id: quizId }
  debugLog("POST quiz read start", { quizId, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("POST quiz read result", { quizId, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })
  const quizRows = quizRes.rows ?? []
  debugLog("POST quiz normalized ids", { quizId, ids: normalizedIds(quizRows) })
  const quiz = quizRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === String(quizId))
  if (!quiz) return NextResponse.json({ error: "Quiz no encontrado", debug: { quizId, ids: normalizedIds(quizRows) } }, { status: 404 })

  const questionWhere = { quizId: String(quizId) }
  debugLog("POST questions read start", { quizId, tableName: QUESTION_TABLE, where: questionWhere })
  const questionsRes = await robleDbRead({ tableName: QUESTION_TABLE, token, where: questionWhere, orderBy: "order", orderDirection: "asc" })
  debugLog("POST questions read result", { quizId, tableName: QUESTION_TABLE, where: questionWhere, result: questionsRes })
  if (!questionsRes.success) return NextResponse.json({ error: questionsRes.error ?? "Error cargando preguntas", debug: { tableName: QUESTION_TABLE, where: questionWhere, result: questionsRes } }, { status: questionsRes.status ?? 500 })

  const questionRows = questionsRes.rows ?? []
  debugLog("POST question normalized ids", {
    quizId,
    ids: questionRows.map((row: any) => ({ id: val(row, "id"), _id: val(row, "_id"), quizId: val(row, "quizId") })),
  })
  const questions = [...questionRows].sort((a: any, b: any) => Number(val(a, "order") ?? 0) - Number(val(b, "order") ?? 0))

  let correct = 0
  const detailed = questions.map((q: any, i: number) => {
    const ans = answers?.[i] ?? { selected: [], timeMs: 0 }
    const sel: number[] = Array.isArray(ans.selected) ? [...ans.selected].sort() : []
    const truth: number[] = parseJsonArray(val(q, "correctAnswers")).map((n: any) => Number(n)).sort()
    const isCorrect = sel.length === truth.length && sel.every((v, idx) => v === truth[idx])
    if (isCorrect) correct++
    return {
      questionId: String(val(q, "id", "_id") ?? crypto.randomUUID()),
      selected: sel,
      correct: isCorrect,
      timeMs: Number(ans.timeMs) || 0,
    }
  })

  const total = questions.length
  const score = total > 0 ? (correct / total) * 100 : 0

  const now = new Date().toISOString()
  const attemptRecord = {
    userId,
    quizId: String(quizId),
    score,
    correct,
    total,
    durationSec: Number(durationSec) || 0,
    answers: detailed,
    createdAt: now,
  }
  debugLog("POST attempt insert start", { quizId, tableName: ATTEMPT_TABLE, records: [attemptRecord] })
  const insertRes = await robleDbInsert({ tableName: ATTEMPT_TABLE, token, records: [attemptRecord] })
  debugLog("POST attempt insert result", { quizId, tableName: ATTEMPT_TABLE, result: insertRes })
  if (!insertRes.success) return NextResponse.json({ error: insertRes.error ?? "Error guardando intento", debug: { tableName: ATTEMPT_TABLE, records: [attemptRecord], result: insertRes } }, { status: insertRes.status ?? 500 })

  const insertedAttempt = Array.isArray((insertRes as any)?.inserted) ? (insertRes as any).inserted[0] : undefined
  const attempt = { ...attemptRecord, id: String(val(insertedAttempt, "id", "_id") ?? crypto.randomUUID()) }
  return NextResponse.json({ attempt, detailed })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const attemptsRes = await robleDbRead({ tableName: ATTEMPT_TABLE, token, where: { userId }, orderBy: "createdAt", orderDirection: "desc" })
  if (!attemptsRes.success) return NextResponse.json({ error: attemptsRes.error ?? "Error cargando intentos" }, { status: attemptsRes.status ?? 500 })

  const quizzesRes = await robleDbRead({ tableName: QUIZ_TABLE, token })
  const quizById = new Map<string, any>()
  const quizRows = quizzesRes.success ? (quizzesRes.rows ?? []) : []
  for (const q of quizRows) {
    const id = String(val(q, "id", "quizId", "_id") ?? "")
    if (!id) continue
    quizById.set(id, {
      name: String(val(q, "name", "title") ?? "Quiz"),
      category: String(val(q, "category") ?? "general"),
      difficulty: String(val(q, "difficulty") ?? "medium"),
    })
  }

  const attemptsRows = attemptsRes.rows ?? []
  const attempts = attemptsRows
    .map((a: any) => {
      const quizId = String(val(a, "quizId") ?? "")
      return {
        id: String(val(a, "id", "_id") ?? crypto.randomUUID()),
        userId: String(val(a, "userId") ?? userId),
        quizId,
        score: Number(val(a, "score") ?? 0),
        correct: Number(val(a, "correct") ?? 0),
        total: Number(val(a, "total") ?? 0),
        durationSec: Number(val(a, "durationSec") ?? 0),
        answers: Array.isArray(val(a, "answers")) ? val(a, "answers") : [],
        createdAt: val(a, "createdAt") ?? new Date().toISOString(),
        quiz: quizById.get(quizId) ?? { name: "Quiz", category: "general", difficulty: "medium" },
      }
    })
    .sort((x: any, y: any) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
    .slice(0, 50)

  return NextResponse.json({ attempts })
}
