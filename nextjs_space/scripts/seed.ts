import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const adminPass = await bcrypt.hash("johndoe123", 10)
  const admin = await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {},
    create: { email: "john@doe.com", password: adminPass, name: "John Doe", isAdmin: true },
  })

  const demoQuiz = await prisma.quiz.upsert({
    where: { id: "demo-quiz-1" },
    update: {},
    create: {
      id: "demo-quiz-1",
      name: "Fundamentos de JavaScript",
      description: "Quiz introductorio sobre JavaScript moderno",
      category: "Programaci\u00f3n",
      difficulty: "easy",
      isPublic: true,
      creationMode: "manual",
      creatorId: admin.id,
    },
  })

  const count = await prisma.question.count({ where: { quizId: demoQuiz.id } })
  if (count === 0) {
    await prisma.question.createMany({
      data: [
        {
          quizId: demoQuiz.id,
          type: "single",
          text: "\u00bfCu\u00e1l de los siguientes es un tipo primitivo en JavaScript?",
          options: ["object", "string", "array", "function"],
          correctAnswers: [1],
          order: 0,
        },
        {
          quizId: demoQuiz.id,
          type: "multiple",
          text: "\u00bfCu\u00e1les son palabras reservadas para declarar variables?",
          options: ["var", "let", "const", "def"],
          correctAnswers: [0, 1, 2],
          order: 1,
        },
        {
          quizId: demoQuiz.id,
          type: "truefalse",
          text: "=== compara valor y tipo en JavaScript.",
          options: ["Verdadero", "Falso"],
          correctAnswers: [0],
          order: 2,
        },
      ],
    })
  }
  console.log("Seed completed")
}

main().finally(() => prisma.$disconnect())
