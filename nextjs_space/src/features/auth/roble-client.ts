const BASE = process.env.ROBLE_BASE_URL ?? "https://roble-api.openlab.uninorte.edu.co"
const DB = process.env.ROBLE_DB_NAME ?? ""

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "")
}

function robleBases() {
  const configured = normalizeBase(BASE)
  const canonical = "https://roble-api.openlab.uninorte.edu.co"

  if (!configured) return [canonical]
  if (configured.includes("roble.openlab.uninorte.edu.co")) {
    return Array.from(new Set([configured.replace("roble.openlab.uninorte.edu.co", "roble-api.openlab.uninorte.edu.co"), canonical]))
  }

  return Array.from(new Set([configured, canonical]))
}

function robleUrls(path: string) {
  return robleBases().flatMap((base) => [
    `${base}/auth/${DB}/${path}`,
    `${base}/${DB}/${path}`,
  ])
}

function robleDataUrls(path: string) {
  return robleBases().flatMap((base) => [
    `${base}/database/${DB}/${path}`,
    `${base}/db/${DB}/${path}`,
    `${base}/data/${DB}/${path}`,
  ])
}

function parseJson(text: string) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function requestRobleData(
  path: string,
  payloads: Record<string, unknown>[],
  accessToken?: string,
  options?: { methods?: string[]; debug?: boolean }
) {
  if (!BASE || !DB) return { success: false, error: "Roble not configured", status: 500 }

  let firstError = "Roble request failed"
  let firstStatus = 500
  let firstNon404Error = ""
  let firstNon404Status = 500
  let firstDebug: Record<string, unknown> | undefined
  let firstNon404Debug: Record<string, unknown> | undefined
  const methods = options?.methods ?? ["POST"]

  for (const url of robleDataUrls(path)) {
    for (const payload of payloads) {
      for (const method of methods) {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" }
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`

          const body = JSON.stringify(payload)
          const res = await fetch(url, {
            method,
            headers,
            body,
          })

          const text = await res.text()
          const data: any = parseJson(text)
          const debug = { url, method, requestBody: payload, status: res.status, rawResponseBody: text, parsedResponse: data }
          if (options?.debug) console.log(`[roble:${path}]`, JSON.stringify(debug, null, 2))

          if (res.ok) return { success: true, status: res.status, url, method, rawResponseBody: text, ...data }

          const err = data?.error ?? data?.message ?? (text || `Roble ${path} failed on ${url} (${res.status})`)
          if (options?.debug && (res.status === 401 || res.status === 403)) {
            return { success: false, error: err, status: res.status, debug }
          }
          if (options?.debug && res.status === 500 && text.includes('column "undefined" does not exist')) {
            return { success: false, error: err, status: res.status, debug }
          }
          if (firstError === "Roble request failed") {
            firstError = err
            firstStatus = res.status
            firstDebug = debug
          }
          if (res.status !== 404 && !firstNon404Error) {
            firstNon404Error = err
            firstNon404Status = res.status
            firstNon404Debug = debug
          }
        } catch (e: any) {
          const err = e?.message ?? "Roble request failed"
          const debug = { url, method, requestBody: payload, error: err }
          if (options?.debug) console.log(`[roble:${path}]`, JSON.stringify(debug, null, 2))
          if (firstError === "Roble request failed") {
            firstError = err
            firstStatus = 500
            firstDebug = debug
          }
          if (!firstNon404Error) {
            firstNon404Error = err
            firstNon404Status = 500
            firstNon404Debug = debug
          }
        }
      }
    }
  }

  return {
    success: false,
    error: firstNon404Error || firstError,
    status: firstNon404Error ? firstNon404Status : firstStatus,
    debug: firstNon404Debug || firstDebug,
  }
}

async function requestRoble(path: string, payload: Record<string, unknown>) {
  if (!BASE || !DB) return { success: false, error: "Roble not configured" }

  let firstError = "Roble request failed"
  let firstStatus = 500
  let firstNon404Error = ""
  let firstNon404Status = 500

  for (const url of robleUrls(path)) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      const data: any = parseJson(text)

      if (res.ok) return { success: true, status: res.status, url, ...data }

      const err = data?.error ?? data?.message ?? `Roble ${path} failed on ${url} (${res.status})`
      if (firstError === "Roble request failed") {
        firstError = err
        firstStatus = res.status
      }
      if (res.status !== 404 && !firstNon404Error) {
        firstNon404Error = err
        firstNon404Status = res.status
      }
    } catch (e: any) {
      const err = e?.message ?? "Roble request failed"
      if (firstError === "Roble request failed") {
        firstError = err
        firstStatus = 500
      }
      if (!firstNon404Error) {
        firstNon404Error = err
        firstNon404Status = 500
      }
    }
  }

  return {
    success: false,
    error: firstNon404Error || firstError,
    status: firstNon404Error ? firstNon404Status : firstStatus,
  }
}

export async function robleSignup(email: string, password: string, name?: string): Promise<any> {
  return requestRoble("signup-direct", {
    email,
    password,
    name: name ?? email.split("@")[0],
  })
}

export async function robleLogin(email: string, password: string): Promise<any> {
  return requestRoble("login", { email, password })
}

function parseRows(raw: any): any[] {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.rows)) return raw.rows
  if (Array.isArray(raw?.data)) return raw.data
  if (Array.isArray(raw?.result)) return raw.result
  if (Array.isArray(raw?.records)) return raw.records
  if (Array.isArray(raw?.inserted)) return raw.inserted
  return []
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase()
}

function tableNameVariants(tableName: string) {
  const out = new Set<string>()
  const clean = tableName.trim()
  if (!clean) return []

  out.add(clean)
  out.add(clean.toLowerCase())
  out.add(clean.toUpperCase())
  out.add(`"${clean}"`)

  const snake = toSnakeCase(clean)
  out.add(snake)
  out.add(`"${snake}"`)

  const pluralize = (n: string) => (n.endsWith("s") ? n : `${n}s`)
  const singularize = (n: string) => (n.endsWith("s") ? n.slice(0, -1) : n)

  const pluralClean = pluralize(clean)
  const pluralSnake = pluralize(snake)
  const singularClean = singularize(clean)
  const singularSnake = singularize(snake)

  out.add(pluralClean)
  out.add(pluralClean.toLowerCase())
  out.add(pluralSnake)
  out.add(`"${pluralSnake}"`)
  out.add(singularClean)
  out.add(singularClean.toLowerCase())
  out.add(singularSnake)
  out.add(`"${singularSnake}"`)

  return Array.from(out)
}

function transformRecordKeys(record: Record<string, any>, mode: "identity" | "snake") {
  if (mode === "identity") return record
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [toSnakeCase(k), v]))
}

function whereVariants(where?: Record<string, any>) {
  const base = where ?? {}
  const variants: Record<string, any>[] = []

  if (base.id !== undefined && base._id === undefined) {
    const { id, ...rest } = base
    variants.push({ _id: id, ...rest })
  }

  variants.push(base)
  variants.push(Object.fromEntries(Object.entries(base).map(([k, v]) => [toSnakeCase(k), v])))

  const seen = new Set<string>()
  return variants.filter((variant) => {
    const key = JSON.stringify(variant)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function primaryKeyValue(where?: Record<string, any>) {
  return where?._id ?? where?.id
}

function malformedWhereError(tableName: string, where?: Record<string, any>) {
  const keys = Object.keys(where ?? {})
  const badKey = keys.find((key) => key === "undefined" || key.trim() === "")
  if (badKey) {
    return {
      success: false,
      error: `Delete aborted: invalid where key "${badKey}" for ${tableName}`,
      status: 400,
      debug: { tableName, where },
    }
  }

  const id = primaryKeyValue(where)
  if (id === undefined || id === null || String(id).trim() === "") {
    return {
      success: false,
      error: `Delete aborted: ${tableName} delete requires where._id`,
      status: 400,
      debug: { tableName, where },
    }
  }

  return null
}

function uniqueRecordSets(recordSets: Record<string, any>[][]) {
  const seen = new Set<string>()
  const out: Record<string, any>[][] = []
  for (const set of recordSets) {
    const keys = set.map((r) => Object.keys(r).sort().join("|")).join("||")
    if (seen.has(keys)) continue
    seen.add(keys)
    out.push(set)
  }
  return out
}

function extractInvalidColumns(skipped: any[]) {
  const out = new Set<string>()
  const text = JSON.stringify(skipped ?? [])

  for (const match of text.matchAll(/column\s+"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/gi)) {
    if (match[1]) out.add(match[1])
  }

  for (const match of text.matchAll(/invalid\s+columns?[^\[]*\[([^\]]+)\]/gi)) {
    const cols = match[1]
      .split(",")
      .map((v) => v.replace(/["'`\s]/g, ""))
      .filter(Boolean)
    for (const c of cols) out.add(c)
  }

  for (const match of text.matchAll(/"([a-zA-Z0-9_]+)"\s*:/g)) {
    if (match[1]) out.add(match[1])
  }

  return Array.from(out)
}

function stripColumnsFromRecords(records: Record<string, any>[], columns: string[]) {
  if (columns.length === 0) return records
  const deny = new Set(columns.map((c) => c.toLowerCase()))
  return records.map((record) => Object.fromEntries(Object.entries(record).filter(([k]) => !deny.has(k.toLowerCase()))))
}

function recordCandidateSets(records: Record<string, any>[]) {
  const candidates: Record<string, any>[][] = [records]
  const baseTrimmed = records.map((record) => {
    const copy = { ...record }
    delete copy.updatedAt
    delete copy.createdAt
    delete copy.creationMode
    delete copy.isPublic
    delete copy.description
    delete copy.explanation
    return copy
  })
  candidates.push(baseTrimmed)
  return uniqueRecordSets(candidates)
}

export async function robleDbRead(args: {
  tableName: string
  token: string
  where?: Record<string, any>
  orderBy?: string
  orderDirection?: "asc" | "desc"
}) {
  let firstErr: { error: string; status: number; url: string } | null = null

  for (const tableName of tableNameVariants(args.tableName)) {
    for (const where of whereVariants(args.where)) {
      const params = new URLSearchParams({ tableName })
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined || value === null) continue
        if (typeof value === "object") continue
        params.set(key, String(value))
      }

      for (const base of robleBases()) {
        const url = `${base}/database/${DB}/read?${params.toString()}`
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${args.token}` } })
          const text = await res.text()
          const data: any = parseJson(text)
          if (res.ok) return { success: true, rows: parseRows(data), raw: data, status: res.status, url, tableName }
          if (res.status === 404) continue
          const current = { error: data?.message ?? data?.error ?? "Read failed", status: res.status, url }
          if (!firstErr) firstErr = current
        } catch (e: any) {
          const current = { error: e?.message ?? "Read failed", status: 500, url }
          if (!firstErr) firstErr = current
        }
      }
    }
  }

  if (firstErr) return { success: false, ...firstErr }
  return { success: false, error: "Read endpoint not found", status: 404 }
}

export async function robleDbInsert(args: {
  tableName: string
  token: string
  records: Record<string, any>[]
}) {
  let firstErr: { success: false; error: string; status: number } | null = null

  for (const tableName of tableNameVariants(args.tableName)) {
    for (const mode of ["identity", "snake"] as const) {
      const mapped = args.records.map((record) => transformRecordKeys(record, mode))
      for (const records of recordCandidateSets(mapped)) {
        const result = await requestRobleData("insert", [{ tableName, records }], args.token)
        if (result.success) {
          const inserted = parseRows(result)
          const skipped = Array.isArray((result as any)?.skipped) ? (result as any).skipped : []
          if (inserted.length > 0) return { ...result, inserted, tableName }
          if (skipped.length === 0) return { ...result, inserted, tableName }
          const invalid = extractInvalidColumns(skipped)
          if (invalid.length > 0) {
            const stripped = stripColumnsFromRecords(records, invalid)
            if (stripped.some((r) => Object.keys(r).length > 0)) {
              const retry = await requestRobleData("insert", [{ tableName, records: stripped }], args.token)
              if (retry.success) {
                const retriedInserted = parseRows(retry)
                if (retriedInserted.length > 0) return { ...retry, inserted: retriedInserted, tableName }
              }
            }
          }
          if (!firstErr) {
            firstErr = {
              success: false,
              error: `Insert sin filas en ${tableName}: ${JSON.stringify(skipped).slice(0, 500)}`,
              status: 400,
            }
          }
          continue
        }
        if (!firstErr) firstErr = { success: false, error: result.error ?? "Insert failed", status: result.status ?? 500 }
      }
    }
  }

  return firstErr ?? { success: false, error: "Insert failed", status: 500 }
}

export async function robleDbUpdate(args: {
  tableName: string
  token: string
  where?: Record<string, any>
  data: Record<string, any>
}) {
  let firstErr: any = null

  for (const tableName of tableNameVariants(args.tableName)) {
    for (const mode of ["identity", "snake"] as const) {
      for (const where of whereVariants(args.where)) {
        const data = transformRecordKeys(args.data, mode)
        const id = primaryKeyValue(where)
        const payloads = [
          { tableName, where, data },
          { tableName, filters: where, data },
          { tableName, where, updates: data },
          { tableName, filters: where, set: data },
          ...(id !== undefined && id !== null ? [
            { tableName, id, data },
            { tableName, _id: id, data },
            { tableName, record: { _id: id, ...data } },
            { tableName, records: [{ _id: id, ...data }] },
          ] : []),
        ]
        const result = await requestRobleData("update", payloads, args.token, { methods: ["POST", "PUT", "PATCH"], debug: true })
        if (result.success) return result
        if (!firstErr) firstErr = result
      }
    }
  }
  return firstErr ?? { success: false, error: "Update failed", status: 500 }
}

export async function robleDbDelete(args: {
  tableName: string
  token: string
  where?: Record<string, any>
}) {
  const invalid = malformedWhereError(args.tableName, args.where)
  if (invalid) return invalid

  let firstErr: any = null

  for (const tableName of tableNameVariants(args.tableName)) {
    const id = primaryKeyValue(args.where)
    const where = { _id: id }
    const payloads = [
      { tableName, where },
      { tableName, filters: where },
    ]
    const result = await requestRobleData("delete", payloads, args.token, { methods: ["POST"], debug: true })
    if (result.success) return result
    const raw = String((result as any)?.debug?.rawResponseBody ?? result.error ?? "")
    if (result.status === 500 && raw.includes('column "undefined" does not exist')) return result
    if (!firstErr) firstErr = result
  }
  return firstErr ?? { success: false, error: "Delete failed", status: 500 }
}
