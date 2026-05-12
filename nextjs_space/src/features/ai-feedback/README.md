# feature/ai-feedback — Retroalimentación IA

Retroalimentación personalizada con Gemma 4 basada en intentos de quiz.

## Estado: ✅ Implementado (MVP)

### Componentes implementados:
1. **Servicio de feedback** (`src/features/ai-feedback/feedback-service.ts`)
   - Detección de áreas débiles basada en palabras clave del texto
   - Prompt pedagógico estructurado para Gemma
   - Fallback inteligente cuando Gemma no está disponible

2. **Endpoint API** (`app/api/feedback/generate/route.ts`)
   - POST `/api/feedback/generate`
   - Recibe datos del intento y respuestas detalladas
   - Retorna feedback formateado con markdown

3. **UI en página de resultados** (`app/quiz/[id]/result/page.tsx`)
   - Sección "Retroalimentación IA" actualizada
   - Estados: loading, error, success
   - Badges de áreas a reforzar (< 70% accuracy)

4. **Componente Markdown** (`components/feedback-markdown.tsx`)
   - Renderizado de markdown con estilos custom
   - Soporte para headers, listas, énfasis, code blocks

### Flujo:
1. Usuario completa quiz → se guarda en sessionStorage
2. Navega a `/quiz/[id]/result?attempt=X`
3. Página carga datos del intento
4. Se llama automáticamente a `/api/feedback/generate`
5. Se muestra feedback con estados de loading/error

### Dependencias:
- `react-markdown` para renderizado de contenido

### Variables de entorno:
- `GEMMA_API_URL` (default: `http://localhost:11434`)
- `GEMMA_MODEL` (default: `gemma4:e4b`)

## TODO (futuro)
- [ ] Persistir feedback en `UserFeedback`
- [ ] UI de historial de feedback en `/profile`
- [ ] Streaming de respuestas de Gemma
- [ ] Categorización avanzada de temas
