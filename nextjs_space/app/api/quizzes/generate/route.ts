import { NextRequest, NextResponse } from "next/server"

import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"

import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"
import { queryRAG } from "@/src/features/rag-engine"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    // ========== AUTENTICACIÓN ==========
    // Verificar sesión (de main_secundario)
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json(
        {
          error: "No autorizado",
        },
        {
          status: 401,
        }
      )
    }

    // ========== LECTURA Y PARSEO ==========
    // Leer body una sola vez
    const body = await req.json()

    const {
      topic,
      count = 5,
      difficulty = "medium",
      types = ["single", "multiple", "truefalse"],
      useRag = true,
      ragLimit = 6,
      context,
    } = body

    // ========== VALIDACIONES ROBUSTAS ==========
    // De main: validación de tipo string
    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        {
          error: "El tema es requerido",
        },
        {
          status: 400,
        }
      )
    }

    // Limitar cantidad (de main)
    const safeCount = Math.min(
      Math.max(Number(count) || 5, 1),
      15
    )

    // ========== RAG ENGINE (de main_secundario) ==========
    // Preparar contexto RAG si está disponible
    let ragContext = typeof context === "string" ? context.trim() : ""
    let ragMeta = {
      enabled: Boolean(useRag),
      used: false,
      chunks: 0,
      totalDistance: 0,
      warning: undefined as string | undefined,
    }

    const accessToken = (session.user as any)?.robleAccessToken as
      | string
      | undefined
    const userId = (session.user as any)?.id as string | undefined

    if (useRag && !ragContext && accessToken && userId) {
      try {
        const ragResult = await queryRAG(
          topic,
          accessToken,
          userId,
          Math.max(1, Math.min(10, Number(ragLimit) || 6))
        )
        ragContext = ragResult.context
        ragMeta = {
          enabled: true,
          used: ragResult.context.length > 0,
          chunks: ragResult.chunks.length,
          totalDistance: Math.round(ragResult.totalDistance * 10000) / 10000,
          warning:
            ragResult.context.length > 0
              ? undefined
              : "No relevant RAG context found",
        }
      } catch (error: any) {
        ragMeta.warning = error?.message || "RAG lookup failed"
        console.warn("[RAG] Warning:", ragMeta.warning)
      }
    }

    // ========== GENERACIÓN DE PREGUNTAS ==========
    const questions = await generateQuestions(
      topic,
      safeCount,
      difficulty,
      types,
      ragContext
        ? { context: ragContext, contextSource: useRag ? "rag" : "manual" }
        : {}
    )

    // ========== VALIDACIÓN DE RESULTADO ==========
    // De main: validar que sea array
    if (!Array.isArray(questions)) {
      return NextResponse.json(
        {
          error: "Gemma devolvió un formato inválido",
        },
        {
          status: 500,
        }
      )
    }

    // ========== RESPUESTA EXITOSA ==========
    return NextResponse.json({
      success: true,
      questions,
      rag: ragMeta, // Incluir metadata de RAG si fue usado
    })
  } catch (error: any) {
    console.error("Error generando preguntas:", error)

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Error generando preguntas con Gemma",
      },
      {
        status: 500,
      }
    )
  }
}