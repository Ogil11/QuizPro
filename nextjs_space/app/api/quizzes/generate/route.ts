import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"
import { queryRAG } from "@/src/features/rag-engine"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  try {
    const {
      topic,
      count = 5,
      difficulty = "medium",
      types,
      useRag = true,
      ragLimit = 6,
      context,
    } = await req.json()
    if (!topic) return NextResponse.json({ error: "topic requerido" }, { status: 400 })

    const accessToken = (session.user as any)?.robleAccessToken as string | undefined
    const userId = (session.user as any)?.id as string | undefined
    let ragContext = typeof context === "string" ? context.trim() : ""
    let ragMeta = {
      enabled: Boolean(useRag),
      used: false,
      chunks: 0,
      totalDistance: 0,
      warning: undefined as string | undefined,
    }

    if (useRag && !ragContext && accessToken && userId) {
      try {
        const ragResult = await queryRAG(
          topic,
          accessToken,
          userId,
          Math.max(1, Math.min(10, Number(ragLimit) || 6))
        )
        ragContext = ragResult.context
        ragMeta = {
          enabled: true,
          used: ragResult.context.length > 0,
          chunks: ragResult.chunks.length,
          totalDistance: Math.round(ragResult.totalDistance * 10000) / 10000,
          warning: ragResult.context.length > 0 ? undefined : "No relevant RAG context found",
        }
      } catch (error: any) {
        ragMeta.warning = error?.message || "RAG lookup failed"
      }
    }

    const qs = await generateQuestions(
      topic,
      Math.min(Number(count) || 5, 15),
      difficulty,
      types,
      ragContext ? { context: ragContext, contextSource: useRag ? "rag" : "manual" } : {}
    )

    return NextResponse.json({ questions: qs, rag: ragMeta })
  } catch (e: any) {
    console.error("generate error", e)
    return NextResponse.json({ error: e?.message ?? "Error generando preguntas" }, { status: 500 })
  }
}
