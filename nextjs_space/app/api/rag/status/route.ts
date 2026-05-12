import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbRead } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

/**
 * GET /api/rag/status
 * 
 * Verifica el estado del motor RAG:
 * - Autenticación
 * - Chunks disponibles en Roble
 * - Ollama connectivity
 * 
 * Retorna:
 * {
 *   status: "ok" | "degraded" | "error",
 *   authenticated: boolean,
 *   totalChunksAvailable: number,
 *   totalDocuments: number,
 *   ollama: {
 *     url: string,
 *     model: string,
 *     available: boolean
 *   }
 * }
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Verifica autenticación
        const session = await getServerSession(authOptions)
        const accessToken = (session?.user as any)?.robleAccessToken as string | undefined
        const authenticated = !!accessToken

        if (!authenticated) {
            return NextResponse.json({
                status: "error",
                authenticated: false,
                error: "Not authenticated",
            })
        }

        // 2. Conta chunks en Roble
        const chunksResult = await robleDbRead({
            tableName: "DocumentChunk",
            token: accessToken,
        })

        const totalChunks = chunksResult.success ? (chunksResult.rows?.length ?? 0) : 0

        // 3. Conta documentos
        const docsResult = await robleDbRead({
            tableName: "Document",
            token: accessToken,
        })

        const totalDocs = docsResult.success ? (docsResult.rows?.length ?? 0) : 0
        const completedDocs = docsResult.success
            ? (docsResult.rows?.filter((r: any) => r.status === "completed").length ?? 0)
            : 0

        // 4. Verifica Ollama
        const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
        const ollamaModel = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text"

        let ollamaAvailable = false
        let ollamaModelAvailable = false
        let ollamaError: string | undefined
        try {
            const ollamaCheck = await fetch(`${ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(3000),
            })
            ollamaAvailable = ollamaCheck.ok
            if (ollamaCheck.ok) {
                const tags = await ollamaCheck.json()
                const models = Array.isArray(tags?.models) ? tags.models : []
                ollamaModelAvailable = models.some((model: any) => {
                    const name = String(model?.name ?? model?.model ?? "")
                    return name === ollamaModel || name.startsWith(`${ollamaModel}:`)
                })
            }
        } catch (error: any) {
            ollamaAvailable = false
            ollamaError = error?.message || "Ollama check failed"
        }

        const status = ollamaAvailable && ollamaModelAvailable
            ? "ok"
            : totalChunks > 0
                ? "degraded"
                : "error"

        return NextResponse.json({
            status,
            authenticated: true,
            user: {
                id: (session?.user as any)?.id,
                email: (session?.user as any)?.email,
            },
            database: {
                totalDocuments: totalDocs,
                completedDocuments: completedDocs,
                pendingDocuments: totalDocs - completedDocs,
                totalChunks,
                estimatedTokens: totalChunks * 500, // Rough estimate
            },
            ollama: {
                url: ollamaUrl,
                model: ollamaModel,
                available: ollamaAvailable,
                modelAvailable: ollamaModelAvailable,
                error: ollamaError,
            },
            _endpoints: {
                queryRAG: "GET /api/rag/query?q=search%20term&limit=5",
                status: "GET /api/rag/status",
                documentsList: "GET /api/documents",
            },
        })
    } catch (error: any) {
        console.error("[rag:status] Error:", error)
        return NextResponse.json(
            {
                status: "error",
                error: error?.message || "Unknown error",
            },
            { status: 500 }
        )
    }
}
