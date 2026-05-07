"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Navbar } from "@/src/shared/navbar"
import { QuizBuilder } from "@/src/features/quiz-manager/quiz-builder"

export default function NewQuiz() {
  const { status } = useSession() || {}
  const router = useRouter()
  useEffect(() => { if (status === "unauthenticated") router.replace("/login") }, [status, router])
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight mb-6">Nuevo quiz</h1>
        <QuizBuilder/>
      </main>
    </div>
  )
}
