import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { robleSignup } from "@/src/features/auth/roble-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: "Email y contrase\u00f1a son requeridos" }, { status: 400 })
    }
    const lower = String(email).toLowerCase()
    const exists = await prisma.user.findUnique({ where: { email: lower } })
    if (exists) return NextResponse.json({ error: "Usuario ya existe" }, { status: 409 })

    const hashed = await bcrypt.hash(password, 10)

    // Try Roble signup; do not fail if Roble unreachable
    let robleUserId: string | null = null
    try {
      const r = await robleSignup(lower, password, name)
      if (r?.success) robleUserId = r.user?.id ?? null
    } catch {}

    const user = await prisma.user.create({
      data: {
        email: lower,
        password: hashed,
        name: name ?? lower.split("@")[0],
        provider: robleUserId ? "roble" : "credentials",
        robleUserId,
      },
    })
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } })
  } catch (e: any) {
    console.error("signup error", e)
    return NextResponse.json({ error: e?.message ?? "Error al crear usuario" }, { status: 500 })
  }
}
