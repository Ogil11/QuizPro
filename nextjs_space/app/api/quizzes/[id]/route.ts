import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbDelete, robleDbInsert, robleDbRead, robleDbUpdate } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

const QUIZ_TABLE = process.env.ROBLE_QUIZ_TABLE ?? "Quiz"
const QUESTION_TABLE = process.env.ROBLE_QUESTION_TABLE ?? "Question"

function quizPrimaryKey(id: string) {
  return { _id: id }
}

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

function debugLog(step: string, payload: Record<string, unknown>) {
  console.log(`[quiz:${step}]`, JSON.stringify(payload, null, 2))
}

function normalizedIds(rows: any[]) {
  return rows.map((row) => ({
    id: val(row, "id"),
    quizId: val(row, "quizId"),
    _id: val(row, "_id"),
    normalized: String(val(row, "id", "quizId", "_id") ?? ""),
  }))
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

  const quizWhere = quizPrimaryKey(params.id)
  debugLog("GET quiz read start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("GET quiz read result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })

  const quizRows = quizRes.rows ?? []
  debugLog("GET quiz normalized ids", { paramsId: params.id, ids: normalizedIds(quizRows) })
  const quiz = quizRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!quiz) return NextResponse.json({ error: "No encontrado", debug: { paramsId: params.id, ids: normalizedIds(quizRows) } }, { status: 404 })

  const questionWhere = { quizId: params.id }
  debugLog("GET questions read start", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere })
  const qRes = await robleDbRead({ tableName: QUESTION_TABLE, token, where: questionWhere, orderBy: "order", orderDirection: "asc" })
  debugLog("GET questions read result", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere, result: qRes })
  const questionRows = qRes.success ? (qRes.rows ?? []) : []
  debugLog("GET question normalized ids", {
    paramsId: params.id,
    ids: questionRows.map((row: any) => ({ id: val(row, "id"), _id: val(row, "_id"), quizId: val(row, "quizId") })),
  })
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

  const quizWhere = quizPrimaryKey(params.id)
  debugLog("PATCH quiz read start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("PATCH quiz read result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  debugLog("PATCH quiz normalized ids", { paramsId: params.id, ids: normalizedIds(existingRows) })
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado", debug: { paramsId: params.id, ids: normalizedIds(existingRows) } }, { status: 404 })
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

  debugLog("PATCH quiz update start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, data: updates })
  const upd = await robleDbUpdate({ tableName: QUIZ_TABLE, token, where: quizWhere, data: updates })
  debugLog("PATCH quiz update result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: upd })
  if (!upd.success) return NextResponse.json({ error: upd.error ?? "Error actualizando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: upd } }, { status: upd.status ?? 500 })

  if (Array.isArray(questions)) {
    const questionWhere = { quizId: params.id }
    debugLog("PATCH questions delete start", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere })
    const delQ = await robleDbDelete({ tableName: QUESTION_TABLE, token, where: questionWhere })
    debugLog("PATCH questions delete result", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere, result: delQ })
    if (!delQ.success) return NextResponse.json({ error: delQ.error ?? "Error limpiando preguntas", debug: { tableName: QUESTION_TABLE, where: questionWhere, result: delQ } }, { status: delQ.status ?? 500 })

    const records = questions.map((qq: any, i: number) => ({ quizId: params.id, type: qq.type, text: qq.text, options: jsonText(qq.options), correctAnswers: jsonText(qq.correctAnswers), explanation: qq.explanation ?? null, order: i }))
    if (records.length > 0) {
      debugLog("PATCH questions insert start", { paramsId: params.id, tableName: QUESTION_TABLE, records })
      const insQ = await robleDbInsert({ tableName: QUESTION_TABLE, token, records })
      debugLog("PATCH questions insert result", { paramsId: params.id, tableName: QUESTION_TABLE, result: insQ })
      if (!insQ.success) return NextResponse.json({ error: insQ.error ?? "Error guardando preguntas", debug: { tableName: QUESTION_TABLE, records, result: insQ } }, { status: insQ.status ?? 500 })
    }
  }

  return NextResponse.json({ quiz: { ...normalizeQuiz(existing, []), ...updates } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const quizWhere = quizPrimaryKey(params.id)
  debugLog("DELETE quiz read start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("DELETE quiz read result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  debugLog("DELETE quiz normalized ids", { paramsId: params.id, ids: normalizedIds(existingRows) })
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado", debug: { paramsId: params.id, ids: normalizedIds(existingRows) } }, { status: 404 })

  const creatorId = String(val(existing, "creatorId", "userId", "ownerId") ?? "")
  if (creatorId && creatorId !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

  const questionWhere = { quizId: params.id }
  debugLog("DELETE questions delete start", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere })
  const delQ = await robleDbDelete({ tableName: QUESTION_TABLE, token, where: questionWhere })
  debugLog("DELETE questions delete result", { paramsId: params.id, tableName: QUESTION_TABLE, where: questionWhere, result: delQ })
  if (!delQ.success) return NextResponse.json({ error: delQ.error ?? "Error eliminando preguntas", debug: { tableName: QUESTION_TABLE, where: questionWhere, result: delQ } }, { status: delQ.status ?? 500 })
  debugLog("DELETE quiz delete start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const delQuiz = await robleDbDelete({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("DELETE quiz delete result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: delQuiz })
  if (!delQuiz.success) return NextResponse.json({ error: delQuiz.error ?? "Error eliminando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: delQuiz } }, { status: delQuiz.status ?? 500 })

  return NextResponse.json({ ok: true })
}
