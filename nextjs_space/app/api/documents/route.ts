import { NextResponse } from "next/server"
// TODO: feature/content-upload (Sebastián) y feature/rag-engine (Emanuel)
// Cargar y listar documentos para alimentar RAG.
export const dynamic = "force-dynamic"
export async function GET() {
  return NextResponse.json({ documents: [], todo: true })
}
export async function POST() {
  return NextResponse.json({ todo: true, message: "Subida de documentos pendiente (Sebastián)." }, { status: 501 })
}
