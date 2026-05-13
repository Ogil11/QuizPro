# feature/rag-engine — FASE 1-5 COMPLETADA ✅

Motor RAG (Retrieval-Augmented Generation) usando Ollama + nomic-embed-text para embeddings vectoriales.
**Backend:** Roble (Uninorte) + DocumentChunk table.

## Arquitectura

```
Documento cargado (PDF/IMG/Link)
    ↓
    Extracción de texto [Fase 2: content-upload]
    ↓
    chunk.ts: Chunking semántico (~500 tokens/chunk)
    ↓
    embedding.ts: Embeddings via Ollama (nomic-embed-text)
    ↓
    roble-client.ts: robleDbInsert() → DocumentChunk table en Roble
    ↓
    /api/rag/query: Endpoint búsqueda vectorial
    ↓
    gemma-client.ts: Contexto RAG → mejores preguntas [Fase 6]
```

## FASES COMPLETADAS

### Fase 1: Setup ✅
- Tablas Roble: `DocumentChunk`, actualización `Document`
- Módulos RAG core: `types.ts`, `chunk.ts`, `embedding.ts`, `index.ts`

### Fase 3: Chunking ✅
- Estrategia dual: por párrafos o por oraciones
- Token estimation + overlap handling

### Fase 4: Embeddings ✅
- Ollama integration (`nomic-embed-text`)
- Cosine similarity + batch processing

### Fase 5: Query Endpoint ✅
- `GET /api/rag/query?q=search&limit=5`
- `POST /api/rag/query` (para queries largas)
- `GET /api/rag/status` (debug info)

## Endpoints Disponibles

### Query Search
```bash
# GET (simple)
curl "http://localhost:3000/api/rag/query?q=machine%20learning&limit=3" \
  -H "Cookie: [auth-cookie]"

# POST (para queries complejas)
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -H "Cookie: [auth-cookie]" \
  -d '{
    "q": "explica conceptos de machine learning",
    "limit": 5
  }'
```

**Response:**
```json
{
  "success": true,
  "query": "machine learning",
  "chunks": [
    {
      "id": "chunk_123",
      "documentId": "doc_456",
      "content": "...",
      "order": 0,
      "tokens": 150,
      "similarity": 0.92
    }
  ],
  "context": "Texto concatenado de chunks relevantes...",
  "totalChunks": 3,
  "totalDistance": 2.45
}
```

### Status Check
```bash
curl http://localhost:3000/api/rag/status \
  -H "Cookie: [auth-cookie]"
```

**Response:**
```json
{
  "status": "ok",
  "authenticated": true,
  "database": {
    "totalDocuments": 5,
    "completedDocuments": 3,
    "totalChunks": 42
  },
  "ollama": {
    "url": "http://localhost:11434",
    "model": "nomic-embed-text",
    "available": true
  }
}
```

## Configuración Requerida

### Env Variables
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
ROBLE_BASE_URL=https://roble-api.openlab.uninorte.edu.co
ROBLE_DB_NAME=[tu_db_en_roble]
```

### Ollama Setup
```bash
ollama pull nomic-embed-text
ollama serve  # default puerto 11434
```

## Próximas Fases

- **Fase 2:** Text extraction (PDF, OCR, readability)
- **Fase 6:** Integración con `gemma-client.ts` para quiz generación contextualizada
- **Fase 7:** Upload UI con drag & drop

## Uso en Código

```typescript
// En rutas API o server components
import { queryRAG, DEFAULT_RAG_CONFIG } from "@/features/rag-engine"

const result = await queryRAG(
  "search query",
  session.robleAccessToken,  // ← accesToken requerido
  session.user.id,           // ← userId opcional para filtrar
  5                          // ← limit (max 20)
)

// result = { chunks, context, totalDistance }
```
