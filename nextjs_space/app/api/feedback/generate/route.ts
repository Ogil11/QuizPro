import { NextResponse } from "next/server"
// TODO: feature/ai-feedback (Oscar)
// Stub que generará retroalimentación personalizada con Gemma 4
// usando QuizAttempt.answers para identificar temas débiles.
export const dynamic = "force-dynamic"
export async function POST() {
  return NextResponse.json({
    todo: true,
    message: "Endpoint pendiente de implementación por feature/ai-feedback (Oscar).",
  })
}
