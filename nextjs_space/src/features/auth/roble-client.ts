// Integration with Roble (Uninorte OpenLab) backend
// Endpoints:
//   POST {ROBLE_BASE_URL}/{DB_NAME}/signup-direct
//   POST {ROBLE_BASE_URL}/{DB_NAME}/login

const BASE = process.env.ROBLE_BASE_URL ?? ""
const DB = process.env.ROBLE_DB_NAME ?? ""

function robleUrl(path: string) {
  return `${BASE}/auth/${DB}/${path}`
}

export async function robleSignup(email: string, password: string, name?: string): Promise<any> {
  if (!BASE || !DB) return { success: false, error: "Roble not configured" }
  try {
    const res = await fetch(robleUrl("signup-direct"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name ?? email.split("@")[0] }),
    })
    const data = await res.json().catch(() => ({}))
    return { success: res.ok, ...data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Roble signup failed" }
  }
}

export async function robleLogin(email: string, password: string): Promise<any> {
  if (!BASE || !DB) return { success: false, error: "Roble not configured" }
  try {
    const res = await fetch(robleUrl("login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    return { success: res.ok, ...data }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Roble login failed" }
  }
}
