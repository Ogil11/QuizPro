import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbInsert, robleDbRead } from "@/src/features/auth/roble-client"
import { loadAttemptForFeedback } from "@/src/features/ai-feedback/analyze-attempt"
import { generateIntelligentFeedback } from "@/src/features/ai-feedback/gemma-feedback-client"
import type { IntelligentFeedback } from "@/src/features/ai-feedback/types"

export const dynamic = "force-dynamic"

const FEEDBACK_TABLE = "UserFeedback"

function parseJson(value: unknown) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeFeedbackRow(row: any): IntelligentFeedback & {
  id: string
  userId: string
  quizId: string
  attemptId: string
  createdAt: string
} {
  return {
    id: String(row?._id || row?.id || ""),
    userId: String(row?.userId || row?.user_id || ""),
    quizId: String(row?.quizId || row?.quiz_id || ""),
    attemptId: String(row?.attemptId || row?.attempt_id || ""),
    summary: String(row?.summary || ""),
    performanceLevel: row?.performanceLevel || row?.performance_level || "medium",
    strengths: parseJson(row?.strengths) as string[],
    weaknesses: parseJson(row?.weaknesses) as any[],
    questionFeedback: parseJson(row?.questionFeedback || row?.question_feedback) as any[],
    recommendedPractice: parseJson(row?.recommendedPractice || row?.recommended_practice) as string[],
    nextQuizSuggestions: parseJson(row?.nextQuizSuggestions || row?.next_quiz_suggestions) as any[],
    createdAt: String(row?.createdAt || row?.created_at || new Date().toISOString()),
  }
}

async function findExistingFeedback(attemptId: string, token: string, userId: string) {
  const read = await robleDbRead({
    tableName: FEEDBACK_TABLE,
    token,
    where: { attemptId },
    orderBy: "createdAt",
    orderDirection: "desc",
  })

  if (!read.success) return null
  const row = (read.rows ?? []).find((item: any) => {
    const itemAttemptId = String(item?.attemptId || item?.attempt_id || "")
    const itemUserId = String(item?.userId || item?.user_id || "")
    return itemAttemptId === attemptId && itemUserId === userId
  })

  return row ? normalizeFeedbackRow(row) : null
}

async function saveFeedback(args: {
  userId: string
  quizId: string
  attemptId: string
  feedback: IntelligentFeedback
  raw: unknown
  token: string
}) {
  const now = new Date().toISOString()
  const record = {
    userId: args.userId,
    quizId: args.quizId,
    attemptId: args.attemptId,
    summary: args.feedback.summary,
    performanceLevel: args.feedback.performanceLevel,
    strengths: JSON.stringify(args.feedback.strengths),
    weaknesses: JSON.stringify(args.feedback.weaknesses),
    questionFeedback: JSON.stringify(args.feedback.questionFeedback),
    recommendedPractice: JSON.stringify(args.feedback.recommendedPractice),
    nextQuizSuggestions: JSON.stringify(args.feedback.nextQuizSuggestions),
    rawJson: JSON.stringify(args.raw),
    createdAt: now,
  }

  const insert = await robleDbInsert({
    tableName: FEEDBACK_TABLE,
    token: args.token,
    records: [record],
  })

  if (!insert.success) {
    console.warn("[feedback:generate] UserFeedback insert failed:", insert.error)
    return { saved: false, warning: insert.error ?? "No se pudo guardar el feedback" }
  }

  const inserted = Array.isArray((insert as any)?.inserted) ? (insert as any).inserted[0] : undefined
  return {
    saved: true,
    id: String(inserted?._id || inserted?.id || ""),
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id as string | undefined
    const token = (session?.user as any)?.robleAccessToken as string | undefined

    if (!userId || !token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : ""
    const force = Boolean(body?.force)

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId requerido" }, { status: 400 })
    }

    if (!force) {
      const existing = await findExistingFeedback(attemptId, token, userId)
      if (existing) {
        return NextResponse.json({ feedback: existing, saved: true, cached: true })
      }
    }

    const attemptData = await loadAttemptForFeedback(attemptId, token, userId)
    if (!attemptData) {
      return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 })
    }

    const generated = await generateIntelligentFeedback(attemptData)
    const saved = await saveFeedback({
      userId,
      quizId: attemptData.quiz.id,
      attemptId,
      feedback: generated.feedback,
      raw: generated.raw,
      token,
    })

    return NextResponse.json({
      feedback: generated.feedback,
      saved: saved.saved,
      feedbackId: saved.id,
      warning: saved.warning,
      fallback: generated.fallback,
    })
  } catch (error: any) {
    console.error("[feedback:generate] error", error)
    return NextResponse.json(
      { error: error?.message ?? "Error generando feedback" },
      { status: 500 }
    )
  }
}
