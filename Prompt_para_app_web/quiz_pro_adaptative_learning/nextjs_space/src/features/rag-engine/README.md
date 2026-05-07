# feature/rag-engine (Emanuel) — TODO

Motor RAG (Retrieval-Augmented Generation) usando Gemma 4 vía Ollama.

## Objetivos
- Extracción de texto desde documentos cargados (PDF, imágenes, links)
- Chunking + embeddings
- Almacenamiento vectorial (sugerido: pgvector sobre el mismo Postgres)
- Recuperación semántica para enriquecer prompts de generación de quizzes

## TODO
- [ ] Implementar pipeline de chunking en `chunk.ts`
- [ ] Generar embeddings (modelo de Ollama: `nomic-embed-text`)
- [ ] Habilitar extensión `pgvector` y agregar tabla `DocumentChunk`
- [ ] Endpoint `/api/rag/query` que devuelva contexto relevante
- [ ] Conectar con `quiz-manager` para modo IA basado en documentos
