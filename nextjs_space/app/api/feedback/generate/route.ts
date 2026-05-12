import { NextRequest, NextResponse } from "next/server"
import { generateFeedback, QuizAttemptData, AnswerDetail } from "@/src/features/ai-feedback/feedback-service"

export const dynamic = "force-dynamic"

interface GenerateFeedbackRequest {
  attempt: {
    id: string
    score: number
    correct: number
    total: number
    durationSec: number
    createdAt: string
  }
  answers: AnswerDetail[]
  quizContext?: {
    name: string
    category: string
    questions: { text: string; options: string[]; correctAnswers: number[] }[]
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateFeedbackRequest = await request.json()

    if (!body.attempt || !body.answers) {
      return NextResponse.json(
        { success: false, error: "Faltan datos del intento o respuestas" },
        { status: 400 }
      )
    }

    const attemptData: QuizAttemptData = {
      id: body.attempt.id,
      score: body.attempt.score,
      correct: body.attempt.correct,
      total: body.attempt.total,
      durationSec: body.attempt.durationSec,
      answers: body.answers,
      createdAt: body.attempt.createdAt,
    }

    const result = await generateFeedback(attemptData, body.quizContext)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[feedback/generate] Error:", error)
    return NextResponse.json(
      { success: false, error: "Error al generar feedback" },
      { status: 500 }
    )
  }
}
