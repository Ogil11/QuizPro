export function extractJSONObject(
  text: string
): string | null {

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start === -1 || end === -1) {
    return null
  }

  return text
    .slice(start, end + 1)
    .trim()
}

export function safeJsonParse(
  raw: string
): any | null {

  try {

    const extracted =
      extractJSONObject(raw)

    if (!extracted) {
      return null
    }

    return JSON.parse(extracted)

  } catch {

    return null
  }
}