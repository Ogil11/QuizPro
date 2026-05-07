import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  try {
    const { topic, count = 5, difficulty = "medium", types } = await req.json()
    if (!topic) return NextResponse.json({ error: "topic requerido" }, { status: 400 })
    const qs = await generateQuestions(topic, Math.min(Number(count) || 5, 15), difficulty, types)
    return NextResponse.json({ questions: qs })
  } catch (e: any) {
    console.error("generate error", e)
    return NextResponse.json({ error: e?.message ?? "Error generando preguntas" }, { status: 500 })
  }
}
