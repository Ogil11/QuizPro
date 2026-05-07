"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/src/shared/navbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Lock, Globe, Trash2, Pencil, Play } from "lucide-react"
import { toast } from "sonner"

export default function Dashboard() {
  const { status } = useSession() || {}
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [scope, setScope] = useState<"all"|"mine"|"public">("all")
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (status === "unauthenticated") router.replace("/login") }, [status, router])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/quizzes?scope=${scope}`)
    const data = await res.json()
    setQuizzes(data.quizzes ?? [])
    setLoading(false)
  }
  useEffect(() => { if (status === "authenticated") load() }, [scope, status])

  async function del(id: string) {
    if (!confirm("¿Eliminar este quiz?")) return
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Quiz eliminado"); load() } else toast.error("Error al eliminar")
  }

  const filtered = quizzes.filter((qq: any) =>
    !q || qq.name.toLowerCase().includes(q.toLowerCase()) || qq.category.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Quizzes</h1>
            <p className="text-muted-foreground text-sm">Explora, resuelve o crea quizzes adaptativos.</p>
          </div>
          <Link href="/quiz/new"><Button><Plus className="h-4 w-4 mr-2"/>Nuevo quiz</Button></Link>
        </div>
        <div className="flex flex-wrap gap-2 mt-6 mb-4">
          {(["all","public","mine"] as const).map(s => (
            <Button key={s} size="sm" variant={scope===s?"default":"outline"} onClick={()=>setScope(s)}>
              {s==="all"?"Todos":s==="public"?"Públicos":"Míos"}
            </Button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar..." className="pl-10 w-64"/>
          </div>
        </div>

        {loading ? <p className="text-muted-foreground">Cargando...</p> :
         filtered.length === 0 ? (
           <div className="py-16 text-center bg-muted/30 rounded-lg">
             <p className="text-muted-foreground mb-4">No hay quizzes aún.</p>
             <Link href="/quiz/new"><Button><Plus className="h-4 w-4 mr-2"/>Crear el primero</Button></Link>
           </div>
         ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((quiz: any) => (
              <div key={quiz.id} className="p-5 rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-display font-semibold text-lg leading-tight">{quiz.name}</h3>
                  {quiz.isPublic ? <Globe className="h-4 w-4 text-primary shrink-0"/> : <Lock className="h-4 w-4 text-muted-foreground shrink-0"/>}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{quiz.category} · {quiz.difficulty}</p>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{quiz.description ?? "Sin descripci\u00f3n"}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span>{quiz._count?.questions ?? 0} preguntas</span>·
                  <span>{quiz._count?.attempts ?? 0} intentos</span>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Link href={`/quiz/${quiz.id}/play`} className="flex-1"><Button size="sm" className="w-full"><Play className="h-3.5 w-3.5 mr-1.5"/>Resolver</Button></Link>
                  <Link href={`/quiz/${quiz.id}/edit`}><Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5"/></Button></Link>
                  <Button size="sm" variant="outline" onClick={()=>del(quiz.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                </div>
              </div>
            ))}
          </div>
         )}
      </main>
    </div>
  )
}
