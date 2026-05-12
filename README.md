# QuizPro Technical Audit

QuizPro is currently a Next.js quiz application located in `nextjs_space/`. The implemented product supports Roble-based signup/login, a quiz dashboard, manual quiz creation/editing, quiz play, attempt scoring, and profile statistics. AI generation, document upload, RAG, and AI feedback are present as stubs or early integrations rather than complete end-to-end features.

This README is an audit of the repository as implemented, not as intended.

## Current Architecture

```text
QuizPro/
  nextjs_space/
    app/                         Next.js App Router pages and API routes
      api/
        auth/[...nextauth]/       NextAuth route
        signup/                   Roble signup proxy
        quizzes/                  Quiz CRUD and AI generation routes
        attempts/                 Attempt scoring and history routes
        documents/                Document upload stub
        feedback/generate/        AI feedback with Gemma integration
      dashboard/                  Quiz list UI
      login/, signup/             Auth pages
      profile/                    Attempt stats UI
      quiz/new                    Quiz builder
      quiz/[id]/edit              Quiz editor
      quiz/[id]/play              Quiz player
      quiz/[id]/result            Result page using sessionStorage
    src/
      features/
        auth/roble-client.ts      Roble auth/database wrapper
        quiz-manager/             Quiz builder and Gemma/Abacus client
        content-upload/           TODO README only
        rag-engine/               TODO README only
        ai-feedback/              AI feedback service with Gemma integration
      shared/navbar.tsx
    components/                   Layout, providers, shadcn/Radix UI components
    lib/
      auth.ts                     NextAuth credentials config
      db.ts                       Prisma client, currently not used by main API routes
      types.ts                    Quiz draft types
    prisma/schema.prisma          PostgreSQL data model
```

## Stack

- Frontend framework: Next.js 14 with React 18 and the App Router.
- Routing: file-system routing under `app/`.
- Styling/UI: Tailwind CSS, Radix UI/shadcn-style components, lucide-react icons, next-themes, sonner.
- Auth session: NextAuth v4 with JWT sessions and credentials provider.
- State management: mostly local React state and NextAuth session context. `zustand`, `jotai`, React Query, and SWR are installed but not used by the implemented flows.
- API layer: Next.js route handlers under `app/api/*`. Frontend calls them with `fetch`.
- Database access actually used by app routes: custom Roble API wrapper in `src/features/auth/roble-client.ts`.
- Database schema present but mostly inactive: Prisma models in `prisma/schema.prisma`; seed scripts use Prisma, but runtime quiz/auth API routes do not.

## Roble Integration

Roble is the active backend integration for auth and quiz persistence.

Auth:
- `lib/auth.ts` configures NextAuth credentials.
- Login calls `robleLogin(email, password)`.
- Signup page posts to `/api/signup`, which calls `robleSignup`.
- NextAuth stores `id` and `robleAccessToken` in JWT/session.
- No local Prisma user is created during login/signup.

Database:
- Quiz, Question, and QuizAttempt routes call `robleDbRead`, `robleDbInsert`, `robleDbUpdate`, and `robleDbDelete`.
- Table names default to `Quiz`, `Question`, and `QuizAttempt`, configurable with `ROBLE_QUIZ_TABLE`, `ROBLE_QUESTION_TABLE`, and `ROBLE_ATTEMPT_TABLE`.
- The wrapper tries many table name variants, identity/snake_case field variants, and alternate Roble endpoint paths.

Storage:
- Not implemented.
- AWS S3 and Azure Blob packages are installed.
- `Document.storagePath` exists in Prisma.
- `src/features/content-upload/README.md` references a future `lib/s3.ts`, but that file does not exist.

API wrappers:
- `src/features/auth/roble-client.ts` is the central wrapper.
- It contains auth helpers, database read/insert/update/delete helpers, table-name guessing, key transformation, and invalid-column retry logic.

## Implemented Modules Status

Fully functional, assuming Roble tables and columns match expectations:
- Basic Next.js shell, theme provider, navbar.
- Credentials login against Roble.
- Signup proxy against Roble.
- Dashboard quiz listing from Roble.
- Manual quiz builder UI validation.
- Quiz play UI.
- Attempt scoring and attempt history.
- Profile stats from attempts.

Partially implemented:
- Quiz create/update/delete. The UI and routes exist, but persistence is fragile because inserted IDs and Roble schema behavior are not guaranteed.
- AI quiz generation. It calls local Ollama/Gemma first and Abacus as fallback, but has no streaming, no robust validation, no UI recovery beyond toast errors, and no RAG context.
- Prisma. Schema and seed exist, but main runtime routes use Roble instead.

UI only / mock / placeholder:
- Landing page claims adaptive AI features.
- Profile AI feedback panel (planned).

Partially implemented:
- AI feedback on result page. Uses Gemma local AI with keyword-based weak area detection, markdown rendering, and fallback messaging.

Broken or likely broken:
- End-to-end quiz persistence can fail or create disconnected records when Roble insert does not return the inserted quiz ID.
- Result page is not durable because it reads attempt results from `sessionStorage`; refresh or direct navigation loses the result.
- Type augmentation for NextAuth does not include `robleAccessToken`, so code relies on `any`.
- The UI has visible mojibake/encoding issues in several Spanish strings.
- `npm run lint` uses `next lint`, which is removed/unsupported in newer Next.js workflows and the repo mixes ESLint 9 with `eslint-config-next` 15 while using Next 14.

Missing:
- Local non-Roble persistence path.
- Real document upload UI/API.
- S3/Azure storage service.
- Text extraction.
- RAG chunking, embeddings, vector storage, query endpoint.
- Persistent AI feedback.
- Google OAuth.
- Authorization checks in some frontend paths before fetching protected data.
- Tests.

## Quiz Creation Flow

Manual flow:
1. User opens `/quiz/new`.
2. `QuizBuilder` stores form fields and questions in local React state.
3. On save, it validates name/questions/options/correct answers.
4. It posts to `/api/quizzes` with:
   - quiz metadata
   - `creationMode`
   - `questions`
5. `/api/quizzes` gets the NextAuth session.
6. The route extracts `session.user.id` and `session.user.robleAccessToken`.
7. It inserts one quiz record into Roble via `robleDbInsert({ tableName: "Quiz" })`.
8. It tries to read the inserted quiz ID from Roble's response.
9. It inserts question records into Roble via `robleDbInsert({ tableName: "Question" })`, using that quiz ID.
10. The UI redirects to `/dashboard`.
11. Dashboard calls `/api/quizzes?scope=...`, which reads quizzes, questions, and attempts separately from Roble and counts related rows client-side in the API route.

AI-assisted flow:
1. User selects AI or mixed mode in `QuizBuilder`.
2. User enters topic/count.
3. Frontend posts to `/api/quizzes/generate`.
4. Route calls `generateQuestions`.
5. `generateQuestions` calls local Ollama at `GEMMA_API_URL/api/generate` with model `GEMMA_MODEL`.
6. If Gemma fails, it calls Abacus Chat Completions when `ABACUSAI_API_KEY` exists.
7. Generated questions are inserted into the local builder state.
8. Persistence then uses the same manual save path.

## Why Quiz Persistence Currently Fails

The most important issue is ID ownership. `POST /api/quizzes` inserts a quiz into Roble without explicitly providing an ID. It then tries to extract `id`, `quizId`, or `_id` from Roble's insert response. If Roble returns no inserted row, no ID field, or a differently shaped payload, the route falls back to `crypto.randomUUID()`.

That fallback ID is then used as `quizId` for question inserts. If the real quiz row in Roble has a different generated ID, questions are saved under an ID that does not belong to the quiz. The dashboard may show the quiz with zero questions, `/quiz/[id]` cannot load its questions, and attempt scoring cannot work correctly.

Additional persistence risks:
- The wrapper strips columns after invalid-column errors, so fields required by the frontend can silently disappear from inserted records.
- `createdAt`, `updatedAt`, `isPublic`, `creationMode`, and `description` may be removed during fallback insert attempts.
- Roble table/column names are guessed rather than controlled by migrations.
- JSON fields such as `options`, `correctAnswers`, and `answers` rely on Roble accepting arrays/objects as provided.
- Prisma schema and Roble schema can drift because Prisma migrations are not the active source of truth.
- Users are Roble users only; local Prisma relations are not populated.

## Data Models Currently Used

Prisma schema defines:
- `User`
- `Quiz`
- `Question`
- `QuizAttempt`
- `Document`
- `UserFeedback`

Runtime Roble routes actively use these logical tables:
- `Quiz`
- `Question`
- `QuizAttempt`

Runtime auth uses Roble auth users, not Prisma `User`.

Defined but not actively used in runtime persistence:
- Prisma `Document`
- Prisma `UserFeedback`
- Prisma `User` relations
- Prisma seed demo quiz, unless the app is intentionally switched back to Prisma.

## AI Providers

Implemented provider calls:
- Gemma via local Ollama-compatible API:
  - default URL: `http://localhost:11434`
  - default model: `gemma2:4b`
  - endpoint: `/api/generate`
- Abacus AI fallback:
  - endpoint: `https://apps.abacus.ai/v1/chat/completions`
  - model string: `gpt-5.4-mini`
  - requires `ABACUSAI_API_KEY`

Referenced but not truly implemented:
- "Gemma 4" appears in UI and TODO docs, but the actual default model is `gemma2:4b`.

- RAG with Gemma/Ollama embeddings is only documented in TODO READMEs.
- Abacus browser script is loaded globally in `app/layout.tsx`, but the app's AI generation code uses server-side `fetch`, not that script.

Gemma verdict:
- Gemma is partially implemented for quiz question generation only.
- It is not implemented for feedback, RAG, document understanding, or adaptive learning.
- The app refers to "Gemma 4", but there is no verified Gemma 4 model integration in code.

## Document Upload And RAG Structure

Current structure:
- `/api/documents` exists.
- `GET /api/documents` returns `{ documents: [], todo: true }`.
- `POST /api/documents` returns HTTP 501.
- `Document` model exists in Prisma.
- Feature README files describe future S3 upload, extraction, chunking, embeddings, pgvector, and `/api/rag/query`.

What does not exist yet:
- Upload UI.
- `lib/s3.ts`.
- Presigned URL generation.
- File metadata persistence through Roble or Prisma.
- Text extraction.
- Chunk table/model.
- Embedding generation.
- Vector search.
- RAG query endpoint.
- Connection between uploaded documents and quiz generation.

## Comparison Against Stated Project Goals

No original specification file was found in the repo. Compared against the landing page copy and feature TODO READMEs:

Implemented:
- Create quizzes manually.
- Share public/private flag at data/UI level.
- Solve quizzes.
- See result charts.
- Track profile attempt history.
- Basic AI generation from a topic when providers are configured.

Partially implemented:
- AI-generated quizzes.
- Adaptive learning, in the sense that stats are displayed, but no adaptive logic changes content or recommendations.
- Roble backend integration.

Not implemented:
- Document upload.
- RAG.

- Google OAuth.
- Robust storage.
- Durable result retrieval.
- End-to-end non-AI reliability.
- Full schema/migration alignment.

## Dependency Map

```text
Browser UI
  -> Next.js pages in app/
    -> NextAuth SessionProvider
    -> fetch('/api/*')

/api/signup
  -> robleSignup
    -> Roble auth endpoint

NextAuth credentials
  -> robleLogin
    -> Roble auth endpoint
    -> JWT session with robleAccessToken

/api/quizzes
  -> robleDbRead/Insert
    -> Roble database endpoints
      -> Quiz, Question, QuizAttempt logical tables

/api/quizzes/[id]
  -> robleDbRead/Update/Delete/Insert
    -> Roble database endpoints

/api/attempts
  -> robleDbRead/Insert
    -> Roble database endpoints

/api/quizzes/generate
  -> generateQuestions
    -> Ollama/Gemma local API
    -> Abacus fallback API

/api/documents
  -> stub only

/api/feedback/generate
  -> Uses Gemma AI with fallback response

Prisma
  -> schema and seed scripts
  -> not the active runtime API persistence path
```

## Technical Debt

- Two competing persistence stories: Prisma schema/seed versus Roble runtime API.
- Very broad Roble wrapper guesses endpoint paths, table names, column casing, and fallback record shapes.
- Duplicate `snake` and `val` helper logic across API routes.
- Installed but unused state/data libraries: React Query, SWR, Zustand, Jotai.
- Installed but unused storage packages.
- UI text encoding issues.
- No tests around quiz creation, scoring, Roble response normalization, or AI JSON parsing.
- No durable result page data source.
- No migrations for Roble table shape.
- `types/next-auth.d.ts` does not match real session fields.
- `next.config.js` has custom chunk naming and output tracing settings that may be deployment-specific.
- `predev` runs `npm install --legacy-peer-deps`, which is slow and mutates dependencies before every dev run.
- `tsconfig.tsbuildinfo` is committed/generated noise.

## Minimum Changes For Functional End-To-End App Without AI

Priority is to make auth, quiz CRUD, play, scoring, and profile reliable before AI.

1. Choose one runtime persistence source.
   - Fastest path: keep Roble, but make the schema explicit.
   - Alternative: switch runtime APIs to Prisma/Postgres and use Roble only for auth if required.

2. Fix quiz ID creation.
   - Generate the quiz ID in the app before insert.
   - Insert quiz with that ID.
   - Insert questions with the same ID.
   - Remove random fallback IDs for persisted relations.

3. Define Roble table schemas explicitly.
   - Required tables: `Quiz`, `Question`, `QuizAttempt`.
   - Required columns must match route payloads.
   - Confirm JSON support for arrays/objects.

4. Stop stripping important columns silently.
   - Return actionable schema errors instead of mutating records until insert succeeds.

5. Centralize normalization helpers.
   - Move `snake`, `val`, and row mappers into one shared server utility.

6. Make results durable.
   - Add `GET /api/attempts/[id]` or include attempt lookup by query.
   - Result page should fetch attempt by ID instead of relying on `sessionStorage`.

7. Add basic tests or smoke checks.
   - Quiz create with two questions.
   - Dashboard counts questions.
   - Play quiz and submit attempt.
   - Profile loads attempt history.

8. Clean auth typing.
   - Add `robleAccessToken` to NextAuth session/JWT type declarations.

## Prioritized Roadmap

P0 - Make non-AI core reliable:
- Fix deterministic quiz IDs.
- Lock Roble schema/table names.
- Make results fetchable by attempt ID.
- Add route-level error messages that expose schema mismatch clearly.

P1 - Consolidate backend design:
- Decide Roble-only versus Prisma runtime.
- Remove unused persistence path or document it as dev/demo only.
- Add shared route utilities and typed DTOs.

P2 - Improve UX quality:
- Fix mojibake text.
- Add loading/error states to edit/play/profile.
- Hide edit/delete actions from non-owners.
- Add empty states and retry actions.

P3 - Add document/RAG foundation:
- Implement upload API and storage.
- Persist documents.
- Extract text.
- Add chunk model and embeddings.
- Add retrieval endpoint.

P4 - Rebuild AI features on top of stable data:
- Validate AI JSON with Zod.
- Add provider status and timeout handling.
- Connect RAG context to quiz generation.

P5 - Reduce dependency and maintenance cost:
- Remove unused libraries.
- Fix lint/build scripts.
- Add tests and CI.

## Environment Variables

Known variables used by the code:

```env
NEXTAUTH_URL=
NEXTAUTH_SECRET=
ROBLE_BASE_URL=https://roble-api.openlab.uninorte.edu.co
ROBLE_DB_NAME=
ROBLE_QUIZ_TABLE=Quiz
ROBLE_QUESTION_TABLE=Question
ROBLE_ATTEMPT_TABLE=QuizAttempt
GEMMA_API_URL=http://localhost:11434
GEMMA_MODEL=gemma2:4b
ABACUSAI_API_KEY=
DATABASE_URL=
```

`DATABASE_URL` is required for Prisma scripts, but the main app routes currently use Roble for quiz data.

## Development

```bash
cd nextjs_space
npm install --legacy-peer-deps
npm run dev
```

The app starts with `next dev`. Note that the current `predev` script automatically runs `npm install --legacy-peer-deps` before every dev server start.

## Current Bottom Line

The application has a usable frontend and a plausible Roble integration, but it is not yet a dependable end-to-end product. The first fix should be deterministic quiz persistence without AI. Once quiz creation, play, scoring, and profile history are stable, AI generation, upload, RAG, and feedback can be layered on with much less uncertainty.
