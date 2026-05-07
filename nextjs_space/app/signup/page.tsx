"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Brain } from "lucide-react"
import { toast } from "sonner"

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Error al crear cuenta"); return }
      const r = await signIn("credentials", { email, password, redirect: false })
      if (r?.error) { toast.error("Error al iniciar sesi\u00f3n"); return }
      toast.success("Cuenta creada")
      router.replace("/dashboard")
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-6 font-display font-bold text-2xl"><Brain className="h-7 w-7 text-primary"/>QuizPro</Link>
        <form onSubmit={onSubmit} className="bg-card p-8 rounded-lg shadow-md space-y-4">
          <h1 className="font-display text-2xl font-semibold">Crear cuenta</h1>
          <div className="space-y-2"><Label>Nombre</Label><Input value={name} onChange={e=>setName(e.target.value)} required/></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div className="space-y-2"><Label>Contraseña</Label><Input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)}/></div>
          <Button className="w-full" disabled={loading} type="submit">{loading ? "Creando..." : "Crear cuenta"}</Button>
          <p className="text-sm text-center text-muted-foreground">¿Ya tienes cuenta? <Link href="/login" className="text-primary font-medium">Ingresa</Link></p>
        </form>
      </div>
    </div>
  )
}
