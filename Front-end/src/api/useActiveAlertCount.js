import { useState, useEffect, useCallback } from 'react'
import { useAlerts, getAlertHeaders, alertEvents } from './useAlerts'
import { useThresholds, DEFAULT_ROWS } from './useThresholds'
import { computeBreaches } from './useBreaches'

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`
const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'

const THRESH_KEYWORDS = {
  cpu:  ['cpu', 'processor'],
  cpu2: ['cpu', 'processor'],
  disk: ['disk', 'storage', 'volume'],
  mem:  ['memory', 'mem', 'ram', 'swap'],
  net:  ['network', 'latency', 'bandwidth', 'net'],
}

function matchThreshold(alertName, thresholds) {
  const lower = alertName.toLowerCase()
  return thresholds.find(t => {
    if (!t.enabled) return false
    return (THRESH_KEYWORDS[t.id] || [t.id]).some(kw => lower.includes(kw))
  }) || null
}

/**
 * useActiveAlertCount
 * --------------------
 * Single source of truth for "how many active alerts does this resource
 * have right now" — merges live Morpheus alerts with threshold-breach
 * alerts exactly the way AlertsPage does, including excluding alerts the
 * user has acknowledged (fetched from the DB, not just local UI state),
 * so the tab badge always matches what the user sees when they open the
 * Alerts tab — acknowledging something on the page makes the badge drop
 * immediately, and it stays correct across page reloads.
 *
 * Returns { count, loading }. `count` is 0 (not null) until real data
 * loads — never shows a stale/hardcoded number.
 */
export function useActiveAlertCount(activeRes, auth) {
  const resourceId = activeRes?.id ? String(activeRes.id) : null

  const { alerts, loading } = useAlerts(resourceId)
  const { thresholds } = useThresholds({
    resourceId: resourceId || '__global__',
    auth,
    defaultRows: DEFAULT_ROWS,
  })

  const [ackedIds, setAckedIds] = useState(new Set())

  const reloadAcked = useCallback(() => {
    if (!USE_LIVE || !resourceId) { setAckedIds(new Set()); return }
    fetch(`${API_BASE}/alerts/acknowledged-ids?resource_id=${encodeURIComponent(resourceId)}`, {
      headers: getAlertHeaders(auth),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setAckedIds(new Set(data?.acknowledged_ids || [])))
      .catch(() => setAckedIds(new Set()))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  useEffect(() => { reloadAcked() }, [reloadAcked])

  // Poll, not just react to the 'acked' broadcast — that event only fires
  // when someone clicks Acknowledge, never when an alert re-fires after its
  // snooze expires server-side. Without polling, the badge count stayed
  // stale (showing an alert as still acknowledged) until something else
  // happened to remount this hook (e.g. switching resource tabs), even
  // though AlertsPage itself — which does poll — had already moved on.
  useEffect(() => {
    if (!USE_LIVE || !resourceId) return
    const interval = setInterval(reloadAcked, 10_000)
    return () => clearInterval(interval)
  }, [resourceId, reloadAcked])

  // Instant update the moment any component acknowledges an alert for
  // this resource — no waiting for the next mount/poll cycle.
  useEffect(() => {
    function onAcked(e) {
      if (e.detail?.resourceId === resourceId) reloadAcked()
    }
    alertEvents.addEventListener('acked', onAcked)
    return () => alertEvents.removeEventListener('acked', onAcked)
  }, [resourceId, reloadAcked])

  const morpheusEnriched = alerts.map(alert => {
    const match = matchThreshold(alert.name, thresholds)
    if (!match) return { ...alert, thresholdMatch: null }
    return {
      ...alert,
      sev: match.sev === 'Critical' || alert.sev === 'Critical' ? 'Critical' : match.sev,
      thresholdMatch: match,
    }
  })

  const breachAlerts = computeBreaches(activeRes, thresholds)

  const breachMetricIds = new Set(breachAlerts.map(b => b.thresholdMatch?.id))
  const filteredMorpheus = morpheusEnriched.filter(a => {
    const match = matchThreshold(a.name, thresholds)
    return !match || !breachMetricIds.has(match?.id)
  })

  const allAlerts = [...breachAlerts, ...filteredMorpheus]
  const count = allAlerts.filter(a => !ackedIds.has(String(a.id))).length

  return { count, loading }
}
