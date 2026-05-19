"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "@/src/shared/navbar"
import { QuizBuilder } from "@/src/features/quiz-manager/quiz-builder"
import { toast } from "sonner"

// 🔧 ADAPTADOR DE DATOS (CLAVE)
function adaptQuiz(raw: any) {
  return {
    name: raw.name ?? raw.title ?? "",
    description: raw.description ?? "",
    category: raw.category ?? "General",
    difficulty: raw.difficulty ?? "medium",
    isPublic: raw.isPublic ?? true,
    creationMode: raw.creationMode ?? "manual",

    questions: (raw.questions ?? []).map((q: any) => ({
      type:
        q.type === "multiple" || q.type === "truefalse"
          ? q.type
          : "single",

      text: q.text ?? "",

      options:
        Array.isArray(q.options)
          ? q.options
          : q.type === "truefalse"
          ? ["Verdadero", "Falso"]
          : ["", "", "", ""],

      correctAnswers:
        Array.isArray(q.correctAnswers)
          ? q.correctAnswers
          : q.correctAnswer !== undefined
          ? [q.correctAnswer]
          : [],
    })),
  }
}

export default function EditQuiz() {
  const params = useParams() as { id: string }
  const router = useRouter()
  const [quiz, setQuiz] = useState<any>(null)

  useEffect(() => {
    async function loadQuiz() {
      try {
        const res = await fetch(`/api/quizzes/${params.id}`)
        const text = await res.text()

        let data: any = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }

        if (!res.ok) {
          toast.error(text || "Error cargando quiz")
          return
        }

        if (!data.quiz) {
          router.replace("/dashboard")
          return
        }

        // 🔥 AQUI ESTA LA MAGIA
        const adapted = adaptQuiz(data.quiz)

        console.log("RAW QUIZ:", data.quiz)
        console.log("ADAPTED QUIZ:", adapted)

        setQuiz(adapted)

      } catch (err) {
        console.error(err)
        toast.error("Error de conexión")
      }
    }

    loadQuiz()
  }, [params.id, router])

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight mb-6">
          Editar quiz
        </h1>

        {quiz ? (
          <QuizBuilder
            initial={quiz}
            quizId={params.id}
          />
        ) : (
          <p className="text-muted-foreground">
            Cargando...
          </p>
        )}
      </main>
    </div>
  )
}