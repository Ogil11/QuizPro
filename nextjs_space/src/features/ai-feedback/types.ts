import { z } from "zod"

export type PerformanceLevel = "low" | "medium" | "high"

export const WeaknessSchema = z.object({
  topic: z.string().min(1),
  evidence: z.string().min(1),
  recommendation: z.string().min(1),
})

export const QuestionFeedbackSchema = z.object({
  questionId: z.string().min(1),
  wasCorrect: z.boolean(),
  errorExplanation: z.string().min(1),
  correctConcept: z.string().min(1),
  practiceTip: z.string().min(1),
})

export const NextQuizSuggestionSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  reason: z.string().min(1),
})

export const IntelligentFeedbackSchema = z.object({
  summary: z.string().min(1),
  performanceLevel: z.enum(["low", "medium", "high"]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(WeaknessSchema).default([]),
  questionFeedback: z.array(QuestionFeedbackSchema).default([]),
  recommendedPractice: z.array(z.string()).default([]),
  nextQuizSuggestions: z.array(NextQuizSuggestionSchema).default([]),
})

export type IntelligentFeedback = z.infer<typeof IntelligentFeedbackSchema>

export interface AttemptQuestionForFeedback {
  id: string
  type: string
  text: string
  options: string[]
  correctAnswers: number[]
  explanation?: string | null
  order: number
  selected: number[]
  correct: boolean
  timeMs: number
}

export interface AttemptForFeedback {
  attempt: {
    id: string
    userId: string
    quizId: string
    score: number
    correct: number
    total: number
    durationSec: number
    answers: Array<{
      questionId: string
      selected: number[]
      correct: boolean
      timeMs: number
    }>
    createdAt: string
  }
  quiz: {
    id: string
    name: string
    description: string | null
    category: string
    difficulty: string
    creationMode: string
  }
  questions: AttemptQuestionForFeedback[]
}
