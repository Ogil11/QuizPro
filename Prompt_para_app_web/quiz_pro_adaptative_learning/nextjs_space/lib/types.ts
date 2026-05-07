export type QuestionType = "single" | "multiple" | "truefalse"
export type Difficulty = "easy" | "medium" | "hard"
export type CreationMode = "manual" | "ai" | "mixed"

export interface QuestionDraft {
  type: QuestionType
  text: string
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

export interface QuizDraft {
  name: string
  description?: string
  category: string
  difficulty: Difficulty
  isPublic: boolean
  creationMode: CreationMode
  questions: QuestionDraft[]
}
