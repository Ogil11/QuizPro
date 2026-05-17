"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  Sparkles,
  Plus,
  Trash2,
  Wand2,
  PencilLine,
  Shuffle,
  Save,
} from "lucide-react"

import { toast } from "sonner"

import type {
  QuestionDraft,
  CreationMode,
} from "@/lib/types"

type QuestionType =
  | "single"
  | "multiple"
  | "truefalse"

function emptyQ(
  type: QuestionType = "single"
): QuestionDraft {

  if (type === "truefalse") {
    return {
      type,
      text: "",
      options: ["Verdadero", "Falso"],
      correctAnswers: [0],
    }
  }

  return {
    type,
    text: "",
    options: ["", "", "", ""],
    correctAnswers: [],
  }
}

function normalizeQuestion(
  q: QuestionDraft
): QuestionDraft {

  const type: QuestionType =
    q.type === "multiple" ||
    q.type === "truefalse"
      ? q.type
      : "single"

  let options = Array.isArray(q.options)
    ? q.options.map(o =>
        String(o ?? "").trim()
      )
    : []

  let correctAnswers = Array.isArray(
    q.correctAnswers
  )
    ? q.correctAnswers
        .map(n => Number(n))
        .filter(n =>
          !Number.isNaN(n)
        )
    : []

  if (type === "truefalse") {

    options = [
      "Verdadero",
      "Falso",
    ]

    correctAnswers =
      correctAnswers.length > 0 &&
      correctAnswers[0] <= 1
        ? [correctAnswers[0]]
        : [0]
  }

  if (type === "single") {

    while (options.length < 4) {
      options.push("")
    }

    options = options.slice(0, 4)

    correctAnswers =
      correctAnswers.length > 0
        ? [correctAnswers[0]]
        : []
  }

  if (type === "multiple") {

    while (options.length < 4) {
      options.push("")
    }

    options = options.slice(0, 4)

    correctAnswers = [
      ...new Set(correctAnswers),
    ]
  }

  return {
    ...q,
    type,
    options,
    correctAnswers,
  }
}

export function QuizBuilder({
  initial,
  quizId,
}: {
  initial?: any
  quizId?: string
}) {

  const router = useRouter()

  const [mode, setMode] =
    useState<CreationMode>(
      initial?.creationMode ?? "manual"
    )

  const [name, setName] =
    useState(initial?.name ?? "")

  const [description, setDescription] =
    useState(
      initial?.description ?? ""
    )

  const [category, setCategory] =
    useState(
      initial?.category ?? "General"
    )

  const [difficulty, setDifficulty] =
    useState(
      initial?.difficulty ?? "medium"
    )

  const [isPublic, setIsPublic] =
    useState(
      initial?.isPublic ?? true
    )

  const [questions, setQuestions] =
    useState<QuestionDraft[]>(() => {

      const raw =
        initial?.questions ??
        [emptyQ()]

      return raw.map(
        normalizeQuestion
      )
    })

  const [aiTopic, setAiTopic] =
    useState("")

  const [aiCount, setAiCount] =
    useState(10)

  const [aiUseRag, setAiUseRag] =
    useState(true)

  const [documents, setDocuments] =
    useState<any[]>([])

  const [selectedDocument, setSelectedDocument] =
    useState("")

  const [busy, setBusy] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  useEffect(() => {

    async function loadDocuments() {

      try {

        const res = await fetch(
          "/api/documents"
        )

        if (!res.ok) {
          throw new Error()
        }

        const data =
          await res.json()

        setDocuments(
          data.documents ?? []
        )

      } catch {

        setDocuments([])

        toast.error(
          "No se pudieron cargar los documentos"
        )
      }
    }

    loadDocuments()

  }, [])

  function updateQ(
    i: number,
    patch: Partial<QuestionDraft>
  ) {

    setQuestions(qs =>
      qs.map((q, idx) =>
        idx === i
          ? normalizeQuestion({
              ...q,
              ...patch,
            })
          : q
      )
    )
  }

  function changeType(
    i: number,
    type: QuestionType
  ) {

    setQuestions(qs =>
      qs.map((q, idx) =>
        idx === i
          ? emptyQ(type)
          : q
      )
    )
  }

  function setOption(
    i: number,
    j: number,
    value: string
  ) {

    setQuestions(qs =>
      qs.map((q, idx) => {

        if (idx !== i) {
          return q
        }

        return {
          ...q,
          options: q.options.map(
            (o, k) =>
              k === j
                ? value
                : o
          ),
        }
      })
    )
  }

  function toggleCorrect(
    i: number,
    j: number
  ) {

    setQuestions(qs =>
      qs.map((q, idx) => {

        if (idx !== i) {
          return q
        }

        if (
          q.type === "single" ||
          q.type === "truefalse"
        ) {

          return {
            ...q,
            correctAnswers: [j],
          }
        }

        const has =
          q.correctAnswers.includes(j)

        const updated = has
          ? q.correctAnswers.filter(
              x => x !== j
            )
          : [
              ...q.correctAnswers,
              j,
            ]

        return {
          ...q,
          correctAnswers:
            updated.sort(),
        }
      })
    )
  }

  async function generateWithAI() {

    if (
      !selectedDocument &&
      !aiTopic.trim()
    ) {

      toast.error(
        "Indica un tema o selecciona un documento"
      )

      return
    }

    setBusy(true)

    try {

      const useDocumentFlow =
        aiUseRag &&
        !!selectedDocument

      const endpoint =
        useDocumentFlow
          ? "/api/quizzes/from-document"
          : "/api/quizzes/generate"

      const body =
        useDocumentFlow
          ? {
              documentId:
                selectedDocument,
              count: aiCount,
              difficulty,
            }
          : {
              topic:
                aiTopic.trim(),
              count: aiCount,
              difficulty,
              useRag: aiUseRag,
            }

      const res = await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            body
          ),
        }
      )

      const text =
        await res.text()

      let data: any = {}

      try {

        data = text
          ? JSON.parse(text)
          : {}

      } catch {

        throw new Error(
          "Respuesta inválida del servidor"
        )
      }

      if (!res.ok) {

        throw new Error(
          data?.error ??
          "Error generando preguntas"
        )
      }

      const rawQuestions =

        Array.isArray(
          data?.questions
        )
          ? data.questions

          : Array.isArray(
              data?.preguntas
            )
          ? data.preguntas

          : []

      const newQuestions =
        rawQuestions
          .map(normalizeQuestion)
          .filter((q: QuestionDraft) =>
            q.text.trim().length > 0
          )

      const detectedCategory =

        typeof data?.category ===
          "string" &&
        data.category.trim()
          ? data.category.trim()

          : typeof data?.categoria ===
              "string" &&
            data.categoria.trim()
          ? data.categoria.trim()

          : null

      if (detectedCategory) {
        setCategory(
          detectedCategory
        )
      }

      if (
        newQuestions.length === 0
      ) {

        toast.error(
          "Gemma no devolvió preguntas válidas"
        )

        return
      }

      if (mode === "ai") {

        setQuestions(
          newQuestions
        )

      } else {

        setQuestions(qs => [

          ...qs.filter(q =>
            q.text.trim()
          ),

          ...newQuestions,
        ])
      }

      const ragText =
        data?.rag?.used
          ? ` usando ${data.rag.chunks} fragmentos RAG`
          : ""

      toast.success(
        `${newQuestions.length} preguntas generadas${ragText}`
      )

    } catch (e: any) {

      toast.error(
        e?.message ??
        "Error generando preguntas"
      )

    } finally {

      setBusy(false)
    }
  }

  async function save() {

    if (!name.trim()) {

      toast.error(
        "Completa el nombre del quiz"
      )

      return
    }

    if (
      questions.length === 0
    ) {

      toast.error(
        "Agrega al menos una pregunta"
      )

      return
    }

    for (const q of questions) {

      if (!q.text.trim()) {

        toast.error(
          "Hay preguntas sin texto"
        )

        return
      }

      if (
        q.options.some(
          o => !o.trim()
        )
      ) {

        toast.error(
          "Hay opciones vacías"
        )

        return
      }

      if (
        q.correctAnswers.length === 0
      ) {

        toast.error(
          "Hay preguntas sin respuesta correcta"
        )

        return
      }

      if (
        q.type === "multiple" &&
        q.correctAnswers.length < 2
      ) {

        toast.error(
          "Las preguntas múltiples deben tener al menos 2 respuestas correctas"
        )

        return
      }
    }

    setSaving(true)

    try {

      const payload = {
        name: name.trim(),
        description:
          description.trim(),
        category:
          category.trim(),
        difficulty,
        isPublic,
        creationMode: mode,
        questions,
      }

      const res = await fetch(

        quizId
          ? `/api/quizzes/${quizId}`
          : "/api/quizzes",

        {
          method:
            quizId
              ? "PATCH"
              : "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            payload
          ),
        }
      )

      const text =
        await res.text()

      let data: any = {}

      try {

        data = text
          ? JSON.parse(text)
          : {}

      } catch {

        data = {}
      }

      if (!res.ok) {

        toast.error(
          data?.error ??
          text ??
          "Error guardando"
        )

        return
      }

      toast.success(
        "Quiz guardado"
      )

      router.replace(
        "/dashboard"
      )

    } catch {

      toast.error(
        "Error de conexión"
      )

    } finally {

      setSaving(false)
    }
  }

  return (

    <div className="space-y-6">

      <div className="bg-card p-6 rounded-lg shadow-sm">

        <Label className="mb-3 block">
          Modo de creación
        </Label>

        <div className="grid md:grid-cols-3 gap-3">

          {([
            {
              id: "manual",
              icon: PencilLine,
              title: "Manual",
              desc:
                "Escribe tú las preguntas",
            },

            {
              id: "ai",
              icon: Wand2,
              title:
                "Generar con IA",
              desc:
                "Gemma local crea las preguntas",
            },

            {
              id: "mixed",
              icon: Shuffle,
              title: "Mixto",
              desc:
                "Combina IA y edición manual",
            },

          ] as const).map(
            opt => (

              <button
                key={opt.id}
                type="button"

                onClick={() =>
                  setMode(opt.id)
                }

                className={`
                  p-4 rounded-lg text-left transition-all

                  ${
                    mode === opt.id
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted hover:bg-muted/70"
                  }
                `}
              >

                <opt.icon className="h-5 w-5 mb-2" />

                <div className="font-semibold">
                  {opt.title}
                </div>

                <div className="text-xs opacity-80">
                  {opt.desc}
                </div>

              </button>
            )
          )}

        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow-sm space-y-4">

        <div className="grid md:grid-cols-2 gap-4">

          <div className="space-y-2">

            <Label>
              Nombre
            </Label>

            <Input
              value={name}
              onChange={e =>
                setName(
                  e.target.value
                )
              }
            />

          </div>

          <div className="space-y-2">

            <Label>
              Categoría
            </Label>

            <Input
              value={category}
              onChange={e =>
                setCategory(
                  e.target.value
                )
              }
            />

          </div>

        </div>

        <div className="space-y-2">

          <Label>
            Descripción
          </Label>

          <Textarea
            value={description}
            onChange={e =>
              setDescription(
                e.target.value
              )
            }
          />

        </div>

        <div className="grid md:grid-cols-2 gap-4 items-end">

          <div className="space-y-2">

            <Label>
              Dificultad
            </Label>

            <Select
              value={difficulty}
              onValueChange={
                setDifficulty
              }
            >

              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>

                <SelectItem value="easy">
                  Fácil
                </SelectItem>

                <SelectItem value="medium">
                  Medio
                </SelectItem>

                <SelectItem value="hard">
                  Difícil
                </SelectItem>

              </SelectContent>

            </Select>

          </div>

          <div className="flex items-center gap-3 pb-2">

            <Switch
              checked={isPublic}
              onCheckedChange={
                setIsPublic
              }
            />

            <Label className="!mb-0">
              {isPublic
                ? "Público"
                : "Privado"}
            </Label>

          </div>

        </div>

      </div>

      {(mode === "ai" ||
        mode === "mixed") && (

        <div className="bg-primary/5 p-6 rounded-lg shadow-sm">

          <div className="flex items-center gap-2 mb-3">

            <Sparkles className="h-5 w-5 text-primary" />

            <h3 className="font-display font-semibold">
              Generar con IA
              (Gemma local + RAG)
            </h3>

          </div>

          <div className="grid md:grid-cols-[1fr,120px,auto] gap-3 items-end">

            <div className="space-y-2">

              <Label>
                Tema o contenido
              </Label>

              <Input
                value={aiTopic}
                onChange={e =>
                  setAiTopic(
                    e.target.value
                  )
                }
                placeholder="Ej: ciclo del agua"
              />

            </div>

            <div className="space-y-2">

              <Label>
                Cantidad
              </Label>

              <Input
                type="number"
                min={1}
                max={50}
                value={aiCount}
                onChange={e =>
                  setAiCount(
                    Number(
                      e.target.value
                    ) || 1
                  )
                }
              />

            </div>

            <Button
              onClick={
                generateWithAI
              }
              disabled={busy}
            >

              <Wand2 className="h-4 w-4 mr-2" />

              {busy
                ? "Generando..."
                : "Generar"}

            </Button>

          </div>

          <div className="flex items-center gap-3 mt-4">

            <Switch
              checked={aiUseRag}
              onCheckedChange={
                setAiUseRag
              }
            />

            <Label className="!mb-0 text-sm">
              Usar documentos
              RAG
            </Label>

          </div>

          {aiUseRag && (

            <div className="space-y-2 mt-4">

              <Label>
                Documento fuente
              </Label>

              <Select
                value={
                  selectedDocument
                }

                onValueChange={(
                  docId
                ) => {

                  setSelectedDocument(
                    docId
                  )

                  const selectedDoc =
                    documents.find(
                      d =>
                        (
                          d._id ||
                          d.id
                        ) === docId
                    )

                  if (
                    selectedDoc?.name
                  ) {
                    setAiTopic(
                      selectedDoc.name
                    )
                  }
                }}
              >

                <SelectTrigger>

                  <SelectValue placeholder="Selecciona un documento" />

                </SelectTrigger>

                <SelectContent>

                  {documents.map(
                    doc => (

                      <SelectItem
                        key={
                          doc._id ||
                          doc.id
                        }

                        value={
                          doc._id ||
                          doc.id
                        }
                      >
                        {doc.name}
                      </SelectItem>
                    )
                  )}

                </SelectContent>

              </Select>

            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">

            Gemma local puede tardar varios segundos dependiendo de la RAM disponible.

          </p>

        </div>
      )}

      <div className="space-y-6">

        {questions.map(
          (q, i) => (

            <div
              key={i}
              className="bg-card p-6 rounded-lg shadow-sm space-y-4"
            >

              <div className="flex items-center justify-between">

                <div className="font-semibold">
                  #{i + 1}
                </div>

                <div className="flex items-center gap-2">

                  <Select
                    value={q.type}

                    onValueChange={(
                      v:
                        | "single"
                        | "multiple"
                        | "truefalse"
                    ) =>
                      changeType(
                        i,
                        v
                      )
                    }
                  >

                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="single">
                        Selección única
                      </SelectItem>

                      <SelectItem value="multiple">
                        Selección múltiple
                      </SelectItem>

                      <SelectItem value="truefalse">
                        Verdadero/Falso
                      </SelectItem>

                    </SelectContent>

                  </Select>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"

                    onClick={() =>
                      setQuestions(
                        qs =>
                          qs.filter(
                            (
                              _,
                              idx
                            ) =>
                              idx !== i
                          )
                      )
                    }
                  >

                    <Trash2 className="h-4 w-4" />

                  </Button>

                </div>
              </div>

              <Textarea
                value={q.text}
                onChange={e =>
                  updateQ(i, {
                    text:
                      e.target.value,
                  })
                }
                placeholder="Escribe la pregunta"
              />

              <div className="space-y-3">

                {q.options.map(
                  (
                    opt,
                    j
                  ) => (

                    <div
                      key={j}
                      className="flex items-center gap-3"
                    >

                      <button
                        type="button"

                        onClick={() =>
                          toggleCorrect(
                            i,
                            j
                          )
                        }

                        className={`
                          h-6 w-6 rounded-full border-2 transition-all

                          ${
                            q.correctAnswers.includes(
                              j
                            )
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
                          }
                        `}
                      />

                      <Input
                        value={opt}

                        onChange={e =>
                          setOption(
                            i,
                            j,
                            e.target
                              .value
                          )
                        }

                        disabled={
                          q.type ===
                          "truefalse"
                        }
                      />

                    </div>
                  )
                )}

              </div>

              <p className="text-xs text-muted-foreground">

                {q.type ===
                "multiple"

                  ? "Marca las respuestas correctas. Puedes seleccionar varias."

                  : "Marca la respuesta correcta. Solo una respuesta."}

              </p>

            </div>
          )
        )}

        <Button
          type="button"
          variant="outline"

          onClick={() =>
            setQuestions(qs => [
              ...qs,
              emptyQ(),
            ])
          }
        >

          <Plus className="h-4 w-4 mr-2" />

          Agregar pregunta

        </Button>

        <div className="flex justify-end">

          <Button
            onClick={save}
            disabled={saving}
          >

            <Save className="h-4 w-4 mr-2" />

            {saving
              ? "Guardando..."
              : "Guardar Quiz"}

          </Button>

        </div>

      </div>

    </div>
  )
}