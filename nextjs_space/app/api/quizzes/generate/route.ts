import { NextRequest, NextResponse } from "next/server"

import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"

import { generateQuestions } from "@/src/features/quiz-manager/gemma-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {

  try {

    // Verificar sesión
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

    // Leer body
    const body = await req.json()

    const {
      topic,
      count = 5,
      difficulty = "medium",
      types = ["single", "multiple", "truefalse"],
    } = body

    // Validaciones
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

    // Limitar cantidad
    const safeCount = Math.min(
      Math.max(Number(count) || 5, 1),
      15
    )

    // Generar preguntas con Gemma
    const questions = await generateQuestions(
      topic,
      safeCount,
      difficulty,
      types
    )

    // Validar resultado
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

    // Respuesta correcta
    return NextResponse.json({
      success: true,
      questions,
    })

  } catch (error: any) {

    console.error(
      "Error generando preguntas:",
      error
    )

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Error generando preguntas con Gemma 4",
      },
      {
        status: 500,
      }
    )
  }
}