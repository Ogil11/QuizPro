/**
 * Tipos para el motor RAG
 */

export interface DocumentChunkData {
    id: string
    documentId: string
    content: string
    order: number
    tokens: number
    embedding: number[]
    createdAt: Date
    similarity?: number
}

export interface EmbeddingResult {
    content: string
    embedding: number[]
    tokens: number
}

export interface RAGQueryResult {
    chunks: DocumentChunkData[]
    context: string // texto concatenado de chunks relevantes
    totalDistance: number // suma de distancias
}

export interface RAGConfig {
    ollamaBaseUrl: string
    embeddingModel: string
    chunkSize: number // tokens
    chunkOverlap: number // tokens
    similarityThreshold: number
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
    chunkSize: 500,
    chunkOverlap: 50,
    similarityThreshold: 0.3,
}
