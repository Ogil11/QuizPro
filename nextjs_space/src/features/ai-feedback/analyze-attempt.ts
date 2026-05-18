import { robleDbRead } from "@/src/features/auth/roble-client"
import type { AttemptForFeedback, AttemptQuestionForFeedback } from "./types"

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

function normalizeId(row: any) {
  return String(val(row, "id", "_id", "quizId") ?? "")
}

function normalizeQuestion(row: any): Omit<AttemptQuestionForFeedback, "selected" | "correct" | "timeMs"> {
  return {
    id: String(val(row, "id", "_id") ?? ""),
    type: String(val(row, "type") ?? "single"),
    text: String(val(row, "text") ?? ""),
    options: parseJsonArray(val(row, "options")).map((option) => String(option)),
    correctAnswers: parseJsonArray(val(row, "correctAnswers")).map((answer) => Number(answer)),
    explanation: val<string>(row, "explanation") ?? null,
    order: Number(val(row, "order") ?? 0),
  }
}

function answerForQuestion(answers: any[], question: { id: string }, index: number) {
  const byId = answers.find((answer) => String(answer?.questionId ?? "") === question.id)
  const answer = byId ?? answers[index] ?? {}
  const selected = Array.isArray(answer?.selected)
    ? answer.selected.map((item: any) => Number(item)).filter((item: number) => Number.isInteger(item))
    : []

  return {
    selected,
    correct: Boolean(answer?.correct),
    timeMs: Number(answer?.timeMs) || 0,
  }
}

export async function loadAttemptForFeedback(
  attemptId: string,
  accessToken: string,
  userId: string
): Promise<AttemptForFeedback | null> {
  const attemptsRes = await robleDbRead({
    tableName: ATTEMPT_TABLE,
    token: accessToken,
    where: { _id: attemptId },
  })

  if (!attemptsRes.success) {
    throw new Error(attemptsRes.error ?? "Error cargando intento")
  }

  const attemptRow = (attemptsRes.rows ?? []).find((row: any) => normalizeId(row) === attemptId)
  if (!attemptRow) return null

  const ownerId = String(val(attemptRow, "userId") ?? "")
  if (ownerId !== userId) return null

  const quizId = String(val(attemptRow, "quizId") ?? "")
  const quizRes = await robleDbRead({
    tableName: QUIZ_TABLE,
    token: accessToken,
    where: { _id: quizId },
  })

  if (!quizRes.success) {
    throw new Error(quizRes.error ?? "Error cargando quiz")
  }

  const quizRow = (quizRes.rows ?? []).find((row: any) => normalizeId(row) === quizId)
  if (!quizRow) {
    throw new Error("Quiz relacionado no encontrado")
  }

  const questionsRes = await robleDbRead({
    tableName: QUESTION_TABLE,
    token: accessToken,
    where: { quizId },
    orderBy: "order",
    orderDirection: "asc",
  })

  if (!questionsRes.success) {
    throw new Error(questionsRes.error ?? "Error cargando preguntas")
  }

  const answers = parseJsonArray(val(attemptRow, "answers"))
  const questions = (questionsRes.rows ?? [])
    .map(normalizeQuestion)
    .sort((a, b) => a.order - b.order)
    .map((question, index) => ({
      ...question,
      ...answerForQuestion(answers, question, index),
    }))

  return {
    attempt: {
      id: attemptId,
      userId,
      quizId,
      score: Number(val(attemptRow, "score") ?? 0),
      correct: Number(val(attemptRow, "correct") ?? 0),
      total: Number(val(attemptRow, "total") ?? questions.length),
      durationSec: Number(val(attemptRow, "durationSec") ?? 0),
      answers: questions.map((question) => ({
        questionId: question.id,
        selected: question.selected,
        correct: question.correct,
        timeMs: question.timeMs,
      })),
      createdAt: String(val(attemptRow, "createdAt") ?? new Date().toISOString()),
    },
    quiz: {
      id: quizId,
      name: String(val(quizRow, "name", "title") ?? "Quiz"),
      description: val<string>(quizRow, "description") ?? null,
      category: String(val(quizRow, "category") ?? "general"),
      difficulty: String(val(quizRow, "difficulty") ?? "medium"),
      creationMode: String(val(quizRow, "creationMode") ?? "manual"),
    },
    questions,
  }
}

export function buildPedagogicalPayload(data: AttemptForFeedback) {
  return {
    quiz: data.quiz,
    attempt: {
      score: data.attempt.score,
      correct: data.attempt.correct,
      total: data.attempt.total,
      durationSec: data.attempt.durationSec,
      createdAt: data.attempt.createdAt,
    },
    questions: data.questions.map((question) => ({
      id: question.id,
      type: question.type,
      text: question.text,
      options: question.options,
      correctAnswers: question.correctAnswers,
      selected: question.selected,
      wasCorrect: question.correct,
      timeMs: question.timeMs,
      explanation: question.explanation,
    })),
  }
}
