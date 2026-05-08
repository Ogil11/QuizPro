import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getPrismaClient() {
  const dbUrl = process.env.DATABASE_URL

  if (!dbUrl) return new PrismaClient()

  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient({
      datasources: {
        db: { url: dbUrl },
      },
    })
  }

  const url = new URL(dbUrl)
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20')

  return new PrismaClient({
    datasources: {
      db: { url: url.toString() },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? getPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
