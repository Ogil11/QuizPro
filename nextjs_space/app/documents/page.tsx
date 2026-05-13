"use client"

import { DragEvent, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  FileUp,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { Navbar } from "@/src/shared/navbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type DocumentRow = {
  _id?: string
  id?: string
  name?: string
  type?: string
  status?: string
  url?: string
  extractedText?: string
  createdAt?: string
  processedAt?: string
}

async function readJsonResponse(res: Response) {
  const text = await res.text()
  const contentType = res.headers.get("content-type") || ""

  if (!text) return {}
  if (contentType.includes("application/json")) return JSON.parse(text)

  const match = text.match(/"message":"([^"]+)"/)
  const message = match?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, "\"")
  throw new Error(message || `Respuesta inesperada del servidor (${res.status})`)
}

function documentId(doc: DocumentRow) {
  return String(doc._id || doc.id || "")
}

function documentStatus(doc: DocumentRow) {
  const status = String(doc.status || "pending")
  if (status === "completed") return { icon: CheckCircle2, label: "Indexado", className: "text-emerald-600" }
  if (status === "failed") return { icon: AlertCircle, label: "Fallido", className: "text-destructive" }
  return { icon: Loader2, label: "Procesando", className: "text-primary" }
}

function textLength(doc: DocumentRow) {
  return typeof doc.extractedText === "string" ? doc.extractedText.length : 0
}

export default function DocumentsPage() {
  const { status } = useSession() || {}
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [url, setUrl] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
  }, [status, router])

  async function loadDocuments() {
    setLoading(true)
    try {
      const res = await fetch("/api/documents")
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data?.error || "No se pudieron cargar los documentos")
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar los documentos")
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated") loadDocuments()
  }, [status])

  async function uploadFile(file: File) {
    const form = new FormData()
    form.append("file", file)

    setUploading(true)
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data?.message || data?.error || "No se pudo procesar el archivo")
      toast.success(`${file.name} indexado`)
      await loadDocuments()
    } catch (error: any) {
      toast.error(error?.message || "No se pudo procesar el archivo")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function uploadUrl() {
    const value = url.trim()
    if (!value) {
      toast.error("Ingresa una URL")
      return
    }

    setUploading(true)
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data?.message || data?.error || "No se pudo procesar la URL")
      toast.success("URL indexada")
      setUrl("")
      await loadDocuments()
    } catch (error: any) {
      toast.error(error?.message || "No se pudo procesar la URL")
    } finally {
      setUploading(false)
    }
  }

  async function deleteDocument(doc: DocumentRow) {
    const id = documentId(doc)
    if (!id) {
      toast.error("No se pudo identificar el documento")
      return
    }

    const confirmed = window.confirm(`Eliminar "${doc.name || "Documento"}"? Esta accion no se puede deshacer.`)
    if (!confirmed) return

    setDeletingId(id)
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data?.message || data?.error || "No se pudo eliminar el documento")

      setDocuments((current) => current.filter((item) => documentId(item) !== id))
      toast.success("Documento eliminado")
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar el documento")
    } finally {
      setDeletingId("")
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const filteredDocuments = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return documents
    return documents.filter((doc) => {
      const haystack = `${doc.name || ""} ${doc.type || ""} ${doc.status || ""}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [documents, query])

  const stats = useMemo(() => {
    const completed = documents.filter((doc) => doc.status === "completed").length
    const tokens = documents.reduce((sum, doc) => sum + Math.ceil(textLength(doc) / 4), 0)
    return { total: documents.length, completed, tokens }
  }, [documents])

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Documentos</h1>
            <p className="text-muted-foreground text-sm">Carga fuentes para generar quizzes con contexto RAG.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:min-w-[360px]">
            <div className="rounded-lg bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-display text-xl font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Indexados</p>
              <p className="font-display text-xl font-semibold">{stats.completed}</p>
            </div>
            <div className="rounded-lg bg-card p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Tokens</p>
              <p className="font-display text-xl font-semibold">{stats.tokens}</p>
            </div>
          </div>
        </div>

        <section className="grid lg:grid-cols-[1.1fr,0.9fr] gap-4">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`min-h-[220px] rounded-lg border border-dashed bg-card p-6 shadow-sm transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"
              }`}
          >
            <div className="flex h-full flex-col items-center justify-center text-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Subir archivo</h2>
                <p className="text-sm text-muted-foreground">PDF, TXT, Markdown, CSV, JSON, HTML o Imágenes</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.jpg,.jpeg,.png,.gif,.webp,text/plain,text/markdown,text/csv,application/json,text/html,application/pdf,image/jpeg,image/png,image/gif,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) uploadFile(file)
                }}
              />
              <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
                <FileUp className="h-4 w-4 mr-2" />
                Seleccionar archivo
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Agregar URL</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-url">URL</Label>
              <Input
                id="document-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") uploadUrl()
                }}
                placeholder="https://..."
              />
            </div>
            <Button disabled={uploading} onClick={uploadUrl} className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Indexar URL
            </Button>
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <Database className="h-4 w-4 inline mr-1.5" />
              Los documentos indexados alimentan el switch RAG al generar quizzes.
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="font-display text-xl font-semibold">Biblioteca</h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar..." className="pl-10 w-full md:w-64" />
              </div>
              <Button variant="outline" size="icon" onClick={loadDocuments} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="rounded-lg bg-muted/30 py-16 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">No hay documentos indexados.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => {
                const statusInfo = documentStatus(doc)
                const StatusIcon = statusInfo.icon
                return (
                  <article key={documentId(doc)} className="rounded-lg bg-card p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display font-semibold leading-tight truncate">{doc.name || "Documento"}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{doc.type || "archivo"} · {textLength(doc)} caracteres</p>
                      </div>
                      <StatusIcon className={`h-5 w-5 shrink-0 ${statusInfo.className} ${doc.status === "processing" ? "animate-spin" : ""}`} />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{statusInfo.label}</span>
                      {doc.createdAt ? <span>{new Date(doc.createdAt).toLocaleDateString()}</span> : null}
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Link href={`/api/rag/query?q=${encodeURIComponent(doc.name || "")}&limit=3`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">
                          <Search className="h-3.5 w-3.5 mr-1.5" />
                          Buscar
                        </Button>
                      </Link>
                      {doc.url ? (
                        <Link href={doc.url} target="_blank">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteDocument(doc)}
                        disabled={deletingId === documentId(doc)}
                        aria-label={`Eliminar ${doc.name || "documento"}`}
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingId === documentId(doc) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
