# feature/content-upload

Carga de contenido para alimentar el motor RAG con Roble + Ollama.

## Estado actual

- `GET /api/documents`: lista documentos del usuario autenticado.
- `POST /api/documents` con JSON `{ "url": "https://..." }`: extrae texto de URLs HTML, texto o PDF.
- `POST /api/documents` con `multipart/form-data` campo `file`: extrae texto de `.txt`, `.md`, `.csv`, `.json`, `.html` y `.pdf`.
- `DELETE /api/documents` con JSON `{ "id": "[documentId]" }`: elimina un documento del usuario autenticado y sus chunks RAG.
- Persiste `Document` en Roble con `extractedText`.
- Llama a `processDocument()` para chunking, embeddings y guardado en `DocumentChunk`.

## Ejemplos

URL:

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -H "Cookie: [tu_auth_cookie]" \
  -d "{\"url\":\"https://example.com/article\"}"
```

Archivo:

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Cookie: [tu_auth_cookie]" \
  -F "file=@./documento.pdf"
```

Después de una carga exitosa:

```bash
curl "http://localhost:3000/api/rag/query?q=tema&limit=3" \
  -H "Cookie: [tu_auth_cookie]"
```

## Pendiente

- UI de upload con drag & drop.
- Almacenamiento real de archivos en S3/Azure en vez de `memory://`.
- OCR para imágenes escaneadas.
- Procesamiento asíncrono/background para documentos grandes.
