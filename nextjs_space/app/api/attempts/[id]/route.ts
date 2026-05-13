import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { loadAttemptForFeedback } from "@/src/features/ai-feedback/analyze-attempt"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id as string | undefined
    const token = (session?.user as any)?.robleAccessToken as string | undefined

    if (!userId || !token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const attemptId = String(params.id || "").trim()
    if (!attemptId) {
      return NextResponse.json({ error: "attemptId requerido" }, { status: 400 })
    }

    const data = await loadAttemptForFeedback(attemptId, token, userId)
    if (!data) {
      return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      attempt: data.attempt,
      detailed: data.questions.map((question) => ({
        questionId: question.id,
        selected: question.selected,
        correct: question.correct,
        timeMs: question.timeMs,
      })),
      quiz: {
        ...data.quiz,
        questions: data.questions.map((question) => ({
          id: question.id,
          quizId: data.quiz.id,
          type: question.type,
          text: question.text,
          options: question.options,
          correctAnswers: question.correctAnswers,
          explanation: question.explanation,
          order: question.order,
        })),
      },
    })
  } catch (error: any) {
    console.error("[attempts:id] error", error)
    return NextResponse.json(
      { error: error?.message ?? "Error cargando intento" },
      { status: 500 }
    )
  }
}
