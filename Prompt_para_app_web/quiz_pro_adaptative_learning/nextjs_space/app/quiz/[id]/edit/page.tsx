"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "@/src/shared/navbar"
import { QuizBuilder } from "@/src/features/quiz-manager/quiz-builder"

export default function EditQuiz() {
  const params = useParams() as { id: string }
  const router = useRouter()
  const [quiz, setQuiz] = useState<any>(null)
  useEffect(() => {
    fetch(`/api/quizzes/${params.id}`).then(r=>r.json()).then(d => {
      if (!d.quiz) router.replace("/dashboard")
      else setQuiz(d.quiz)
    })
  }, [params.id, router])
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight mb-6">Editar quiz</h1>
        {quiz ? <QuizBuilder initial={quiz} quizId={params.id}/> : <p className="text-muted-foreground">Cargando...</p>}
      </main>
    </div>
  )
}
