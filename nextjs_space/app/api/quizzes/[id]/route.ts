import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbDelete, robleDbInsert, robleDbRead, robleDbUpdate } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

const QUIZ_TABLE = process.env.ROBLE_QUIZ_TABLE ?? "Quiz"
const QUESTION_TABLE = process.env.ROBLE_QUESTION_TABLE ?? "Question"

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

function normalizeQuiz(quiz: any, questions: any[]) {
  return {
    id: String(val(quiz, "id", "quizId", "_id") ?? ""),
    name: String(val(quiz, "name", "title") ?? ""),
    description: val<string>(quiz, "description") ?? null,
    category: String(val(quiz, "category") ?? "general"),
    difficulty: String(val(quiz, "difficulty") ?? "medium"),
    isPublic: Boolean(val(quiz, "isPublic", "public") ?? false),
    creationMode: String(val(quiz, "creationMode") ?? "manual"),
    creatorId: String(val(quiz, "creatorId", "userId", "ownerId") ?? ""),
    questions,
    creator: { name: val(quiz, "creatorName") ?? null, email: val(quiz, "creatorEmail") ?? null },
    createdAt: val(quiz, "createdAt") ?? new Date().toISOString(),
    updatedAt: val(quiz, "updatedAt") ?? new Date().toISOString(),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: { id: params.id } })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz" }, { status: quizRes.status ?? 500 })

  const quizRows = quizRes.rows ?? []
  const quiz = quizRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!quiz) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const qRes = await robleDbRead({ tableName: QUESTION_TABLE, token, where: { quizId: params.id }, orderBy: "order", orderDirection: "asc" })
  const questionRows = qRes.success ? (qRes.rows ?? []) : []
  const questions = questionRows
    .map((qq: any) => ({
      id: String(val(qq, "id", "_id") ?? crypto.randomUUID()),
      quizId: params.id,
      type: String(val(qq, "type") ?? "single"),
      text: String(val(qq, "text") ?? ""),
      options: parseJsonArray(val(qq, "options")),
      correctAnswers: parseJsonArray(val(qq, "correctAnswers")),
      explanation: val<string>(qq, "explanation") ?? null,
      order: Number(val(qq, "order") ?? 0),
    }))
    .sort((a: any, b: any) => a.order - b.order)

  return NextResponse.json({ quiz: normalizeQuiz(quiz, questions) })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: { id: params.id } })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz" }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const creatorId = String(val(existing, "creatorId", "userId", "ownerId") ?? "")
  if (creatorId && creatorId !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

  const body = await req.json()
  const { name, description, category, difficulty, isPublic, questions } = body

  const updates: Record<string, any> = {
    name: name ?? val(existing, "name", "title") ?? "",
    description: description ?? val(existing, "description") ?? null,
    category: category ?? val(existing, "category") ?? "general",
    difficulty: difficulty ?? val(existing, "difficulty") ?? "medium",
    isPublic: typeof isPublic === "boolean" ? isPublic : Boolean(val(existing, "isPublic", "public") ?? false),
    updatedAt: new Date().toISOString(),
  }

  const upd = await robleDbUpdate({ tableName: QUIZ_TABLE, token, where: { id: params.id }, data: updates })
  if (!upd.success) return NextResponse.json({ error: upd.error ?? "Error actualizando quiz" }, { status: upd.status ?? 500 })

  if (Array.isArray(questions)) {
    const delQ = await robleDbDelete({ tableName: QUESTION_TABLE, token, where: { quizId: params.id } })
    if (!delQ.success) return NextResponse.json({ error: delQ.error ?? "Error limpiando preguntas" }, { status: delQ.status ?? 500 })

    const records = questions.map((qq: any, i: number) => ({ quizId: params.id, type: qq.type, text: qq.text, options: jsonText(qq.options), correctAnswers: jsonText(qq.correctAnswers), explanation: qq.explanation ?? null, order: i }))
    if (records.length > 0) {
      const insQ = await robleDbInsert({ tableName: QUESTION_TABLE, token, records })
      if (!insQ.success) return NextResponse.json({ error: insQ.error ?? "Error guardando preguntas" }, { status: insQ.status ?? 500 })
    }
  }

  return NextResponse.json({ quiz: { ...normalizeQuiz(existing, []), ...updates } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: { id: params.id } })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz" }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const creatorId = String(val(existing, "creatorId", "userId", "ownerId") ?? "")
  if (creatorId && creatorId !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

  const delQ = await robleDbDelete({ tableName: QUESTION_TABLE, token, where: { quizId: params.id } })
  if (!delQ.success) return NextResponse.json({ error: delQ.error ?? "Error eliminando preguntas" }, { status: delQ.status ?? 500 })
  const delQuiz = await robleDbDelete({ tableName: QUIZ_TABLE, token, where: { id: params.id } })
  if (!delQuiz.success) return NextResponse.json({ error: delQuiz.error ?? "Error eliminando quiz" }, { status: delQuiz.status ?? 500 })

  return NextResponse.json({ ok: true })
}
