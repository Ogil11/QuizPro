"use client"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Brain, LogOut, User as UserIcon, BookOpen, Plus } from "lucide-react"

export function Navbar() {
  const { data: session, status } = useSession() || {}
  const user = session?.user as any

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur bg-background/80 border-b border-border">
      <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg">
          <Brain className="h-6 w-6 text-primary" />
          <span>QuizPro<span className="text-primary">.</span></span>
        </Link>
        <nav className="flex items-center gap-2">
          {status === "authenticated" ? (
            <>
              <Link href="/dashboard"><Button variant="ghost" size="sm"><BookOpen className="h-4 w-4 mr-1.5"/>Quizzes</Button></Link>
              <Link href="/quiz/new"><Button variant="ghost" size="sm"><Plus className="h-4 w-4 mr-1.5"/>Crear</Button></Link>
              <Link href="/profile"><Button variant="ghost" size="sm"><UserIcon className="h-4 w-4 mr-1.5"/>{user?.name?.split(" ")[0] ?? "Perfil"}</Button></Link>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}><LogOut className="h-4 w-4"/></Button>
            </>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost" size="sm">Ingresar</Button></Link>
              <Link href="/signup"><Button size="sm">Crear cuenta</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
