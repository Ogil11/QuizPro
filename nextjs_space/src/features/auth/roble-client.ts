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
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {}

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
