import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: { questions: { orderBy: { order: "asc" } }, creator: { select: { name: true, email: true } } },
  })
  if (!quiz) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ quiz })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const quiz = await prisma.quiz.findUnique({ where: { id: params.id } })
  if (!quiz || quiz.creatorId !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })

  const body = await req.json()
  const { name, description, category, difficulty, isPublic, questions } = body
  const updated = await prisma.$transaction(async (tx: any) => {
    const q = await tx.quiz.update({
      where: { id: params.id },
      data: {
        name: name ?? quiz.name,
        description: description ?? quiz.description,
        category: category ?? quiz.category,
        difficulty: difficulty ?? quiz.difficulty,
        isPublic: typeof isPublic === "boolean" ? isPublic : quiz.isPublic,
      },
    })
    if (Array.isArray(questions)) {
      await tx.question.deleteMany({ where: { quizId: params.id } })
      await tx.question.createMany({
        data: questions.map((qq: any, i: number) => ({
          quizId: params.id, type: qq.type, text: qq.text,
          options: qq.options ?? [], correctAnswers: qq.correctAnswers ?? [],
          explanation: qq.explanation ?? null, order: i,
        })),
      })
    }
    return q
  })
  return NextResponse.json({ quiz: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const quiz = await prisma.quiz.findUnique({ where: { id: params.id } })
  if (!quiz || quiz.creatorId !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
  await prisma.quiz.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
