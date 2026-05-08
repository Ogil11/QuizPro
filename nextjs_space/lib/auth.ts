import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
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

        try {
          const roble = await robleLogin(email, credentials.password)
          if (!roble?.success) return null

          return {
            id: roble.user?.id ?? `roble:${email}`,
            email,
            name: roble.user?.name ?? email.split("@")[0],
            robleAccessToken: roble.accessToken,
          }
        } catch {
          return null
        }
      },
    }),
    // TODO: feature/auth (Alberto) - Google OAuth provider
    // GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.robleAccessToken = (user as any).robleAccessToken
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) (session.user as any).id = token.id
      if (session.user && token.robleAccessToken) (session.user as any).robleAccessToken = token.robleAccessToken
      return session
    },
  },
}
