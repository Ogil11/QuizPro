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

function jsonText(value: unknown) {
  if (typeof value === "string") return value
  return JSON.stringify(value ?? [])
}

function mapQuiz(row: any, questionsCount: number, attemptsCount: number) {
  return {
    id: String(val(row, "id", "quizId", "_id") ?? ""),
    name: String(val(row, "name", "title") ?? ""),
    description: val<string>(row, "description") ?? null,
    category: String(val(row, "category") ?? "general"),
    difficulty: String(val(row, "difficulty") ?? "medium"),
    isPublic: Boolean(val(row, "isPublic", "public") ?? false),
    creationMode: String(val(row, "creationMode") ?? "manual"),
    creatorId: String(val(row, "creatorId", "userId", "ownerId") ?? ""),
    createdAt: val(row, "createdAt") ?? new Date().toISOString(),
    updatedAt: val(row, "updatedAt") ?? new Date().toISOString(),
    creator: { name: val(row, "creatorName") ?? null, email: val(row, "creatorEmail") ?? null },
    _count: { questions: questionsCount, attempts: attemptsCount },
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id as string | undefined
    const token = (session?.user as any)?.robleAccessToken as string | undefined
    if (!token) return NextResponse.json({ quizzes: [] })

    const url = new URL(req.url)
    const scope = url.searchParams.get("scope") ?? "all"

    const quizzesRes = await robleDbRead({ tableName: QUIZ_TABLE, token, orderBy: "createdAt", orderDirection: "desc" })
    if (!quizzesRes.success) return NextResponse.json({ error: quizzesRes.error ?? "Error cargando quizzes" }, { status: quizzesRes.status ?? 500 })

    const questionsRes = await robleDbRead({ tableName: QUESTION_TABLE, token })
    const attemptsRes = await robleDbRead({ tableName: ATTEMPT_TABLE, token })

    const questionRows = questionsRes.success ? (questionsRes.rows ?? []) : []
    const attemptRows = attemptsRes.success ? (attemptsRes.rows ?? []) : []

    const qCount = new Map<string, number>()
    for (const q of questionRows) {
      const quizId = String(val(q, "quizId", "quiz", "parentQuizId") ?? "")
      if (!quizId) continue
      qCount.set(quizId, (qCount.get(quizId) ?? 0) + 1)
    }

    const aCount = new Map<string, number>()
    for (const a of attemptRows) {
      const quizId = String(val(a, "quizId", "quiz", "parentQuizId") ?? "")
      if (!quizId) continue
      aCount.set(quizId, (aCount.get(quizId) ?? 0) + 1)
    }

    const quizzesRows = quizzesRes.rows ?? []
    const quizzes = quizzesRows
      .map((row: any) => mapQuiz(row, qCount.get(String(val(row, "id", "quizId", "_id") ?? "")) ?? 0, aCount.get(String(val(row, "id", "quizId", "_id") ?? "")) ?? 0))
      .filter((quiz: any) => {
        if (scope === "mine") return userId ? quiz.creatorId === userId : false
        if (scope === "public") return !!quiz.isPublic
        return userId ? quiz.isPublic || quiz.creatorId === userId : !!quiz.isPublic
      })

    return NextResponse.json({ quizzes })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error cargando quizzes" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const body = await req.json()
    const { name, description, category, difficulty, isPublic, creationMode, questions } = body
    if (!name || !category || !difficulty || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
    }

    const now = new Date().toISOString()
    const quizRecord = { name, description: description ?? null, category, difficulty, isPublic: !!isPublic, creationMode: creationMode ?? "manual", creatorId: userId, createdAt: now, updatedAt: now }
    const quizIns = await robleDbInsert({ tableName: QUIZ_TABLE, token, records: [quizRecord] })
    if (!quizIns.success) return NextResponse.json({ error: quizIns.error ?? "Error creando quiz" }, { status: quizIns.status ?? 500 })

    const insertedQuiz = Array.isArray((quizIns as any)?.inserted) ? (quizIns as any).inserted[0] : undefined
    const quizId = String(val(insertedQuiz, "id", "quizId", "_id") ?? body.id ?? crypto.randomUUID())

    const questionRecords = questions.map((q: any, i: number) => ({ quizId, type: q.type, text: q.text, options: jsonText(q.options), correctAnswers: jsonText(q.correctAnswers), explanation: q.explanation ?? null, order: i }))
    const qIns = await robleDbInsert({ tableName: QUESTION_TABLE, token, records: questionRecords })
    if (!qIns.success) return NextResponse.json({ error: qIns.error ?? "Error creando preguntas" }, { status: qIns.status ?? 500 })

    return NextResponse.json({ quiz: { ...quizRecord, id: quizId, questions: questionRecords } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error creando quiz" }, { status: 500 })
  }
}
