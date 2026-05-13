import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbRead } from "@/src/features/auth/roble-client"
import { queryRAG } from "@/src/features/rag-engine"
import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"

export const dynamic = "force-dynamic"

const ALLOWED_DIFFICULTIES = new Set(["easy", "medium", "hard"])

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const token = (session?.user as any)?.robleAccessToken
    const userId = (session?.user as any)?.id

    if (!token || !userId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const {
      documentId,
      count = 5,
      difficulty = "medium",
    } = body

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId requerido" },
        { status: 400 }
      )
    }

    if (!ALLOWED_DIFFICULTIES.has(String(difficulty))) {
      return NextResponse.json(
        { error: 'difficulty invalido. Usa "easy", "medium" o "hard"' },
        { status: 400 }
      )
    }

    // Verifica que el documento exista y pertenezca al usuario
    const docs = await robleDbRead({
      tableName: "Document",
      token,
      where: {
        _id: documentId,
        userId,
      },
    })

    if (!docs.success || !docs.rows?.length) {
      return NextResponse.json(
        { error: "Documento no encontrado" },
        { status: 404 }
      )
    }

    const doc = docs.rows[0]

    // Usa el nombre del documento como query semántica
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
        used: rag.chunks.length > 0,
        chunks: rag.chunks.length,
      },
    })
  } catch (error: any) {
    console.error(
      "[from-document] error:",
      error
    )

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Error generando quiz desde documento",
      },
      { status: 500 }
    )
  }
}
