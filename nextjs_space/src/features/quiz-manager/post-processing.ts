import type { GeneratedQuestion } from "./gemma-client"


export function postProcessQuestions(
  questions: GeneratedQuestion[]
): GeneratedQuestion[] {

  return questions.map(q => {

    let processed =
      cleanQuestion(q)

    processed =
      shuffleQuestionOptions(
        processed
      )

    return processed
  })
}


function shuffleArray<T>(
  array: T[]
): T[] {

  const copy = [...array]

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {

    const j = Math.floor(
      Math.random() * (i + 1)
    )

    ;[copy[i], copy[j]] = [
      copy[j],
      copy[i],
    ]
  }

  return copy
}

function shuffleQuestionOptions(
  q: GeneratedQuestion
): GeneratedQuestion {

  // truefalse NO se mezcla
  if (q.type === "truefalse") {
    return q
  }

  const indexed = q.options.map(
    (option, index) => ({
      option,
      index,
    })
  )

  const shuffled =
    shuffleArray(indexed)

  const newOptions =
    shuffled.map(x => x.option)

  const newCorrectAnswers =
    shuffled
      .map((x, newIndex) => ({
        newIndex,
        wasCorrect:
          q.correctAnswers.includes(
            x.index
          ),
      }))
      .filter(x => x.wasCorrect)
      .map(x => x.newIndex)

  return {
    ...q,
    options: newOptions,
    correctAnswers:
      newCorrectAnswers.sort(),
  }
}

function cleanText(
  text: string
): string {

  return text
    .replace(/\s+/g, " ")
    .replace(/\.\.+/g, ".")
    .trim()
}

function cleanQuestion(
  q: GeneratedQuestion
): GeneratedQuestion {

  return {

    ...q,

    text: cleanText(q.text),

    options: q.options.map(cleanText),

    explanation: q.explanation
      ? cleanText(q.explanation)
      : undefined,
  }
}
