import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryRAG, DEFAULT_RAG_CONFIG } from "@/src/features/rag-engine"

export const dynamic = "force-dynamic"

function isOllamaError(error: any) {
    const message = String(error?.message ?? "")
    return (
        message.includes("Ollama") ||
        message.includes("embed") ||
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("UND_ERR_CONNECT_TIMEOUT") ||
        message.includes("not reachable")
    )
}

/**
 * GET /api/rag/query
 * 
 * Búsqueda RAG: Encuentra chunks relevantes para una query
 * 
 * Parámetros:
 * - q (required): Texto de búsqueda
 * - limit (optional): Número máximo de chunks a retornar (default: 5)
 * - userId (optional): Filtrar por usuario específico
 * 
 * Ejemplo:
 * GET /api/rag/query?q=machine%20learning&limit=3
 * 
 * Respuesta:
 * {
 *   success: true,
 *   chunks: [
 *     {
 *       id: "chunk_123",
 *       documentId: "doc_456",
 *       content: "...",
 *       order: 0,
 *       similarity: 0.85
 *     }
 *   ],
 *   context: "...", // Texto concatenado de chunks
 *   totalChunks: 3,
 *   totalDistance: 2.15
 * }
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Obtiene sesión y token
        const session = await getServerSession(authOptions)
        const accessToken = (session?.user as any)?.robleAccessToken as string | undefined

        if (!accessToken) {
            return NextResponse.json(
                { error: "No authenticated. Please login first." },
                { status: 401 }
            )
        }

        // 2. Valida parámetros
        const url = new URL(req.url)
        const query = url.searchParams.get("q")?.trim()

        if (!query || query.length < 2) {
            return NextResponse.json(
                {
                    error: "Query parameter 'q' is required and must be at least 2 characters",
                    example: "/api/rag/query?q=your%20search%20term&limit=5",
                },
                { status: 400 }
            )
        }

        const limitStr = url.searchParams.get("limit")
        const limit = limitStr ? Math.max(1, Math.min(20, parseInt(limitStr, 10))) : 5

        const userIdFilter = url.searchParams.get("userId")?.trim() || undefined

        console.log(`[rag:query] Query: "${query}", Limit: ${limit}, UserId: ${userIdFilter || "all"}`)

        // 3. Ejecuta búsqueda RAG
        const ragResult = await queryRAG(
            query,
            accessToken,
            userIdFilter,
            limit,
            DEFAULT_RAG_CONFIG
        )

        // 4. Enriquece respuesta con similarity scores
        const enrichedChunks = ragResult.chunks.map((chunk) => ({
            ...chunk,
            similarity: Math.round((chunk.similarity ?? 0) * 10000) / 10000,
        }))

        return NextResponse.json({
            success: true,
            query,
            chunks: enrichedChunks,
            context: ragResult.context,
            totalChunks: enrichedChunks.length,
            totalDistance: Math.round(ragResult.totalDistance * 100) / 100,
            _meta: {
                queryTokens: query.split(/\s+/).length,
                chunkLimit: limit,
                timestamp: new Date().toISOString(),
            },
        })
    } catch (error: any) {
        console.error("[rag:query] Error:", error)

        const ollamaError = isOllamaError(error)

        return NextResponse.json(
            {
                error: "RAG query failed",
                message: error?.message || "Unknown error",
                details: ollamaError
                    ? "Ollama service may not be running or the embedding model may be missing. Run: ollama serve && ollama pull nomic-embed-text"
                    : undefined,
            },
            { status: ollamaError ? 503 : 500 }
        )
    }
}

/**
 * POST /api/rag/query
 * 
 * Alternativa POST para queries más largas
 * 
 * Body:
 * {
 *   q: "search query",
 *   limit: 5,
 *   userId: "user123"
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        const accessToken = (session?.user as any)?.robleAccessToken as string | undefined

        if (!accessToken) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            )
        }

        const body = await req.json()
        const { q: query, limit: limitParam, userId: userIdFilter } = body

        if (!query || typeof query !== "string" || query.trim().length < 2) {
            return NextResponse.json(
                { error: "Field 'q' is required and must be at least 2 characters" },
                { status: 400 }
            )
        }

        const limit = limitParam ? Math.max(1, Math.min(20, parseInt(limitParam, 10))) : 5

        console.log(`[rag:query:post] Query: "${query}", Limit: ${limit}`)

        const ragResult = await queryRAG(
            query,
            accessToken,
            userIdFilter,
            limit,
            DEFAULT_RAG_CONFIG
        )

        const enrichedChunks = ragResult.chunks.map((chunk) => ({
            ...chunk,
            similarity: Math.round((chunk.similarity ?? 0) * 10000) / 10000,
        }))

        return NextResponse.json({
            success: true,
            query,
            chunks: enrichedChunks,
            context: ragResult.context,
            totalChunks: enrichedChunks.length,
            totalDistance: Math.round(ragResult.totalDistance * 100) / 100,
        })
    } catch (error: any) {
        console.error("[rag:query:post] Error:", error)
        const ollamaError = isOllamaError(error)
        return NextResponse.json(
            {
                error: "RAG query failed",
                message: error?.message,
                details: ollamaError
                    ? "Ollama service may not be running or the embedding model may be missing. Run: ollama serve && ollama pull nomic-embed-text"
                    : undefined,
            },
            { status: ollamaError ? 503 : 500 }
        )
    }
}
