import { NextRequest, NextResponse } from "next/server"
import { robleSignup } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 })
    }

    const lower = String(email).toLowerCase()
    const displayName = name ?? lower.split("@")[0]

    const r = await robleSignup(lower, password, name)
    if (!r?.success) {
      const status = typeof r?.status === "number" ? r.status : 500
      if (status === 409) {
        return NextResponse.json({ error: "Usuario ya existe" }, { status: 409 })
      }
      return NextResponse.json({ error: r?.error ?? "Error al crear usuario en Roble" }, { status })
    }

    return NextResponse.json({ ok: true, user: { id: r.user?.id ?? `roble:${lower}`, email: lower, name: displayName } })
  } catch (e: any) {
    console.error("signup error", e)
    return NextResponse.json({ error: e?.message ?? "Error al crear usuario" }, { status: 500 })
  }
}
