# feature/ai-feedback (Oscar) — TODO

Retroalimentación personalizada con Gemma 4 basada en intentos de quiz.

## Estado actual (MVP)
- Modelo `UserFeedback` en Prisma
- Endpoint stub `/api/feedback/generate` (TODO)
- Sección "Retroalimentación IA" en `/profile` (placeholder)

## TODO
- [ ] Analizar `QuizAttempt.answers` por usuario
- [ ] Detectar temas/áreas débiles
- [ ] Generar explicaciones con Gemma vía streaming
- [ ] Persistir en `UserFeedback`
- [ ] UI de feedback en perfil con markdown
