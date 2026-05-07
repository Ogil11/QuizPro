"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "@/src/shared/navbar"
import { Button } from "@/components/ui/button"
import { ArrowRight, Send } from "lucide-react"
import { toast } from "sonner"

export default function PlayQuiz() {
  const params = useParams() as { id: string }
  const router = useRouter()
  const [quiz, setQuiz] = useState<any>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<{ selected: number[]; timeMs: number }[]>([])
  const startRef = useRef<number>(Date.now())
  const qStartRef = useRef<number>(Date.now())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/quizzes/${params.id}`).then(r=>r.json()).then(d => {
      if (!d.quiz) { router.replace("/dashboard"); return }
      setQuiz(d.quiz)
      setAnswers(Array(d.quiz.questions.length).fill(null).map(() => ({ selected: [], timeMs: 0 })))
      startRef.current = Date.now()
      qStartRef.current = Date.now()
    })
  }, [params.id, router])

  if (!quiz) return <div className="min-h-screen"><Navbar/><div className="p-8">Cargando...</div></div>
  const q = quiz.questions[idx]
  const cur = answers[idx] ?? { selected: [], timeMs: 0 }

  function toggle(i: number) {
    setAnswers(prev => prev.map((a, k) => {
      if (k !== idx) return a
      if (q.type === "single" || q.type === "truefalse") return { ...a, selected: [i] }
      const has = a.selected.includes(i)
      return { ...a, selected: has ? a.selected.filter(x => x !== i) : [...a.selected, i] }
    }))
  }

  function next() {
    setAnswers(prev => prev.map((a, k) => k === idx ? { ...a, timeMs: Date.now() - qStartRef.current } : a))
    qStartRef.current = Date.now()
    if (idx < quiz.questions.length - 1) setIdx(idx + 1)
  }

  async function submit() {
    setSubmitting(true)
    const finalAnswers = answers.map((a, k) => k === idx ? { ...a, timeMs: Date.now() - qStartRef.current } : a)
    const durationSec = Math.round((Date.now() - startRef.current) / 1000)
    const res = await fetch("/api/attempts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id, answers: finalAnswers, durationSec }),
    })
    setSubmitting(false)
    if (!res.ok) { toast.error("Error enviando"); return }
    const data = await res.json()
    sessionStorage.setItem(`attempt-${data.attempt.id}`, JSON.stringify({ attempt: data.attempt, detailed: data.detailed, quiz }))
    router.replace(`/quiz/${quiz.id}/result?attempt=${data.attempt.id}`)
  }

  const isLast = idx === quiz.questions.length - 1
  const progress = ((idx + 1) / quiz.questions.length) * 100

  return (
    <div className="min-h-screen">
      <Navbar/>
      <main className="max-w-[800px] mx-auto px-4 py-8">
        <div className="mb-2 text-sm text-muted-foreground flex justify-between"><span>{quiz.name}</span><span>{idx+1} / {quiz.questions.length}</span></div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-6"><div className="h-full bg-primary transition-all" style={{width:`${progress}%`}}/></div>
        <div className="bg-card p-8 rounded-lg shadow-sm">
          <h2 className="font-display text-xl font-semibold mb-6">{q.text}</h2>
          <div className="space-y-2">
            {q.options.map((opt: string, i: number) => (
              <button key={i} onClick={()=>toggle(i)}
                className={`w-full p-4 rounded-lg text-left transition-all flex items-center gap-3 ${cur.selected.includes(i)?"bg-primary text-primary-foreground shadow-md":"bg-muted hover:bg-muted/70"}`}>
                <span className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs font-mono ${cur.selected.includes(i)?"bg-background text-primary border-background":"border-current"}`}>
                  {String.fromCharCode(65+i)}
                </span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            {isLast ? (
              <Button onClick={submit} disabled={submitting || cur.selected.length===0}><Send className="h-4 w-4 mr-2"/>{submitting?"Enviando...":"Finalizar"}</Button>
            ) : (
              <Button onClick={next} disabled={cur.selected.length===0}>Siguiente<ArrowRight className="h-4 w-4 ml-2"/></Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
