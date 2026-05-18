import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { robleDbDelete, robleDbInsert, robleDbRead } from "@/src/features/auth/roble-client"
import contentExtractor from "@/src/features/content-upload/extract"
import { deleteDocumentChunks, processDocument } from "@/src/features/rag-engine"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function documentIdFromInsert(insertResult: any) {
  const inserted = Array.isArray(insertResult?.inserted) ? insertResult.inserted : []
  const first = inserted[0] ?? insertResult?.rows?.[0] ?? insertResult?.data?.[0]
  return first?._id || first?.id
}

async function getAuth() {
  const session = await getServerSession(authOptions)
  const accessToken = (session?.user as any)?.robleAccessToken as string | undefined
  const userId = (session?.user as any)?.id as string | undefined

  if (!accessToken || !userId) {
    return null
  }

  return { accessToken, userId }
}

export async function GET() {
  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const docsResult = await robleDbRead({
    tableName: "Document",
    token: auth.accessToken,
    where: { userId: auth.userId },
    orderBy: "createdAt",
    orderDirection: "desc",
  })

  if (!docsResult.success) {
    return NextResponse.json(
      { error: "Documents read failed", message: docsResult.error },
      { status: docsResult.status ?? 500 }
    )
  }

  return NextResponse.json({ documents: docsResult.rows ?? [] })
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuth()
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { id } = await req.json().catch(() => ({}))
    const documentId = typeof id === "string" ? id.trim() : ""

    if (!documentId) {
      return NextResponse.json({ error: "Document id is required" }, { status: 400 })
    }

    const docsResult = await robleDbRead({
      tableName: "Document",
      token: auth.accessToken,
      where: { _id: documentId },
    })

    if (!docsResult.success) {
      return NextResponse.json(
        { error: "Document read failed", message: docsResult.error },
        { status: docsResult.status ?? 500 }
      )
    }

    const document = (docsResult.rows ?? []).find((doc: any) => String(doc._id || doc.id || "") === documentId)
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    if (String(document.userId || document.user_id || "") !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const deletedChunks = await deleteDocumentChunks(documentId, auth.accessToken)
    const deleteResult = await robleDbDelete({
      tableName: "Document",
      token: auth.accessToken,
      where: { _id: documentId },
    })

    if (!deleteResult.success) {
      return NextResponse.json(
        { error: "Document delete failed", message: deleteResult.error },
        { status: deleteResult.status ?? 500 }
      )
    }

    return NextResponse.json({ success: true, deletedChunks })
  } catch (error: any) {
    console.error("[documents:delete] Error:", error)
    return NextResponse.json(
      {
        error: "Document delete failed",
        message: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth()
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const contentType = req.headers.get("content-type") || ""
    const source = contentType.includes("multipart/form-data")
      ? await sourceFromFormData(req)
      : await sourceFromJson(req)

    const extracted = await contentExtractor.extractContent(source)
    const now = new Date().toISOString()
    const documentRecord = {
      userId: auth.userId,
      name: extracted.name,
      type: extracted.type,
      storePath: source.kind === "file" ? `memory://${extracted.name}` : "",
      url: extracted.url || "",
      extractedText: extracted.extractedText,
      status: "processing",
      createdAt: now,
    }

    const insertResult = await robleDbInsert({
      tableName: "Document",
      token: auth.accessToken,
      records: [documentRecord],
    })

    if (!insertResult.success) {
      return NextResponse.json(
        { error: "Document insert failed", message: insertResult.error },
        { status: insertResult.status ?? 500 }
      )
    }

    const documentId = documentIdFromInsert(insertResult)
    if (!documentId) {
      return NextResponse.json(
        { error: "Document insert did not return an id" },
        { status: 500 }
      )
    }

    const ragResult = await processDocument(
      documentId,
      extracted.extractedText,
      auth.accessToken
    )

    return NextResponse.json({
      success: true,
      document: {
        id: documentId,
        ...documentRecord,
        status: "completed",
        extractedTextLength: extracted.extractedText.length,
      },
      extraction: extracted.metadata,
      rag: ragResult,
    }, { status: 201 })
  } catch (error: any) {
    console.error("[documents:post] Error:", error)
    return NextResponse.json(
      {
        error: "Document processing failed",
        message: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}

async function sourceFromFormData(req: NextRequest) {
  const form = await req.formData()
  const file = form.get("file")

  if (!(file instanceof File)) {
    throw new Error("Multipart upload requires a 'file' field")
  }

  const isImage = file.type?.startsWith("image/")

  return {
    kind: isImage ? ("image" as const) : ("file" as const),
    fileName: file.name || "uploaded-document",
    contentType: file.type || undefined,
    buffer: Buffer.from(await file.arrayBuffer()),
  }
}

async function sourceFromJson(req: NextRequest) {
  const body = await req.json()
  const url = typeof body?.url === "string" ? body.url.trim() : ""

  if (!url) {
    throw new Error("JSON upload requires a 'url' field")
  }

  try {
    return {
      kind: "url" as const,
      url: new URL(url).toString(),
    }
  } catch {
    throw new Error("Invalid URL")
  }
}
