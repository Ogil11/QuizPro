import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "./db"
import { robleLogin } from "@/src/features/auth/roble-client"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase()
        let user = null as Awaited<ReturnType<typeof prisma.user.findUnique>>

        try {
          user = await prisma.user.findUnique({ where: { email } })
        } catch {}

        if (!user || !user.password) {
          try {
            const roble = await robleLogin(email, credentials.password)
            if (roble?.success) {
              try {
                user = await prisma.user.upsert({
                  where: { email },
                  create: {
                    email,
                    name: roble.user?.name ?? email.split("@")[0],
                    robleToken: roble.accessToken,
                    robleUserId: roble.user?.id ?? null,
                    provider: "roble",
                  },
                  update: { robleToken: roble.accessToken },
                })
                return { id: user.id, email: user.email, name: user.name ?? "" }
              } catch {}
              return {
                id: roble.user?.id ?? `roble:${email}`,
                email,
                name: roble.user?.name ?? email.split("@")[0],
              }
            }
          } catch {}
        }
        if (!user || !user.password) return null
        const ok = await bcrypt.compare(credentials.password, user.password)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name ?? "" }
      },
    }),
    // TODO: feature/auth (Alberto) - Google OAuth provider
    // GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = (user as any).id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) (session.user as any).id = token.id
      return session
    },
  },
}
