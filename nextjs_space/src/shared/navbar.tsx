"use client"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Brain, Database, LogOut, User as UserIcon, BookOpen, Plus } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export function Navbar() {
  const { data: session, status } = useSession() || {}
  const user = session?.user as any

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur bg-background/80 border-b border-border">
      <div className="max-w-[1200px] mx-auto px-5 h-24 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-display font-bold text-2xl">
          <Brain className="h-8 w-8 text-primary" />
          <span>QuizPro<span className="text-primary">.</span></span>
        </Link>
        <nav className="flex items-center gap-2.5">
          <ThemeToggle />
          {status === "authenticated" ? (
            <>
              <Link href="/dashboard"><Button variant="ghost"><BookOpen className="h-5 w-5 mr-1.5"/>Quizzes</Button></Link>
              <Link href="/documents"><Button variant="ghost"><Database className="h-5 w-5 mr-1.5"/>Docs</Button></Link>
              <Link href="/quiz/new"><Button variant="ghost"><Plus className="h-5 w-5 mr-1.5"/>Crear</Button></Link>
              <Link href="/profile"><Button variant="ghost"><UserIcon className="h-5 w-5 mr-1.5"/>{user?.name?.split(" ")[0] ?? "Perfil"}</Button></Link>
              <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}><LogOut className="h-5 w-5"/></Button>
            </>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost">Ingresar</Button></Link>
              <Link href="/signup"><Button>Crear cuenta</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
