import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Brain, Sparkles, BarChart3, Users, BookOpen, Wand2 } from "lucide-react"
import { Navbar } from "@/src/shared/navbar"

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4">
        <section className="py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> Aprendizaje adaptativo con IA
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-4">
            Aprende con quizzes <span className="text-primary">inteligentes</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Crea, comparte y resuelve quizzes generados por IA. QuizPro adapta el contenido a tu nivel y te ayuda a mejorar.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/signup"><Button size="lg">Comenzar gratis</Button></Link>
            <Link href="/dashboard"><Button size="lg" variant="outline"><BookOpen className="h-4 w-4 mr-2"/>Explorar quizzes</Button></Link>
          </div>
        </section>

        <section className="py-12 grid md:grid-cols-3 gap-6">
          {[
            { icon: Wand2, title: "Generaci\u00f3n con IA", desc: "Gemma 4 crea preguntas a partir de un tema o contenido." },
            { icon: BarChart3, title: "Resultados visuales", desc: "Estad\u00edsticas y gr\u00e1ficos detallados al finalizar cada quiz." },
            { icon: Users, title: "Comparte con tu equipo", desc: "Quizzes p\u00fablicos o privados, t\u00fa decides." },
          ].map((f, i) => (
            <div key={i} className="p-6 rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
              <f.icon className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-display font-semibold text-lg mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="py-12 text-center text-sm text-muted-foreground">
          <Brain className="h-5 w-5 inline mr-1.5 text-primary" />
          Construido por el equipo: Alberto · Alejandro · Sebastián · Emanuel · Santiago · Oscar
        </section>
      </main>
    </div>
  )
}
