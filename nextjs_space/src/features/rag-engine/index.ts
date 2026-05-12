/**
 * RAG Engine - Cliente principal
 * Orquesta: extracción → chunking → embeddings → almacenamiento en Roble
 */

import {
    robleDbInsert,
    robleDbRead,
    robleDbUpdate,
    robleDbDelete,
} from "@/src/features/auth/roble-client"
import {
    chunk,
    cleanText,
    estimateTokens,
} from "./chunk"
import {
    generateBatchEmbeddings,
    findSimilarChunks,
} from "./embedding"
import { DEFAULT_RAG_CONFIG, type RAGConfig, type RAGQueryResult, type DocumentChunkData } from "./types"

/**
 * Procesa un documento: extrae texto, chunka, genera embeddings y guarda en Roble
 */
export async function processDocument(
    documentId: string,
    extractedText: string,
    accessToken: string,
    config: RAGConfig = DEFAULT_RAG_CONFIG
): Promise<{ chunkCount: number; totalTokens: number }> {
    try {
        // Limpia y valida texto
        const cleaned = cleanText(extractedText)
        if (cleaned.length < 50) {
            throw new Error("Texto extraído muy corto (<50 chars)")
        }

        // 1. Chunka el texto
        const chunks = chunk(cleaned, config.chunkSize, config.chunkOverlap)
        if (chunks.length === 0) {
            throw new Error("No chunks generados")
        }

        console.log(
            `[RAG] Procesando documento ${documentId}: ${chunks.length} chunks`
        )

        // 2. Genera embeddings para cada chunk
        const embeddings = await generateBatchEmbeddings(
            chunks.map((c) => c.content),
            config.ollamaBaseUrl,
            config.embeddingModel
        )

        // 3. Guarda chunks en Roble
        const chunkRecords = chunks.map((chunk, idx) => ({
            documentId,
            content: chunk.content,
            order: chunk.order,
            tokens: chunk.tokens,
            embedding: JSON.stringify(embeddings[idx]), // JSON string del array
            createdAt: new Date().toISOString(),
        }))

        const insertResult = await robleDbInsert({
            tableName: "DocumentChunk",
            token: accessToken,
            records: chunkRecords,
        })

        if (!insertResult.success) {
            throw new Error(
                `Error guardando chunks en Roble: ${insertResult.error}`
            )
        }

        // 4. Actualiza status del documento en Roble
        const updateResult = await robleDbUpdate({
            tableName: "Document",
            token: accessToken,
            where: { _id: documentId },
            data: {
                processedAt: new Date().toISOString(),
                status: "completed",
            },
        })

        if (!updateResult.success) {
            console.warn(
                `[RAG] Aviso: No se pudo actualizar status del documento: ${updateResult.error}`
            )
        }

        const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0)
        console.log(
            `[RAG] ✅ Documento ${documentId} procesado: ${totalTokens} tokens en ${chunks.length} chunks`
        )

        return {
            chunkCount: chunks.length,
            totalTokens,
        }
    } catch (error) {
        console.error(
            `[RAG] ❌ Error procesando documento ${documentId}:`,
            error
        )

        // Marca documento como fallido en Roble
        await robleDbUpdate({
            tableName: "Document",
            token: accessToken,
            where: { _id: documentId },
            data: {
                status: "failed",
            },
        }).catch(() => { }) // Silencia error si no existe

        throw error
    }
}

/**
 * Query: busca chunks relevantes para una pregunta en Roble
 */
export async function queryRAG(
    query: string,
    accessToken: string,
    userId?: string,
    limit: number = 5,
    config: RAGConfig = DEFAULT_RAG_CONFIG
): Promise<RAGQueryResult> {
    try {
        // 1. Genera embedding de la query
        const queryEmbedding = await generateBatchEmbeddings(
            [query],
            config.ollamaBaseUrl,
            config.embeddingModel
        ).then((embeddings) => embeddings[0])

        // 2. Obtiene todos los chunks del usuario (busca por documentId asociado a usuario)
        // Si hay userId, filtramos chunks de documentos del usuario
        // Para esto necesitamos leer todos los chunks completados
        const readResult = await robleDbRead({
            tableName: "DocumentChunk",
            token: accessToken,
            // Nota: Roble puede no soportar JOINs complejos via read simple
            // Por ahora obtenemos todos los chunks completados
        })

        if (!readResult.success || !readResult.rows) {
            return {
                chunks: [],
                context: "",
                totalDistance: 0,
            }
        }

        // Parsea los embeddings de JSON string a array
        const allChunks: Array<{
            id: string
            content: string
            order: number
            embedding: number[]
            documentId: string
        }> = readResult.rows
            .map((row: any) => {
                try {
                    const embedding = typeof row.embedding === "string"
                        ? JSON.parse(row.embedding)
                        : row.embedding

                    return {
                        id: row._id || row.id,
                        content: row.content,
                        order: row.order,
                        embedding: Array.isArray(embedding) ? embedding : [],
                        documentId: row.documentId,
                    }
                } catch {
                    return null
                }
            })
            .filter(
                (chunk): chunk is NonNullable<typeof chunk> =>
                    chunk !== null && chunk.embedding.length > 0
            )

        if (allChunks.length === 0) {
            return {
                chunks: [],
                context: "",
                totalDistance: 0,
            }
        }

        // 3. Encuentra chunks similares
        const similar = findSimilarChunks(
            queryEmbedding,
            allChunks,
            limit,
            config.similarityThreshold
        )

        // 4. Concatena contexto ordenado
        const sortedChunks = similar.sort((a, b) => a.chunk.order - b.chunk.order)
        const context = sortedChunks.map((item) => item.chunk.content).join("\n\n---\n\n")
        const totalDistance = similar.reduce((sum, item) => sum + item.similarity, 0)

        return {
            chunks: sortedChunks.map((item) => ({
                id: item.chunk.id,
                documentId: allChunks.find((c) => c.id === item.chunk.id)?.documentId || "",
                content: item.chunk.content,
                order: item.chunk.order,
                tokens: estimateTokens(item.chunk.content),
                embedding: [],  // No retornamos embeddings raw
                createdAt: new Date(), // Placeholder
                similarity: item.similarity,
            })),
            context,
            totalDistance,
        }
    } catch (error) {
        console.error("[RAG] Error en query:", error)
        throw error
    }
}

/**
 * Limpia chunks de un documento (después de borrar)
 */
export async function deleteDocumentChunks(
    documentId: string,
    accessToken: string
): Promise<number> {
    try {
        // Obtiene todos los chunks del documento
        const readResult = await robleDbRead({
            tableName: "DocumentChunk",
            token: accessToken,
            where: { documentId },
        })

        if (!readResult.success || !readResult.rows) {
            return 0
        }

        // Elimina cada chunk
        let deletedCount = 0
        for (const chunk of readResult.rows) {
            const deleteResult = await robleDbDelete({
                tableName: "DocumentChunk",
                token: accessToken,
                where: { _id: chunk._id || chunk.id },
            })

            if (deleteResult.success) {
                deletedCount++
            }
        }

        console.log(
            `[RAG] Eliminados ${deletedCount} chunks del documento ${documentId}`
        )
        return deletedCount
    } catch (error) {
        console.error(
            `[RAG] Error eliminando chunks del documento ${documentId}:`,
            error
        )
        return 0
    }
}

// Re-exports para facilitar uso en rutas API
export { DEFAULT_RAG_CONFIG, type RAGConfig, type RAGQueryResult, type DocumentChunkData } from "./types"
export { chunk, cleanText, estimateTokens } from "./chunk"
export { generateEmbedding, generateBatchEmbeddings, cosineSimilarity, findSimilarChunks } from "./embedding"
