import type { GeneratedQuestion } from "./gemma-client"

const MIN_QUESTION_LENGTH = 10
const MIN_EXPLANATION_LENGTH = 15

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[¿?.,;:()]/g, "")
    .replace(/\s+/g, " ")
}

function hasDuplicateOptions(options: string[]): boolean {
  const normalized = options.map(normalizeText)
  return new Set(normalized).size !== normalized.length
}

function validCorrectAnswers(
  q: GeneratedQuestion
): boolean {

  if (!Array.isArray(q.correctAnswers)) {
    return false
  }

  if (q.correctAnswers.length === 0) {
    return false
  }

  const unique = new Set(q.correctAnswers)

  if (unique.size !== q.correctAnswers.length) {
    return false
  }

  return q.correctAnswers.every(
    i =>
      Number.isInteger(i) &&
      i >= 0 &&
      i < q.options.length
  )
}

function validQuestionByType(
  q: GeneratedQuestion
): boolean {

  if (q.type === "single") {
    return q.correctAnswers.length === 1
  }

  if (q.type === "multiple") {
    return q.correctAnswers.length >= 2
  }

  if (q.type === "truefalse") {

    return (
      q.options.length === 2 &&
      q.options[0] === "Verdadero" &&
      q.options[1] === "Falso" &&
      q.correctAnswers.length === 1
    )
  }

  return false
}

function validExplanation(
  explanation?: string
): boolean {

  if (!explanation) return false

  return (
    explanation.trim().length >=
    MIN_EXPLANATION_LENGTH
  )
}

function validQuestionText(
  text: string
): boolean {

  return (
    normalizeText(text).length >=
    MIN_QUESTION_LENGTH
  )
}

export function validateQuestions(
  questions: GeneratedQuestion[]
): GeneratedQuestion[] {

  const accepted: GeneratedQuestion[] = []

  const seenQuestions = new Set<string>()

  for (const q of questions) {

    // TEXT
    if (!validQuestionText(q.text)) {
      continue
    }

    // DUPLICATE QUESTION
    const normalizedQuestion =
      normalizeText(q.text)

    if (
      seenQuestions.has(normalizedQuestion)
    ) {
      continue
    }

    seenQuestions.add(normalizedQuestion)

    // OPTIONS
    if (
      !Array.isArray(q.options) ||
      q.options.length === 0
    ) {
      continue
    }

    // DUPLICATE OPTIONS
    if (hasDuplicateOptions(q.options)) {
      continue
    }

    // ANSWERS
    if (!validCorrectAnswers(q)) {
      continue
    }

    // TYPE RULES
    if (!validQuestionByType(q)) {
      continue
    }

    // EXPLANATION
    if (!validExplanation(q.explanation)) {
      q.explanation =
        "La respuesta correcta corresponde al concepto evaluado."
    }

    accepted.push(q)
  }

  return accepted
}