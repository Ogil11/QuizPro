# feature/ai-feedback

Retroalimentacion personalizada con Gemma 4 basada en intentos de quiz.

## Estado actual (MVP)
- Tabla `UserFeedback` en Roble.
- Endpoint `/api/feedback/generate`.
- Feedback post-quiz en `/quiz/[id]/result`.
- Consulta durable de intento en `/api/attempts/[id]`.

## Hecho
- [x] Analizar `QuizAttempt.answers` por usuario.
- [x] Detectar temas o areas debiles.
- [x] Generar explicaciones con Gemma.
- [x] Persistir en `UserFeedback` usando Roble.

## Pendiente
- [ ] UI de feedback acumulado en perfil.
- [ ] Accion para crear quizzes sugeridos desde el feedback.
