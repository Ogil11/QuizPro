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

function normalizeRobleId(value: unknown): string {
  if (value && typeof value === "object") {
    return normalizeRobleId(val(value, "_id", "id", "userId", "user_id", "creatorId", "creator_id"))
  }
  return String(value ?? "").trim()
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

function questionRowId(question: any) {
  return String(val(question, "_id", "id") ?? "")
}

function questionRecord(quizId: string, question: any, order: number) {
  return {
    quizId,
    type: question.type,
    text: question.text,
    options: jsonText(question.options),
    correctAnswers: jsonText(question.correctAnswers),
    explanation: question.explanation ?? null,
    order,
  }
}

async function deleteQuestionsForQuiz(quizId: string, token: string) {
  const questionWhere = { quizId }
  debugLog("questions read for delete start", { quizId, tableName: QUESTION_TABLE, where: questionWhere })
  const qRes = await robleDbRead({ tableName: QUESTION_TABLE, token, where: questionWhere })
  debugLog("questions read for delete result", { quizId, tableName: QUESTION_TABLE, where: questionWhere, result: qRes })
  if (!qRes.success) return qRes

  for (const question of qRes.rows ?? []) {
    const questionId = questionRowId(question)
    if (!questionId) {
      return {
        success: false,
        error: "No se pudo eliminar una pregunta porque no tiene _id",
        status: 400,
        debug: { quizId, question },
      }
    }

    const where = { _id: questionId }
    debugLog("question delete start", { quizId, questionId, tableName: QUESTION_TABLE, where })
    const del = await robleDbDelete({ tableName: QUESTION_TABLE, token, where })
    debugLog("question delete result", { quizId, questionId, tableName: QUESTION_TABLE, where, result: del })
    if (!del.success) return del
  }

  return { success: true }
}

async function syncQuestionsForQuiz(quizId: string, questions: any[], token: string) {
  const questionWhere = { quizId }
  debugLog("PATCH questions read start", { quizId, tableName: QUESTION_TABLE, where: questionWhere })
  const qRes = await robleDbRead({ tableName: QUESTION_TABLE, token, where: questionWhere })
  debugLog("PATCH questions read result", { quizId, tableName: QUESTION_TABLE, where: questionWhere, result: qRes })
  if (!qRes.success) return qRes

  const existingRows = qRes.rows ?? []
  const existingById = new Map<string, any>()
  for (const row of existingRows) {
    const id = questionRowId(row)
    if (id) existingById.set(id, row)
  }

  const incomingIds = new Set<string>()
  const inserts: Record<string, any>[] = []

  for (const [order, question] of questions.entries()) {
    const id = questionRowId(question)
    const record = questionRecord(quizId, question, order)

    if (id && existingById.has(id)) {
      incomingIds.add(id)
      debugLog("PATCH question update start", { quizId, questionId: id, tableName: QUESTION_TABLE, data: record })
      const upd = await robleDbUpdate({ tableName: QUESTION_TABLE, token, where: { _id: id }, data: record })
      debugLog("PATCH question update result", { quizId, questionId: id, tableName: QUESTION_TABLE, result: upd })
      if (!upd.success) return upd
    } else {
      inserts.push(record)
    }
  }

  if (inserts.length > 0) {
    debugLog("PATCH questions insert start", { quizId, tableName: QUESTION_TABLE, records: inserts })
    const ins = await robleDbInsert({ tableName: QUESTION_TABLE, token, records: inserts })
    debugLog("PATCH questions insert result", { quizId, tableName: QUESTION_TABLE, result: ins })
    if (!ins.success) return ins
  }

  for (const id of existingById.keys()) {
    if (incomingIds.has(id)) continue

    debugLog("PATCH question delete start", { quizId, questionId: id, tableName: QUESTION_TABLE, where: { _id: id } })
    const del = await robleDbDelete({ tableName: QUESTION_TABLE, token, where: { _id: id } })
    debugLog("PATCH question delete result", { quizId, questionId: id, tableName: QUESTION_TABLE, result: del })
    if (!del.success) return del
  }

  return { success: true }
}

function isCreator(existing: any, sessionUser: any) {
  const creatorId = val(existing, "creatorId", "userId", "user_id", "ownerId", "owner_id")
  const normalizedOwnerId = normalizeRobleId(creatorId)
  const normalizedCurrentUserId = normalizeRobleId(sessionUser)

  return {
    creatorId,
    sessionUserId: sessionUser?.id,
    sessionUserEmail: sessionUser?.email,
    normalizedOwnerId,
    normalizedCurrentUserId,
    allowed: !!normalizedOwnerId && normalizedOwnerId === normalizedCurrentUserId,
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
    creatorId: normalizeRobleId(val(quiz, "creatorId", "userId", "user_id", "ownerId", "owner_id")),
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

  const quizWhere = { _id: params.id }
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
  const sessionUser = session?.user as any

  const quizWhere = { _id: params.id }
  debugLog("PATCH quiz read start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("PATCH quiz read result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  debugLog("PATCH quiz normalized ids", { paramsId: params.id, ids: normalizedIds(existingRows) })
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado", debug: { paramsId: params.id, ids: normalizedIds(existingRows) } }, { status: 404 })
  const owner = isCreator(existing, sessionUser)
  debugLog("PATCH ownership check", { paramsId: params.id, ...owner })
  if (!owner.allowed) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

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
    const syncQ = await syncQuestionsForQuiz(params.id, questions, token)
    if (!syncQ.success) return NextResponse.json({ error: syncQ.error ?? "Error guardando preguntas", debug: { tableName: QUESTION_TABLE, result: syncQ } }, { status: syncQ.status ?? 500 })
  }

  return NextResponse.json({ quiz: { ...normalizeQuiz(existing, []), ...updates } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const token = (session?.user as any)?.robleAccessToken as string | undefined
  if (!userId || !token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const sessionUser = session?.user as any

  const quizWhere = { _id: params.id }
  debugLog("DELETE quiz read start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const quizRes = await robleDbRead({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("DELETE quiz read result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: quizRes })
  if (!quizRes.success) return NextResponse.json({ error: quizRes.error ?? "Error cargando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: quizRes } }, { status: quizRes.status ?? 500 })
  const existingRows = quizRes.rows ?? []
  debugLog("DELETE quiz normalized ids", { paramsId: params.id, ids: normalizedIds(existingRows) })
  const existing = existingRows.find((r: any) => String(val(r, "id", "quizId", "_id") ?? "") === params.id)
  if (!existing) return NextResponse.json({ error: "No encontrado", debug: { paramsId: params.id, ids: normalizedIds(existingRows) } }, { status: 404 })

  const owner = isCreator(existing, sessionUser)
  debugLog("DELETE ownership check", { paramsId: params.id, ...owner })
  if (!owner.allowed) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

  const delQ = await deleteQuestionsForQuiz(params.id, token)
  if (!delQ.success) return NextResponse.json({ error: delQ.error ?? "Error eliminando preguntas", debug: { tableName: QUESTION_TABLE, where: { quizId: params.id }, result: delQ } }, { status: delQ.status ?? 500 })
  debugLog("DELETE quiz delete start", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere })
  const delQuiz = await robleDbDelete({ tableName: QUIZ_TABLE, token, where: quizWhere })
  debugLog("DELETE quiz delete result", { paramsId: params.id, tableName: QUIZ_TABLE, where: quizWhere, result: delQuiz })
  if (!delQuiz.success) return NextResponse.json({ error: delQuiz.error ?? "Error eliminando quiz", debug: { tableName: QUIZ_TABLE, where: quizWhere, result: delQuiz } }, { status: delQuiz.status ?? 500 })

  return NextResponse.json({ ok: true })
}
