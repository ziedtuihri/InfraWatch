const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'
const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

function getHeaders(auth) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const uid = auth?.user?.id ?? (auth?.token && Number(auth.token) > 0 ? Number(auth.token) : undefined)
  if (uid) h['X-User-Id'] = String(uid)
  if (auth?.user?.role) h['X-User-Role'] = auth.user.role
  return h
}

/**
 * Fetch the SHARED tool/exporter selection already configured for a
 * resource — readable by any role. Returns null if nothing's been
 * configured yet (404) or if live data is disabled, so callers can fall
 * back to an empty/default state without treating that as an error.
 *
 * This is what lets a viewer logging in for the first time see "admin
 * already picked Prometheus + node_exporter on this VM" instead of a
 * blank, unconfigured-looking step with no way to know what's real.
 */
export async function getResourceToolConfig(resourceId, auth) {
  if (!USE_LIVE || !resourceId) return null
  try {
    const res = await fetch(
      `${API_BASE}/resource-tools?resource_id=${encodeURIComponent(resourceId)}`,
      { headers: getHeaders(auth) }
    )
    if (res.status === 404) return null
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Save the shared tool/exporter selection for a resource. Admin/
 * superadmin only at the backend — will reject with 403 for any other
 * role, matching the same write boundary thresholds already use.
 */
export async function saveResourceToolConfig(resourceId, { metrics, logs }, auth) {
  if (!USE_LIVE || !resourceId) return { success: true }
  const res = await fetch(
    `${API_BASE}/resource-tools?resource_id=${encodeURIComponent(resourceId)}`,
    {
      method: 'PUT',
      headers: getHeaders(auth),
      body: JSON.stringify({ metrics, logs }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `Failed to save tool config (${res.status})`)
  }
  return res.json()
}
