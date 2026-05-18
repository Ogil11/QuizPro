"use client"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/src/shared/navbar"
import { Button } from "@/components/ui/button"
import { Trophy, Repeat, BarChart3, Sparkles, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"

function listItems(value: any): any[] {
  return Array.isArray(value) ? value : []
}

export default function ResultPage() {
  const search = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCelebration, setShowCelebration] = useState(false)
  const [feedback, setFeedback] = useState<any>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState("")

  const attemptId = search.get("attempt")

  useEffect(() => {
    let cancelled = false

    async function loadAttempt() {
      if (!attemptId) {
        router.replace("/dashboard")
        return
      }

      const raw = sessionStorage.getItem(`attempt-${attemptId}`)
      if (raw && !cancelled) {
        try {
          setData(JSON.parse(raw))
        } catch {
          sessionStorage.removeItem(`attempt-${attemptId}`)
        }
      }

      try {
        const res = await fetch(`/api/attempts/${attemptId}`)
        const fresh = await res.json()
        if (!res.ok) throw new Error(fresh?.error || "Error cargando intento")
        if (!cancelled) setData(fresh)
      } catch {
        if (!raw && !cancelled) router.replace("/dashboard")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAttempt()
    return () => {
      cancelled = true
    }
  }, [attemptId, router])

  useEffect(() => {
    let cancelled = false

    async function generateFeedback() {
      if (!attemptId || !data?.attempt?.id) return
      setFeedbackLoading(true)
      setFeedbackError("")

      try {
        const res = await fetch("/api/feedback/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error || "No se pudo generar feedback")
        if (!cancelled) setFeedback(body.feedback)
      } catch (error: any) {
        if (!cancelled) setFeedbackError(error?.message || "No se pudo generar feedback")
      } finally {
        if (!cancelled) setFeedbackLoading(false)
      }
    }

    generateFeedback()
    return () => {
      cancelled = true
    }
  }, [attemptId, data?.attempt?.id])

  useEffect(() => {
    if (loading || !data?.attempt?.id) return

    setShowCelebration(true)
    const timer = setTimeout(() => setShowCelebration(false), 2600)
    return () => clearTimeout(timer)
  }, [loading, data?.attempt?.id])

  if (loading && !data) return <div className="min-h-screen"><Navbar/><div className="p-8">Cargando...</div></div>
  if (!data) return <div className="min-h-screen"><Navbar/><div className="p-8">Cargando...</div></div>

  const { attempt, detailed, quiz } = data
  const correct = attempt.correct ?? 0
  const incorrect = (attempt.total ?? 0) - correct
  const pieData = [{ name: "Correctas", value: correct }, { name: "Incorrectas", value: incorrect }]
  const COLORS = ["#80D8C3", "#FF9898"]
  const timeData = (detailed ?? []).map((d: any, i: number) => ({
    name: `P${i + 1}`,
    segundos: Math.round((d.timeMs ?? 0) / 100) / 10,
    correcta: d.correct ? 1 : 0,
  }))

  return (
    <div className="min-h-screen">
      <Navbar/>
      <main className="max-w-[1000px] mx-auto px-4 py-8 space-y-6">
        <div className="relative bg-card p-8 rounded-lg shadow-sm text-center overflow-hidden reveal-up">
          {showCelebration && (
            <div className="celebration-layer" aria-hidden>
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className={`confetti-piece confetti-tone-${i % 4}`}
                  style={{
                    left: `${(i / 24) * 100}%`,
                    animationDelay: `${(i % 6) * 110}ms`,
                    transform: `rotate(${(i % 2 === 0 ? 18 : -18) + i}deg)`,
                  }}
                />
              ))}
            </div>
          )}
          <Trophy className="h-12 w-12 text-primary mx-auto mb-3"/>
          <h1 className={`font-display text-3xl font-bold tracking-tight mb-1 ${showCelebration ? "score-pop" : ""}`}>{Math.round(attempt.score)} pts</h1>
          <p className="text-muted-foreground">{correct} de {attempt.total} correctas · {attempt.durationSec}s</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card p-6 rounded-lg shadow-sm">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary"/>Distribucion</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]}/>)}
                  </Pie>
                  <Legend verticalAlign="top" wrapperStyle={{fontSize: 11}}/>
                  <Tooltip/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-card p-6 rounded-lg shadow-sm">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary"/>Tiempo por pregunta (s)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData} margin={{top: 10, right: 10, bottom: 20, left: 0}}>
                  <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false}/>
                  <YAxis tick={{fontSize: 10}} tickLine={false}/>
                  <Tooltip/>
                  <Bar dataKey="segundos" fill="#60B5FF" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm">
          <h3 className="font-display font-semibold mb-3">Revision</h3>
          <div className="space-y-2">
            {(detailed ?? []).map((d: any, i: number) => {
              const q = quiz.questions[i]
              return (
                <div key={i} className={`p-3 rounded-md ${d.correct ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-rose-50 dark:bg-rose-950/20"}`}>
                  <div className="flex items-start gap-2">
                    {d.correct ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5"/> : <XCircle className="h-4 w-4 text-rose-600 mt-0.5"/>}
                    <div className="text-sm">
                      <div className="font-medium">{i + 1}. {q.text}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Tu respuesta: {d.selected.map((x: number) => q.options[x]).join(", ") || "(vacia)"}
                      </div>
                      {!d.correct && <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Correcta: {q.correctAnswers.map((x: number) => q.options[x]).join(", ")}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-primary/5 p-6 rounded-lg shadow-sm border border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary"/>
            <h3 className="font-display font-semibold">Retroalimentacion IA</h3>
          </div>

          {feedbackLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin"/>
              Generando feedback inteligente...
            </div>
          ) : feedbackError ? (
            <p className="text-sm text-destructive">{feedbackError}</p>
          ) : feedback ? (
            <div className="space-y-5 text-sm">
              <div>
                <h4 className="font-semibold mb-1">Resumen general</h4>
                <p className="text-muted-foreground">{feedback.summary}</p>
              </div>

              <FeedbackList title="Fortalezas" items={listItems(feedback.strengths)} />

              <div>
                <h4 className="font-semibold mb-2">Debilidades</h4>
                <div className="space-y-2">
                  {listItems(feedback.weaknesses).length === 0 ? (
                    <p className="text-muted-foreground">No se detectaron debilidades claras en este intento.</p>
                  ) : listItems(feedback.weaknesses).map((item: any, index: number) => (
                    <div key={index} className="rounded-md bg-background/60 p-3">
                      <div className="font-medium">{item.topic}</div>
                      <div className="text-muted-foreground">{item.evidence}</div>
                      <div className="mt-1">{item.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Explicacion de errores</h4>
                <div className="space-y-2">
                  {listItems(feedback.questionFeedback).map((item: any, index: number) => (
                    <div key={item.questionId || index} className="rounded-md bg-background/60 p-3">
                      <div className="font-medium">{item.wasCorrect ? "Respuesta correcta" : "Pregunta a reforzar"}</div>
                      <p className="text-muted-foreground">{item.errorExplanation}</p>
                      <p className="mt-1">{item.correctConcept}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.practiceTip}</p>
                    </div>
                  ))}
                </div>
              </div>

              <FeedbackList title="Recomendaciones" items={listItems(feedback.recommendedPractice)} />

              <div>
                <h4 className="font-semibold mb-2">Quizzes sugeridos</h4>
                <div className="grid md:grid-cols-2 gap-2">
                  {listItems(feedback.nextQuizSuggestions).map((item: any, index: number) => (
                    <div key={index} className="rounded-md bg-background/60 p-3">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.topic} · {item.difficulty}</div>
                      <p className="mt-1 text-muted-foreground">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">El feedback aparecera aqui al terminar el analisis.</p>
          )}
        </div>

        <div className="flex gap-2 justify-center">
          <Link href={`/quiz/${quiz.id}/play`}><Button variant="outline"><Repeat className="h-4 w-4 mr-2"/>Reintentar</Button></Link>
          <Link href="/dashboard"><Button>Volver al dashboard</Button></Link>
        </div>
      </main>

      <style jsx>{`
        .celebration-layer {
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 0;
        }

        .confetti-piece {
          position: absolute;
          top: -12%;
          width: 8px;
          height: 14px;
          border-radius: 3px;
          opacity: 0;
          animation: confetti-fall 1.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        .confetti-tone-0 {
          background: hsl(272 82% 64% / 0.9);
        }

        .confetti-tone-1 {
          background: hsl(250 85% 64% / 0.9);
        }

        .confetti-tone-2 {
          background: hsl(190 88% 62% / 0.88);
        }

        .confetti-tone-3 {
          background: hsl(325 86% 68% / 0.88);
        }

        .score-pop {
          animation: score-pop 650ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes confetti-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(0.9);
          }
          15% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(-4px, 250px, 0) rotate(220deg) scale(1);
          }
        }

        @keyframes score-pop {
          0% {
            transform: scale(0.78);
            opacity: 0;
          }
          60% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-semibold mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Sin elementos para mostrar.</p>
      ) : (
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          {items.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      )}
    </div>
  )
}
