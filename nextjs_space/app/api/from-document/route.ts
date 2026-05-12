import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbRead } from "@/src/features/auth/roble-client"
import { queryRAG } from "@/src/features/rag-engine"
import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const token = (session?.user as any)?.robleAccessToken
    const userId = (session?.user as any)?.id

    if (!token || !userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const { documentId, count = 5, difficulty = "medium" } = body

    if (!documentId) {
      return NextResponse.json({ error: "documentId requerido" }, { status: 400 })
    }

    const docs = await robleDbRead({
      tableName: "Document",
      token,
      where: { _id: documentId },
    })

    if (!docs.success || !docs.rows?.length) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
    }

    const doc = docs.rows[0]

    const rag = await queryRAG(
      doc.name,
      token,
      userId,
      6,
      undefined,
      documentId
    )

    const questions = await generateQuestions(
      doc.name,
      count,
      difficulty,
      ["single", "multiple", "truefalse"],
      {
        context: rag.context,
        contextSource: "rag",
      }
    )

    return NextResponse.json({
      questions,
      rag: {
        used: true,
        chunks: rag.chunks.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error generando quiz" },
      { status: 500 }
    )
  }
}