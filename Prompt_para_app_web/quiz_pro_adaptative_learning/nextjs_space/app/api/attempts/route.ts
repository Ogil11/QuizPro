import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { quizId, answers, durationSec } = await req.json()
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: { order: "asc" } } } })
  if (!quiz) return NextResponse.json({ error: "Quiz no encontrado" }, { status: 404 })

  let correct = 0
  const detailed = quiz.questions.map((q: any, i: number) => {
    const ans = answers?.[i] ?? { selected: [], timeMs: 0 }
    const sel: number[] = Array.isArray(ans.selected) ? [...ans.selected].sort() : []
    const truth: number[] = Array.isArray(q.correctAnswers) ? [...q.correctAnswers].sort() : []
    const isCorrect = sel.length === truth.length && sel.every((v, idx) => v === truth[idx])
    if (isCorrect) correct++
    return { questionId: q.id, selected: sel, correct: isCorrect, timeMs: ans.timeMs ?? 0 }
  })
  const total = quiz.questions.length
  const score = total > 0 ? (correct / total) * 100 : 0

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId, quizId, score, correct, total,
      durationSec: Number(durationSec) || 0,
      answers: detailed,
    },
  })
  return NextResponse.json({ attempt, detailed })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId },
    include: { quiz: { select: { name: true, category: true, difficulty: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return NextResponse.json({ attempts })
}
