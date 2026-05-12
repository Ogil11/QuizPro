import { JSDOM } from "jsdom"
import { Readability } from "@mozilla/readability"

export type ExtractedContentSource =
  | {
      kind: "file"
      fileName: string
      contentType?: string
      buffer: Buffer
    }
  | {
      kind: "url"
      url: string
    }

export interface ExtractedContent {
  name: string
  type: string
  url?: string
  extractedText: string
  metadata: {
    source: "file" | "url"
    contentType?: string
    size?: number
    title?: string
  }
}

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
])

function cleanExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function inferType(fileName: string, contentType?: string) {
  const lower = fileName.toLowerCase()
  if (contentType?.includes("pdf") || lower.endsWith(".pdf")) return "pdf"
  if (contentType?.includes("html") || lower.endsWith(".html") || lower.endsWith(".htm")) return "html"
  if (contentType && TEXT_TYPES.has(contentType)) return "text"
  if (/\.(txt|md|markdown|csv|json|xml)$/i.test(lower)) return "text"
  return contentType || "unknown"
}

function extractReadableText(html: string, url?: string) {
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()
  const title = article?.title || dom.window.document.title || undefined
  const text = article?.textContent || dom.window.document.body?.textContent || ""

  return {
    title,
    text: cleanExtractedText(text),
  }
}

async function extractPdf(buffer: Buffer) {
  const pdfModule = await import("pdf-parse/lib/pdf-parse.js")
  const pdfParse = pdfModule.default ?? pdfModule
  const parsed = await pdfParse(buffer)

  return {
    text: parsed.text,
    title: parsed.info?.Title as string | undefined,
  }
}

async function extractFromFile(source: Extract<ExtractedContentSource, { kind: "file" }>): Promise<ExtractedContent> {
  const contentType = source.contentType
  const type = inferType(source.fileName, contentType)

  if (type === "pdf") {
    const parsed = await extractPdf(source.buffer)
    return {
      name: source.fileName,
      type,
      extractedText: cleanExtractedText(parsed.text),
      metadata: {
        source: "file",
        contentType,
        size: source.buffer.length,
        title: parsed.title,
      },
    }
  }

  if (type === "html") {
    const html = source.buffer.toString("utf8")
    const readable = extractReadableText(html)
    return {
      name: source.fileName,
      type,
      extractedText: readable.text,
      metadata: {
        source: "file",
        contentType,
        size: source.buffer.length,
        title: readable.title,
      },
    }
  }

  if (type === "text") {
    return {
      name: source.fileName,
      type,
      extractedText: cleanExtractedText(source.buffer.toString("utf8")),
      metadata: {
        source: "file",
        contentType,
        size: source.buffer.length,
      },
    }
  }

  throw new Error(`Unsupported file type: ${contentType || source.fileName}`)
}

async function extractFromUrl(source: Extract<ExtractedContentSource, { kind: "url" }>): Promise<ExtractedContent> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "QuizPro-RAG/1.0",
      Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`URL fetch failed: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  const type = inferType(source.url, contentType)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (type === "pdf") {
    const parsed = await extractPdf(buffer)
    return {
      name: parsed.title || source.url,
      type,
      url: source.url,
      extractedText: cleanExtractedText(parsed.text),
      metadata: {
        source: "url",
        contentType,
        size: buffer.length,
        title: parsed.title,
      },
    }
  }

  const rawText = buffer.toString("utf8")
  const readable = contentType?.includes("html")
    ? extractReadableText(rawText, source.url)
    : { title: undefined, text: cleanExtractedText(rawText) }

  return {
    name: readable.title || source.url,
    type: contentType?.includes("html") ? "url" : type,
    url: source.url,
    extractedText: readable.text,
    metadata: {
      source: "url",
      contentType,
      size: buffer.length,
      title: readable.title,
    },
  }
}

export async function extractContent(source: ExtractedContentSource): Promise<ExtractedContent> {
  const extracted = source.kind === "file"
    ? await extractFromFile(source)
    : await extractFromUrl(source)

  if (extracted.extractedText.length < 50) {
    throw new Error("Extracted text is too short to index")
  }

  return extracted
}

const contentExtractor = { extractContent }

export default contentExtractor
