# QuizPro Adaptive Learning

Aplicación web de aprendizaje adaptativo para crear, compartir y resolver quizzes interactivos, con generación de preguntas mediante IA (Gemma 4) y retroalimentación personalizada.

Proyecto del curso — equipo: **Alberto, Alejandro, Sebastián, Emanuel, Santiago, Oscar**.

---

## 🚀 Setup rápido

```bash
cd nextjs_space
yarn install
cp ../.env.example .env   # o copia .env.example y completa
yarn prisma db push
yarn prisma db seed
yarn dev
```

App en `http://localhost:3000`.

## 🔐 Variables de entorno

Ver `.env.example`:

| Variable | Propósito |
|---|---|
| `DATABASE_URL` | Postgres (Prisma) |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | NextAuth |
| `ROBLE_BASE_URL` | `https://roble.openlab.uninorte.edu.co` |
| `ROBLE_DB_NAME` | `quiz_pro_adaptative_learning_cfb3560bb8` |
| `GEMMA_API_URL` | `http://localhost:11434` (Ollama) |
| `GEMMA_MODEL` | p.ej. `gemma2:4b` |
| `ABACUSAI_API_KEY` | Fallback LLM cloud |
| `GOOGLE_CLIENT_ID/SECRET` | TODO Alberto |

## 📁 Estructura

```
nextjs_space/
  app/                    # Rutas Next.js (App Router)
    api/                  # API routes (auth, signup, quizzes, attempts, ...)
    dashboard/            # Listado de quizzes
    quiz/[id]/play|edit|result
    profile/
    login/, signup/
  src/
    features/
      auth/               # Roble client + NextAuth providers (Alberto)
      quiz-manager/       # Builder + Gemma client (Alejandro)
      content-upload/     # TODO (Sebastián)
      rag-engine/         # TODO (Emanuel)
      quiz-results/       # En páginas de resultados (Santiago)
      ai-feedback/        # TODO (Oscar)
    shared/               # Navbar y componentes comunes
  lib/                    # db (Prisma singleton), auth, types
  prisma/schema.prisma
  scripts/seed.ts
```

## 🌿 Ramas y responsables

| Rama | Responsable | Módulo | Estado |
|---|---|---|---|
| `feature/auth` | Alberto | Email/pass + Roble + (TODO) Google OAuth | MVP listo |
| `feature/quiz-manager` | Alejandro | CRUD quizzes, modos manual/IA/mixto | MVP listo |
| `feature/content-upload` | Sebastián | Carga PDF / imágenes / links | 📦 TODO |
| `feature/rag-engine` | Emanuel | RAG con Gemma, embeddings | 📦 TODO |
| `feature/quiz-results` | Santiago | Resolución + gráficos | MVP listo |
| `feature/ai-feedback` | Oscar | Retroalimentación IA detallada | 📦 TODO |

Cada rama tiene un README dentro de `src/features/<nombre>/README.md` con su lista de tareas.

## 🤝 Flujo de contribución

```bash
git checkout -b feature/<tu-modulo>
# ...trabajo...
git add . && git commit -m "feat(<modulo>): ..."
git push origin feature/<tu-modulo>
# Abre PR hacia main
```

Repo: https://github.com/Ogil11/QuizProAdaptativeLearning

## 🧩 Módulos del MVP

- **Auth** (Alberto): NextAuth + Credentials. Si las credenciales no existen localmente, intenta autenticar contra Roble (`/auth/{db}/login`). El signup llama a `/auth/{db}/signup-direct` en Roble además de crear el usuario local. Google OAuth dejado como TODO.
- **Quiz Manager** (Alejandro): builder con 3 modos (manual / IA / mixto), 3 tipos de pregunta (single / multiple / truefalse), CRUD completo, público/privado.
- **IA con Gemma 4** (Alejandro + Emanuel): `gemma-client.ts` llama a `POST {GEMMA_API_URL}/api/generate` con `format: "json"`. Si falla (Ollama no disponible), hace fallback a la API de Abacus para que el MVP funcione en cualquier entorno.
- **Resolución y resultados** (Santiago): UI paso a paso, guarda intentos en `QuizAttempt`, muestra gráficos (Pie de aciertos, Bar de tiempo) con Recharts.
- **Perfil**: estadísticas (promedio, errores, progreso) + sección separada de retroalimentación IA.
- **TODO** documentados en cada `feature/*/README.md`.

## 🧪 Pruebas rápidas

1. `Crear cuenta` o usa la cuenta de prueba sembrada (ver `scripts/seed.ts`).
2. Ve a *Crear* → elige modo *Generar con IA* → escribe un tema → *Generar*.
3. Guarda y resuelve el quiz. Mira los gráficos de resultados.

## 📜 Notas técnicas

- Stack: Next.js 14 (App Router), Prisma + Postgres, NextAuth (JWT), TailwindCSS, Recharts, Framer Motion.
- Almacenamiento de archivos: AWS S3 (configurado, listo para `feature/content-upload`).
- Gemma local recomendado: `ollama run gemma2:4b`.
