"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/src/shared/navbar"
import { Button } from "@/components/ui/button"
import { Trophy, Repeat, BarChart3, Sparkles, CheckCircle2, XCircle } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"

export default function ResultPage() {
  const params = useParams() as { id: string }
  const search = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const attemptId = search.get("attempt")
    const raw = attemptId ? sessionStorage.getItem(`attempt-${attemptId}`) : null
    if (raw) setData(JSON.parse(raw)); else router.replace("/dashboard")
  }, [search, router])

  if (!data) return <div className="min-h-screen"><Navbar/><div className="p-8">Cargando...</div></div>
  const { attempt, detailed, quiz } = data
  const correct = attempt.correct ?? 0
  const incorrect = (attempt.total ?? 0) - correct
  const pieData = [{ name: "Correctas", value: correct }, { name: "Incorrectas", value: incorrect }]
  const COLORS = ["#80D8C3", "#FF9898"]
  const timeData = (detailed ?? []).map((d: any, i: number) => ({
    name: `P${i+1}`, segundos: Math.round((d.timeMs ?? 0) / 100) / 10, correcta: d.correct ? 1 : 0,
  }))

  return (
    <div className="min-h-screen">
      <Navbar/>
      <main className="max-w-[1000px] mx-auto px-4 py-8 space-y-6">
        <div className="bg-card p-8 rounded-lg shadow-sm text-center">
          <Trophy className="h-12 w-12 text-primary mx-auto mb-3"/>
          <h1 className="font-display text-3xl font-bold tracking-tight mb-1">{Math.round(attempt.score)} pts</h1>
          <p className="text-muted-foreground">{correct} de {attempt.total} correctas · {attempt.durationSec}s</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card p-6 rounded-lg shadow-sm">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary"/>Distribución</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                    {pieData.map((_,i)=> <Cell key={i} fill={COLORS[i]}/>)}
                  </Pie>
                  <Legend verticalAlign="top" wrapperStyle={{fontSize:11}}/>
                  <Tooltip/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-card p-6 rounded-lg shadow-sm">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary"/>Tiempo por pregunta (s)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData} margin={{top:10,right:10,bottom:20,left:0}}>
                  <XAxis dataKey="name" tick={{fontSize:10}} tickLine={false}/>
                  <YAxis tick={{fontSize:10}} tickLine={false}/>
                  <Tooltip/>
                  <Bar dataKey="segundos" fill="#60B5FF" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm">
          <h3 className="font-display font-semibold mb-3">Revisión</h3>
          <div className="space-y-2">
            {(detailed ?? []).map((d: any, i: number) => {
              const q = quiz.questions[i]
              return (
                <div key={i} className={`p-3 rounded-md ${d.correct ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-rose-50 dark:bg-rose-950/20"}`}>
                  <div className="flex items-start gap-2">
                    {d.correct ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5"/> : <XCircle className="h-4 w-4 text-rose-600 mt-0.5"/>}
                    <div className="text-sm">
                      <div className="font-medium">{i+1}. {q.text}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Tu respuesta: {d.selected.map((x:number)=>q.options[x]).join(", ") || "(vacía)"}
                      </div>
                      {!d.correct && <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Correcta: {q.correctAnswers.map((x:number)=>q.options[x]).join(", ")}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-primary/5 p-6 rounded-lg shadow-sm border border-primary/20">
          <div className="flex items-center gap-2 mb-1"><Sparkles className="h-4 w-4 text-primary"/><h3 className="font-display font-semibold">Retroalimentación IA</h3></div>
          <p className="text-sm text-muted-foreground">Próximamente: análisis personalizado con Gemma 4 (feature/ai-feedback — Oscar).</p>
        </div>

        <div className="flex gap-2 justify-center">
          <Link href={`/quiz/${quiz.id}/play`}><Button variant="outline"><Repeat className="h-4 w-4 mr-2"/>Reintentar</Button></Link>
          <Link href="/dashboard"><Button>Volver al dashboard</Button></Link>
        </div>
      </main>
    </div>
  )
}
