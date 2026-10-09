import { useState, useEffect, useCallback } from 'react'

const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'
const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

// Tiny cross-component event bus. When one useThresholds instance saves,
// every other instance watching the same resourceId (e.g. the tab-badge
// hook and the Thresholds page itself) refetches immediately — no more
// waiting for a manual page refresh to see updated thresholds reflected
// elsewhere in the app.
const thresholdEvents = new EventTarget()
function broadcastThresholdSave(resourceId) {
  thresholdEvents.dispatchEvent(new CustomEvent('saved', { detail: { resourceId } }))
}

function getHeaders(auth) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  // token equals String(user.id) in live mode (see auth.js line 38)
  const uid = auth?.user?.id ?? (auth?.token && Number(auth.token) > 0 ? Number(auth.token) : undefined)
  if (uid) h['X-User-Id'] = String(uid)
  if (auth?.user?.role) h['X-User-Role'] = auth.user.role
  return h
}

function getUserId(auth) {
  if (auth?.user?.id) return auth.user.id
  const n = Number(auth?.token)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Dedupe concurrent fetches for the same resourceId. Without this, every
// component that calls useThresholds for the same resource (ThresholdsPage,
// AlertsPage, useActiveAlertCount — all three mount around the same time on
// a tab switch) fires its own independent GET, producing 2-3x redundant
// network calls and, when nothing's been saved yet, 2-3x identical 404s in
// the console — which is most of what looked like "a mess" of repeated
// errors on every refresh.
const inFlightFetches = new Map()  // resourceId -> Promise<thresholds|null>

function fetchThresholds(resourceId, auth) {
  if (inFlightFetches.has(resourceId)) return inFlightFetches.get(resourceId)

  const url     = `${API_BASE}/thresholds?resource_id=${encodeURIComponent(resourceId)}`
  const headers = getHeaders(auth)

  const promise = fetch(url, { headers })
    .then(r => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(r.status)))
    .then(data => data?.thresholds?.length ? data.thresholds : null)
    .catch(e => { console.error('[Thresholds] GET error', e); return null })
    .finally(() => inFlightFetches.delete(resourceId))

  inFlightFetches.set(resourceId, promise)
  return promise
}

const DEFAULT_ROWS = [
  { id: 'cpu',  label: 'CPU utilisation',  val: 85,  max: 100, sev: 'Warning',  action: 'Alert + watch', unit: '%',  enabled: false },
  { id: 'cpu2', label: 'CPU critical',     val: 95,  max: 100, sev: 'Critical', action: 'Alert + AWX',   unit: '%',  enabled: false },
  { id: 'disk', label: 'Disk utilisation', val: 90,  max: 100, sev: 'Critical', action: 'Alert + AWX',   unit: '%',  enabled: false },
  { id: 'mem',  label: 'Memory pressure',  val: 80,  max: 100, sev: 'Warning',  action: 'Alert + watch', unit: '%',  enabled: false },
  { id: 'net',  label: 'Network latency',  val: 200, max: 500, sev: 'Warning',  action: 'Alert only',    unit: 'ms', enabled: false },
]

export { DEFAULT_ROWS }

export function useThresholds({ resourceId, auth, defaultRows }) {
  const [thresholds, setThresholds] = useState(defaultRows ?? DEFAULT_ROWS)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState(null)
  const [loaded,     setLoaded]     = useState(false)

  const userId = getUserId(auth)

  const reload = useCallback(() => {
    if (!USE_LIVE || !resourceId) {
      setThresholds(defaultRows ?? DEFAULT_ROWS)
      setLoaded(true)
      return
    }
    if (!userId) {
      setThresholds(defaultRows ?? DEFAULT_ROWS)
      setLoaded(true)
      return
    }

    setLoaded(false)
    fetchThresholds(resourceId, auth)
      .then(rows => setThresholds(rows || defaultRows || DEFAULT_ROWS))
      .finally(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, userId])

  // Initial load + reload whenever resourceId/auth changes
  useEffect(() => { reload() }, [reload])

  // Reload whenever ANY useThresholds instance saves this same resourceId —
  // this is what makes the alert badge / other components update live
  // without needing a manual page refresh.
  useEffect(() => {
    function onSaved(e) {
      if (e.detail?.resourceId === resourceId) reload()
    }
    thresholdEvents.addEventListener('saved', onSaved)
    return () => thresholdEvents.removeEventListener('saved', onSaved)
  }, [resourceId, reload])

  async function save(currentAuth, rows) {
    const uid = getUserId(currentAuth)

    if (!USE_LIVE || !resourceId || !uid) {
      console.warn('[Thresholds] save skipped — missing prerequisite')
      return
    }

    const url     = `${API_BASE}/thresholds`
    const headers = getHeaders(currentAuth)
    const body    = JSON.stringify({ resource_id: resourceId, thresholds: rows })

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(url, { method: 'PUT', headers, body })
      if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`) }
      // Update local state immediately, then notify every other instance
      // (e.g. the badge hook on MainPortal) to refetch right away.
      setThresholds(rows)
      broadcastThresholdSave(resourceId)
    } catch (e) {
      console.error('[Thresholds] PUT exception:', e)
      setSaveError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return { thresholds, setThresholds, saving, saveError, save, loaded }
}
