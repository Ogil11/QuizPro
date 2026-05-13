"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/src/shared/navbar"
import { Sparkles, Trophy, Target, Clock, BarChart3 } from "lucide-react"
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

export default function Profile() {
  const { data: session, status } = useSession() || {}
  const router = useRouter()
  const [attempts, setAttempts] = useState<any[]>([])
  useEffect(() => { if (status === "unauthenticated") router.replace("/login") }, [status, router])
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/attempts").then(r=>r.json()).then(d=> setAttempts(d.attempts ?? []))
  }, [status])

  const total = attempts.length
  const avg = total ? attempts.reduce((s, a) => s + a.score, 0) / total : 0
  const errors = attempts.reduce((s, a) => s + ((a.total ?? 0) - (a.correct ?? 0)), 0)
  const chartData = [...attempts].reverse().map((a, i) => ({ name: `#${i+1}`, score: Math.round(a.score) }))

  return (
    <div className="min-h-screen">
      <Navbar/>
      <main className="max-w-[1200px] mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{(session?.user as any)?.name ?? "Mi perfil"}</h1>
          <p className="text-muted-foreground text-sm">{session?.user?.email}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Stat icon={Trophy} label="Quizzes realizados" value={total}/>
          <Stat icon={Target} label="Promedio" value={`${Math.round(avg)}%`}/>
          <Stat icon={Clock} label="Errores totales" value={errors}/>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary"/>Progreso</h3>
          <div className="h-64">
            {chartData.length === 0 ? <p className="text-muted-foreground text-sm">Aún no has resuelto quizzes.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{top:10,right:10,bottom:0,left:0}}>
                  <XAxis dataKey="name" tick={{fontSize:10}} tickLine={false}/>
                  <YAxis domain={[0,100]} tick={{fontSize:10}} tickLine={false}/>
                  <Tooltip/>
                  <Line type="monotone" dataKey="score" stroke="#60B5FF" strokeWidth={2} dot={{r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm">
          <h3 className="font-display font-semibold mb-3">Historial</h3>
          {attempts.length === 0 ? <p className="text-sm text-muted-foreground">Sin intentos aún.</p> : (
            <div className="divide-y">
              {attempts.map(a => (
                <div key={a.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{a.quiz?.name ?? "Quiz"}</div>
                    <div className="text-xs text-muted-foreground">{a.quiz?.category} · {new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{Math.round(a.score)}%</div>
                    <div className="text-xs text-muted-foreground">{a.correct}/{a.total}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-primary/5 p-6 rounded-lg shadow-sm border border-primary/20">
          <div className="flex items-center gap-2 mb-1"><Sparkles className="h-4 w-4 text-primary"/><h3 className="font-display font-semibold">Retroalimentación IA personalizada</h3></div>
          <p className="text-sm text-muted-foreground">Análisis profundo de tus debilidades y temas a reforzar.</p>
        </div>
      </main>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="bg-card p-5 rounded-lg shadow-sm flex items-center gap-4">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center"><Icon className="h-6 w-6 text-primary"/></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-2xl">{value}</div>
      </div>
    </div>
  )
}
