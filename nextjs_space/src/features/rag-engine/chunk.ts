/**
 * Chunking semántico de texto
 * Divide documentos en trozos de tamaño controlado con overlap
 */

import { DEFAULT_RAG_CONFIG } from "./types"

/**
 * Estima tokens en un texto (aproximación simple: palabras / 1.3)
 */
export function estimateTokens(text: string): number {
    const words = text.trim().split(/\s+/).length
    return Math.ceil(words / 1.3)
}

interface ChunkResult {
    content: string
    tokens: number
    order: number
}

/**
 * Divide texto en chunks por párrafos con overlap
 * Estrategia: cada chunk trata de mantener ~chunkSize tokens
 *            pero no rompe párrafos si es posible
 */
export function chunkByParagraphs(
    text: string,
    chunkSize: number = DEFAULT_RAG_CONFIG.chunkSize,
    chunkOverlap: number = DEFAULT_RAG_CONFIG.chunkOverlap
): ChunkResult[] {
    const paragraphs = text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

    const chunks: ChunkResult[] = []
    let currentChunk = ""
    let currentTokens = 0
    let overlapBuffer = ""
    let order = 0

    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokens(paragraph)

        // Si agregar este párrafo excede el límite, guarda el chunk actual
        if (currentTokens + paragraphTokens > chunkSize && currentChunk) {
            chunks.push({
                content: currentChunk.trim(),
                tokens: currentTokens,
                order: order++,
            })

            // Calcula overlap buffer (últimas N palabras del chunk)
            const words = currentChunk.trim().split(/\s+/)
            const overlapWords = Math.ceil(
                (chunkOverlap * words.length) / currentTokens
            )
            overlapBuffer = words.slice(-overlapWords).join(" ")

            currentChunk = overlapBuffer + "\n" + paragraph
            currentTokens =
                estimateTokens(overlapBuffer) + paragraphTokens
        } else {
            currentChunk += (currentChunk ? "\n" : "") + paragraph
            currentTokens += paragraphTokens
        }
    }

    // Guarda el último chunk
    if (currentChunk.trim()) {
        chunks.push({
            content: currentChunk.trim(),
            tokens: currentTokens,
            order: order,
        })
    }

    return chunks
}

/**
 * Divide texto en chunks de tamaño fijo (por tokens)
 * Opción más agresiva si no hay párrafos claros
 */
export function chunkByTokens(
    text: string,
    chunkSize: number = DEFAULT_RAG_CONFIG.chunkSize,
    chunkOverlap: number = DEFAULT_RAG_CONFIG.chunkOverlap
): ChunkResult[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    const chunks: ChunkResult[] = []
    let currentChunk: string[] = []
    let currentTokens = 0
    let order = 0

    for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence)

        if (currentTokens + sentenceTokens > chunkSize && currentChunk.length > 0) {
            const content = currentChunk.join(" ").trim()
            chunks.push({
                content,
                tokens: currentTokens,
                order: order++,
            })

            // Overlap: mantiene algunas oraciones del chunk anterior
            const overlapSentences = Math.ceil(
                (chunkOverlap * currentChunk.length) / currentTokens
            )
            currentChunk = currentChunk.slice(-overlapSentences)
            currentTokens = currentChunk.reduce(
                (sum, s) => sum + estimateTokens(s),
                0
            )
        }

        currentChunk.push(sentence)
        currentTokens += sentenceTokens
    }

    if (currentChunk.length > 0) {
        chunks.push({
            content: currentChunk.join(" ").trim(),
            tokens: currentTokens,
            order: order,
        })
    }

    return chunks
}

/**
 * Limpia texto para mejorar calidad de chunks
 */
export function cleanText(text: string): string {
    return (
        text
            // Normaliza espacios en blanco
            .replace(/\s+/g, " ")
            // Remove URLs (opcional)
            .replace(/https?:\/\/\S+/g, "[LINK]")
            // Remove emails
            .replace(/\S+@\S+/g, "[EMAIL]")
            // Normaliza comillas
            .replace(/["\"]/g, '"')
            .trim()
    )
}

/**
 * API principal de chunking
 * Elige automáticamente estrategia basada en estructura
 */
export function chunk(
    text: string,
    chunkSize: number = DEFAULT_RAG_CONFIG.chunkSize,
    chunkOverlap: number = DEFAULT_RAG_CONFIG.chunkOverlap
): ChunkResult[] {
    const cleaned = cleanText(text)

    // Detecta si hay párrafos claros
    const hasParagraphs = cleaned.split("\n").length > 3

    if (hasParagraphs) {
        return chunkByParagraphs(cleaned, chunkSize, chunkOverlap)
    } else {
        return chunkByTokens(cleaned, chunkSize, chunkOverlap)
    }
}
