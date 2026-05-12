"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Sparkles, Plus, Trash2, Wand2, PencilLine, Shuffle, Save } from "lucide-react"
import { toast } from "sonner"
import type { QuestionDraft, CreationMode } from "@/lib/types"

function emptyQ(type: "single" | "multiple" | "truefalse" = "single"): QuestionDraft {
  if (type === "truefalse") return { type, text: "", options: ["Verdadero", "Falso"], correctAnswers: [0] }
  return { type, text: "", options: ["", "", "", ""], correctAnswers: [] }
}

export function QuizBuilder({ initial, quizId }: { initial?: any; quizId?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<CreationMode>(initial?.creationMode ?? "manual")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [category, setCategory] = useState(initial?.category ?? "General")
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "medium")
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true)
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial?.questions ?? [emptyQ()])
  const [aiTopic, setAiTopic] = useState("")
  const [aiCount, setAiCount] = useState(5)
  const [aiUseRag, setAiUseRag] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  function updateQ(i: number, patch: Partial<QuestionDraft>) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  }
  function changeType(i: number, type: any) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? emptyQ(type) : q))
  }
  function setOption(i: number, j: number, v: string) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, options: q.options.map((o, k) => k === j ? v : o) } : q))
  }
  function toggleCorrect(i: number, j: number) {
    setQuestions(qs => qs.map((q, idx) => {
      if (idx !== i) return q
      if (q.type === "single" || q.type === "truefalse") return { ...q, correctAnswers: [j] }
      const has = q.correctAnswers.includes(j)
      return { ...q, correctAnswers: has ? q.correctAnswers.filter(x => x !== j) : [...q.correctAnswers, j].sort() }
    }))
  }

  async function generateWithAI() {
    if (!aiTopic) { toast.error("Indica el tema"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/quizzes/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic, count: aiCount, difficulty, useRag: aiUseRag }),
      })
      const text = await res.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = {}
      }
      if (!res.ok) throw new Error(data?.error ?? "Error generando")
      const newQs = (data.questions ?? []) as QuestionDraft[]
      if (mode === "ai") setQuestions(newQs.length ? newQs : [emptyQ()])
      else setQuestions(qs => [...qs.filter(q => q.text), ...newQs])
      const ragText = data?.rag?.used ? ` con ${data.rag.chunks} fragmentos RAG` : ""
      toast.success(`${newQs.length} preguntas generadas${ragText}`)
    } catch (e: any) { toast.error(e.message ?? "Error generando") }
    finally { setBusy(false) }
  }

  async function save() {
    if (!name || questions.length === 0) { toast.error("Completa nombre y al menos una pregunta"); return }
    for (const q of questions) {
      if (!q.text || q.options.some(o => !o) || q.correctAnswers.length === 0) {
        toast.error("Hay preguntas incompletas"); return
      }
    }
    setSaving(true)
    try {
      const payload = { name, description, category, difficulty, isPublic, creationMode: mode, questions }
      const res = await fetch(quizId ? `/api/quizzes/${quizId}` : "/api/quizzes", {
        method: quizId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        let d: any = {}
        try {
          d = text ? JSON.parse(text) : {}
        } catch {
          d = {}
        }
        toast.error(d?.error ? `${d.error}: ${text}` : text || "Error guardando")
        return
      }
      toast.success("Quiz guardado")
      router.replace("/dashboard")
    } catch {
      toast.error("Error de conexión al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-lg shadow-sm">
        <Label className="mb-3 block">Modo de creación</Label>
        <div className="grid md:grid-cols-3 gap-3">
          {([
            { id: "manual", icon: PencilLine, title: "Manual", desc: "Escribe tú las preguntas" },
            { id: "ai", icon: Wand2, title: "Generar con IA", desc: "Gemma 4 las crea por ti" },
            { id: "mixed", icon: Shuffle, title: "Mixto", desc: "Combina IA y manual" },
          ] as const).map(opt => (
            <button key={opt.id} type="button" onClick={() => setMode(opt.id)}
              className={`p-4 rounded-lg text-left transition-all ${mode===opt.id?"bg-primary text-primary-foreground shadow-md":"bg-muted hover:bg-muted/70"}`}>
              <opt.icon className="h-5 w-5 mb-2"/>
              <div className="font-semibold">{opt.title}</div>
              <div className="text-xs opacity-80">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Nombre</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div>
          <div className="space-y-2"><Label>Categoría</Label><Input value={category} onChange={e=>setCategory(e.target.value)}/></div>
        </div>
        <div className="space-y-2"><Label>Descripción</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)}/></div>
        <div className="grid md:grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label>Dificultad</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Fácil</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="hard">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pb-2">
            <Switch checked={isPublic} onCheckedChange={setIsPublic}/>
            <Label className="!mb-0">{isPublic ? "Público" : "Privado"}</Label>
          </div>
        </div>
      </div>

      {(mode === "ai" || mode === "mixed") && (
        <div className="bg-primary/5 p-6 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 mb-3"><Sparkles className="h-5 w-5 text-primary"/><h3 className="font-display font-semibold">Generar con IA (Gemma 4)</h3></div>
          <div className="grid md:grid-cols-[1fr,120px,auto] gap-3 items-end">
            <div className="space-y-2"><Label>Tema o contenido</Label><Input value={aiTopic} onChange={e=>setAiTopic(e.target.value)} placeholder="Ej: ciclo de vida del agua"/></div>
            <div className="space-y-2"><Label>Cantidad</Label><Input type="number" min={1} max={15} value={aiCount} onChange={e=>setAiCount(Number(e.target.value))}/></div>
            <Button onClick={generateWithAI} disabled={busy}><Wand2 className="h-4 w-4 mr-2"/>{busy?"Generando...":"Generar"}</Button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Switch checked={aiUseRag} onCheckedChange={setAiUseRag}/>
            <Label className="!mb-0 text-sm">Usar documentos RAG</Label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Si Gemma local no está disponible, se usa el modelo cloud como respaldo.</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Preguntas ({questions.length})</h3>
          <Button variant="outline" size="sm" onClick={()=>setQuestions(qs=>[...qs, emptyQ()])}><Plus className="h-4 w-4 mr-1.5"/>Agregar</Button>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="bg-card p-5 rounded-lg shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-mono text-muted-foreground">#{i+1}</span>
              <Select value={q.type} onValueChange={(v)=>changeType(i, v)}>
                <SelectTrigger className="w-[200px]"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Selección múltiple</SelectItem>
                  <SelectItem value="multiple">Multi-respuesta</SelectItem>
                  <SelectItem value="truefalse">Verdadero / Falso</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={()=>setQuestions(qs=>qs.filter((_,k)=>k!==i))}><Trash2 className="h-4 w-4"/></Button>
            </div>
            <Textarea value={q.text} onChange={e=>updateQ(i,{text:e.target.value})} placeholder="Pregunta..."/>
            <div className="space-y-2">
              {q.options.map((opt, j) => (
                <div key={j} className="flex items-center gap-2">
                  <button type="button" onClick={()=>toggleCorrect(i,j)}
                    className={`h-6 w-6 rounded-full border-2 shrink-0 transition-colors ${q.correctAnswers.includes(j)?"bg-primary border-primary":"border-border"}`}/>
                  <Input value={opt} onChange={e=>setOption(i,j,e.target.value)} placeholder={`Opción ${j+1}`} disabled={q.type==="truefalse"}/>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Marca el círculo de las respuestas correctas. {q.type==="multiple"?"Puedes marcar varias.":"Una sola."}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={()=>router.back()}>Cancelar</Button>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2"/>{saving?"Guardando...":"Guardar quiz"}</Button>
      </div>
    </div>
  )
}
