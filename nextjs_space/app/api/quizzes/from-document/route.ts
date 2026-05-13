import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbRead } from "@/src/features/auth/roble-client"
import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"

export const dynamic = "force-dynamic"

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

        // Verifica que el documento exista, pertenezca al usuario y esté procesado
        const docsResult = await robleDbRead({
            tableName: "Document",
            token,
            where: {
                _id: documentId,
                userId,
            },
        })

        if (!docsResult.success || !docsResult.rows?.length) {
            return NextResponse.json(
                { error: "Documento no encontrado o no tienes permiso" },
                { status: 404 }
            )
        }

        const doc = docsResult.rows[0]

        // Valida que el documento tenga texto extraído y esté procesado
        const extractedText = doc.extractedText || doc.extracted_text || ""
        const docStatus = doc.status || doc.processedStatus || "pending"

        if (!extractedText || extractedText.trim().length === 0) {
            return NextResponse.json(
                {
                    error: docStatus === "pending"
                        ? "El documento aún está siendo procesado. Intenta en unos segundos."
                        : docStatus === "failed"
                            ? "Error al procesar el documento"
                            : "El documento no tiene contenido extraído"
                },
                { status: 400 }
            )
        }

        // Obtiene el nombre del documento para usar como tema
        const docName = doc.name || doc.title || "Documento"

        console.log(`[from-document] Generando ${count} preguntas desde documento "${docName}" (${extractedText.length} chars, status: ${docStatus})`)

        // Genera preguntas usando el contenido extraído del documento
        try {
            const questions = await generateQuestions(
                docName,
                count,
                difficulty,
                ["single", "multiple", "truefalse"],
                {
                    context: extractedText,
                    contextSource: "rag",
                }
            )

            return NextResponse.json({
                questions,
                rag: {
                    used: true,
                    documentName: docName,
                    textLength: extractedText.length,
                },
            })
        } catch (genError: any) {
            console.error("[from-document] Error en generateQuestions:", genError?.message)
            throw new Error(`Error generando preguntas: ${genError?.message}`)
        }
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
