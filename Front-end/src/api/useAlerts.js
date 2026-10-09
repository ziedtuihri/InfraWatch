import { useState, useEffect } from 'react'
import { fetchAlerts, poll, USE_LIVE } from './morpheus'

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

export function getAlertHeaders(auth) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const uid = auth?.user?.id ?? (Number(auth?.token) > 0 ? Number(auth.token) : undefined)
  if (uid) h['X-User-Id'] = String(uid)
  return h
}

// Cross-component event bus — when one component acknowledges an alert
// (e.g. AlertsPage), every other component watching the same resource
// (e.g. the tab badge) re-checks acknowledged state immediately instead
// of waiting for its own next poll/mount cycle.
export const alertEvents = new EventTarget()
function broadcastAck(resourceId) {
  alertEvents.dispatchEvent(new CustomEvent('acked', { detail: { resourceId } }))
}

export async function acknowledgeAlertDB(resourceId, alertExtId, auth) {
  if (!USE_LIVE || !resourceId) return
  const res = await fetch(`${API_BASE}/alerts/acknowledge`, {
    method:  'PATCH',
    headers: getAlertHeaders(auth),
    body:    JSON.stringify({ resource_id: resourceId, alert_ext_id: String(alertExtId) }),
  })
  if (!res.ok) { console.warn('[Alerts] ack failed', res.status); return }
  broadcastAck(resourceId)
}

export async function fetchAlertLog(resourceId, auth, limit = 100, offset = 0) {
  const res = await fetch(
    `${API_BASE}/alerts/log?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}&offset=${offset}`,
    { headers: getAlertHeaders(auth) }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).alerts || []
}

export function useAlerts(instanceId = null) {
  // Morpheus-native alert polling (fetchAlerts -> /api/v1/alerts) is
  // disabled. Alerts now come exclusively from threshold breaches —
  // computed locally in AlertsPage from live metrics and synced to
  // alert_log — not from Morpheus's own alerting API. This hook is kept
  // as a stable no-op return shape so AlertsPage's merge logic (which
  // expects {alerts, loading, error}) doesn't need to change; it simply
  // never receives any Morpheus-sourced alerts to merge in.
  return { alerts: [], loading: false, error: null }
}

/*
 * Previous Morpheus-polling implementation, kept here for reference in
 * case Morpheus-native alerting is wanted again later:
 *
 * export function useAlerts(instanceId = null) {
 *   const [alerts,  setAlerts]  = useState([])
 *   const [loading, setLoading] = useState(USE_LIVE)
 *   const [error,   setError]   = useState(null)
 *
 *   useEffect(() => {
 *     if (!USE_LIVE) { setLoading(false); return }
 *     setLoading(true)
 *     const stop = poll(async () => {
 *       try {
 *         const all = await fetchAlerts()
 *         const filtered = instanceId
 *           ? all.filter(a =>
 *               String(a._raw?.instance?.id) === String(instanceId) ||
 *               String(a._raw?.server?.id)   === String(instanceId)
 *             )
 *           : all
 *         setAlerts(filtered)
 *         setError(null)
 *       } catch (err) {
 *         console.error('[InfraWatch] fetchAlerts failed:', err)
 *         setError(err.message)
 *       } finally {
 *         setLoading(false)
 *       }
 *     }, 30_000)
 *     return stop
 *   }, [instanceId])
 *
 *   return { alerts, loading, error }
 * }
 */
