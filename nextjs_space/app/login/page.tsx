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

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (res?.error) toast.error("Credenciales inv\u00e1lidas")
    else { toast.success("Bienvenido"); router.replace("/dashboard") }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-6 font-display font-bold text-2xl"><Brain className="h-7 w-7 text-primary"/>QuizPro</Link>
        <form onSubmit={onSubmit} className="bg-card p-8 rounded-lg shadow-md space-y-4">
          <h1 className="font-display text-2xl font-semibold">Ingresar</h1>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"/>
          </div>
          <div className="space-y-2">
            <Label>Contraseña</Label>
            <Input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
          </div>
          <Button className="w-full" disabled={loading} type="submit">{loading ? "Ingresando..." : "Ingresar"}</Button>
          <p className="text-sm text-center text-muted-foreground">
            ¿No tienes cuenta? <Link href="/signup" className="text-primary font-medium">Regístrate</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
