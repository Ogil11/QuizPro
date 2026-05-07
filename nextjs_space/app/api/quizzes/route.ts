import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const url = new URL(req.url)
  const scope = url.searchParams.get("scope") ?? "all" // all | mine | public
  const where: any = scope === "mine" ? { creatorId: userId ?? "___" }
    : scope === "public" ? { isPublic: true }
    : userId ? { OR: [{ isPublic: true }, { creatorId: userId }] } : { isPublic: true }

  const quizzes = await prisma.quiz.findMany({
    where,
    include: { creator: { select: { name: true, email: true } }, _count: { select: { questions: true, attempts: true } } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ quizzes })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const body = await req.json()
    const { name, description, category, difficulty, isPublic, creationMode, questions } = body
    if (!name || !category || !difficulty || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
    }
    const quiz = await prisma.quiz.create({
      data: {
        name, description: description ?? null, category, difficulty,
        isPublic: !!isPublic, creationMode: creationMode ?? "manual",
        creatorId: userId,
        questions: {
          create: questions.map((q: any, i: number) => ({
            type: q.type, text: q.text,
            options: q.options ?? [],
            correctAnswers: q.correctAnswers ?? [],
            explanation: q.explanation ?? null,
            order: i,
          })),
        },
      },
      include: { questions: true },
    })
    return NextResponse.json({ quiz })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e?.message ?? "Error creando quiz" }, { status: 500 })
  }
}
