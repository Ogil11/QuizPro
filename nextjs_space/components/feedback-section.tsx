"use client"
import { useState, useCallback, useRef } from "react"
import { Sparkles, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FeedbackMarkdown } from "@/components/feedback-markdown"
import type { FeedbackResult, WeakArea } from "@/src/features/ai-feedback/feedback-service"

interface AnswerDetail {
  questionId: string
  questionText: string
  selected: number[]
  correct: boolean
  timeMs: number
  options: string[]
  correctAnswers: number[]
  explanation?: string
}

interface QuizContext {
  name: string
  category: string
  questions: {
    text: string
    options: string[]
    correctAnswers: number[]
    explanation?: string
  }[]
}

interface AttemptSummary {
  id: string
  score: number
  correct: number
  total: number
  durationSec: number
}

interface FeedbackSectionProps {
  attempt: AttemptSummary
  answers: AnswerDetail[]
  quizContext: QuizContext
}

interface ApiResponse {
  success: boolean
  content?: string
  topics?: WeakArea[]
  score?: number
  attemptId?: string
  error?: string
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

async function fetchWithRetry(
  attempt: AttemptSummary,
  answers: AnswerDetail[],
  quizContext: QuizContext,
  retries = 0
): Promise<ApiResponse> {
  const response = await fetch("/api/feedback/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attempt, answers, quizContext }),
  })

  if (!response.ok) {
    if (retries < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (retries + 1)))
      return fetchWithRetry(attempt, answers, quizContext, retries + 1)
    }
    throw new Error("Error al obtener feedback")
  }

  return response.json()
}

export function FeedbackSection({ attempt, answers, quizContext }: FeedbackSectionProps) {
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const isMounted = useRef(true)

  const loadFeedback = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await fetchWithRetry(attempt, answers, quizContext)

      if (!isMounted.current) return

      if (result.success && result.content) {
        setFeedback({
          success: true,
          content: result.content,
          topics: result.topics ?? [],
          score: result.score ?? attempt.score,
          attemptId: attempt.id,
        })
      } else {
        setError(result.error ?? "No se pudo generar el feedback")
      }
    } catch (err) {
      if (!isMounted.current) return
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }, [attempt, answers, quizContext])

  // Initial load
  useState(() => {
    isMounted.current = true
    loadFeedback()

    return () => {
      isMounted.current = false
    }
  })

  const handleRetry = () => {
    setRetryCount((c) => c + 1)
    loadFeedback()
  }

  const weakTopics = feedback?.topics.filter((t) => t.accuracy < 70) ?? []

  return (
    <div className="bg-primary/5 p-6 rounded-lg shadow-sm border border-primary/20">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold">Retroalimentación IA</h3>
        </div>
        {error && !loading && (
          <Button variant="ghost" size="sm" onClick={handleRetry} className="text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Reintentar
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generando análisis personalizado...
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-destructive py-2">
          <AlertCircle className="h-4 w-4" />
          {error}. {retryCount < MAX_RETRIES ? "Reintentando..." : "Intenta más tarde."}
        </div>
      )}

      {feedback && !loading && (
        <div className="mt-3">
          <FeedbackMarkdown content={feedback.content} />

          {weakTopics.length > 0 && (
            <div className="mt-4 pt-3 border-t border-primary/20">
              <h4 className="text-sm font-semibold mb-2">Áreas a reforzar</h4>
              <div className="flex flex-wrap gap-2">
                {weakTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs rounded-full"
                  >
                    {topic.topic}: {Math.round(topic.accuracy)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!feedback && !loading && !error && (
        <p className="text-sm text-muted-foreground">Generando análisis personalizado...</p>
      )}
    </div>
  )
}
