/**
 * Generación de embeddings usando Ollama (nomic-embed-text)
 */

import { DEFAULT_RAG_CONFIG } from "./types"

interface OllamaEmbeddingResponse {
    embedding?: number[]
    embeddings?: number[][]
}

function getOllamaErrorMessage(error: unknown, baseUrl: string, model: string) {
    const message = error instanceof Error ? error.message : String(error)

    if (
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("UND_ERR_CONNECT_TIMEOUT")
    ) {
        return `Ollama is not reachable at ${baseUrl}. Start it with 'ollama serve' and make sure the model '${model}' is installed.`
    }

    return message
}

/**
 * Genera un embedding para un texto usando Ollama
 */
export async function generateEmbedding(
    text: string,
    baseUrl: string = DEFAULT_RAG_CONFIG.ollamaBaseUrl,
    model: string = DEFAULT_RAG_CONFIG.embeddingModel
): Promise<number[]> {
    try {
        const response = await fetch(`${baseUrl}/api/embed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                input: text,
            }),
            signal: AbortSignal.timeout(30000), // 30s timeout
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(
                `Ollama embedding error: ${response.status} - ${error}`
            )
        }

        const data: OllamaEmbeddingResponse = await response.json()
        const embeddings = data.embeddings
        const embedding = Array.isArray(data.embedding)
            ? data.embedding
            : Array.isArray(embeddings) && Array.isArray(embeddings[0])
                ? embeddings[0]
                : null

        if (!embedding) {
            throw new Error("Invalid embedding response format")
        }

        return embedding
    } catch (error) {
        const message = getOllamaErrorMessage(error, baseUrl, model)
        console.error("Failed to generate embedding:", message)
        throw new Error(message)
    }
}

/**
 * Genera embeddings para múltiples textos
 * Retorna array de embeddings en el mismo orden
 */
export async function generateBatchEmbeddings(
    texts: string[],
    baseUrl?: string,
    model?: string
): Promise<number[][]> {
    const embeddings = await Promise.all(
        texts.map((text) => generateEmbedding(text, baseUrl, model))
    )
    return embeddings
}

/**
 * Calcula similitud coseno entre dos vectores
 * Rango: [-1, 1], donde 1 es identical
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(
            `Vector length mismatch: ${a.length} vs ${b.length}`
        )
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0
    }

    return dotProduct / (magnitudeA * magnitudeB)
}

/**
 * Encuentra los chunks más similares a un query
 */
export interface SimilarChunk {
    chunk: {
        id: string
        content: string
        order: number
    }
    similarity: number
}

export function findSimilarChunks(
    queryEmbedding: number[],
    chunks: Array<{
        id: string
        content: string
        order: number
        embedding: number[]
    }>,
    limit: number = 5,
    threshold: number = DEFAULT_RAG_CONFIG.similarityThreshold
): SimilarChunk[] {
    const similarities = chunks.map((chunk) => ({
        chunk: {
            id: chunk.id,
            content: chunk.content,
            order: chunk.order,
        },
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))

    return similarities
        .filter((item) => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
}
