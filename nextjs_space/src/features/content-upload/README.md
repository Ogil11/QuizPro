# feature/content-upload (Sebastián) — TODO

Carga de contenido (PDF, imágenes, links) para alimentar el motor RAG.

## Estado actual (MVP)
- Modelo `Document` ya en Prisma
- Endpoint base `/api/documents` (GET/POST stub)
- Almacenamiento S3 ya configurado (`lib/s3.ts` — TODO)

## TODO
- [ ] Implementar `lib/s3.ts` con presigned URLs (single + multipart)
- [ ] UI de upload con drag & drop
- [ ] Extracción de texto:
  - PDF: enviar base64 al endpoint LLM
  - Imágenes: visión multimodal
  - Links: fetch + readability
- [ ] Persistir `extractedText` en `Document`
- [ ] Pasar a `feature/rag-engine` para indexar
