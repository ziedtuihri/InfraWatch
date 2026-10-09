import { authHeaders } from './auth'

const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'
const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

export async function getMorpheusConfig(auth) {
  if (!USE_LIVE) return null
  const res = await fetch(`${API_BASE}/morpheus-config`, { headers: authHeaders(auth) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch Morpheus config')
  return res.json()
}

export async function saveMorpheusConfig(auth, { morpheus_url, morpheus_token }) {
  if (!USE_LIVE) return { success: true }
  const res = await fetch(`${API_BASE}/morpheus-config`, {
    method: 'PUT',
    headers: authHeaders(auth),
    body: JSON.stringify({ morpheus_url, morpheus_token }),
  })
  if (!res.ok) {
    let msg = 'Failed to save Morpheus config'
    try {
      const err = await res.json()
      msg = err?.detail?.message || msg   // e.g. "The Morpheus API token was rejected..."
    } catch { /* keep generic message */ }
    throw new Error(msg)
  }
  return res.json()
}

export async function saveSession(auth, config, sessionName) {
  if (!USE_LIVE) return { success: true, session_id: Date.now() }
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ config, session_name: sessionName || null }),
  })
  if (!res.ok) throw new Error('Failed to save session')
  return res.json()
}

/**
 * Fetch the user's most recent saved session from the DB.
 * Returns null if none exists or on any error.
 */
export async function getLatestSession(auth) {
  if (!USE_LIVE) return null
  const res = await fetch(`${API_BASE}/sessions/latest`, {
    headers: authHeaders(auth),
  })
  // 404 = the DB genuinely has no saved session for this user.
  // Returning null lets the caller clear any stale localStorage cache.
  if (res.status === 404) return null
  // Any other failure (401/500/network) throws so the caller can keep the
  // localStorage fallback instead of wrongly wiping it.
  if (!res.ok) throw new Error(`sessions/latest failed: ${res.status}`)
  return res.json()
}

/**
 * Supported (air-gapped, pre-packaged) Grafana template IDs from the backend.
 * Returns an array of numbers, or null on any failure (the backend still
 * enforces the whitelist server-side, so null just skips the early UI check).
 */
export async function getSupportedTemplates() {
  if (!USE_LIVE) return null
  try {
    const res = await fetch(`${API_BASE}/grafana/templates`)
    if (!res.ok) return null
    const rows = await res.json()
    return rows.map(r => Number(r.id)).filter(Number.isFinite)
  } catch {
    return null
  }
}
