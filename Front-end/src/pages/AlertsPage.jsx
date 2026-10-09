import React, { useState, useRef, useEffect } from 'react'
import { REMEDIATION_STEPS } from '../data'
import { Badge, MBtn, Card, CardHeader } from '../components/ui/Primitives'
import { LoadingRow, ErrorBanner } from '../components/ui/LoadingSpinner'
import { useAlerts, acknowledgeAlertDB, fetchAlertLog, getAlertHeaders } from '../api/useAlerts'
import { useThresholds, DEFAULT_ROWS } from '../api/useThresholds'
import { computeBreaches } from '../api/useBreaches'

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`
const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'

function sevBadge(s) { return s === 'Critical' ? 'crit' : s === 'Warning' ? 'warn' : 'ok' }
function sevColor(s)  { return s === 'Critical' ? 'var(--status-crit)' : s === 'Warning' ? 'var(--status-warn)' : 'var(--status-ok)' }
function formatTs(iso) { return iso ? new Date(iso).toLocaleString() : '—' }

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

function getUserId(auth) {
  if (auth?.user?.id) return auth.user.id
  const n = Number(auth?.token)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export default function AlertsPage({ activeRes, auth }) {
  const resourceId = activeRes?.id ? String(activeRes.id) : null
  const userId     = getUserId(auth)

  const { alerts, loading, error } = useAlerts(resourceId)
  const { thresholds } = useThresholds({
    resourceId: resourceId || '__global__',
    auth,
    defaultRows: DEFAULT_ROWS,
  })

  const [acked,        setAcked]        = useState(new Set())
  const [rlogLines,    setRlogLines]    = useState([])
  const [rlogVisible,  setRlogVisible]  = useState(false)
  const [auditLog,     setAuditLog]     = useState([])
  const [auditOpen,    setAuditOpen]    = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [showAcked,    setShowAcked]    = useState(false)
  const timers = useRef([])

  // Keep `acked` in sync with the DB's actual acknowledged set — polled
  // (not just fetched once) so that when the backend clears an
  // acknowledgement on re-breach (see sync_alert_log's 90s-gap logic),
  // the resurfaced alert reliably reappears here too. We REPLACE the Set
  // each time rather than merge into it, otherwise a server-side clear
  // would never be reflected client-side once an id had been added once.
  useEffect(() => {
    if (!USE_LIVE || !resourceId) return

    function refreshAcked() {
      fetch(`${API_BASE}/alerts/acknowledged-ids?resource_id=${encodeURIComponent(resourceId)}`, {
        headers: getAlertHeaders(auth),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => setAcked(new Set(data?.acknowledged_ids || [])))
        .catch(() => {})
    }

    refreshAcked()
    const interval = setInterval(refreshAcked, 5_000)
    return () => clearInterval(interval)
  }, [resourceId])

  // Enrich Morpheus alerts with threshold tag
  const morpheusEnriched = alerts.map(alert => {
    const match = matchThreshold(alert.name, thresholds)
    if (!match) return { ...alert, thresholdMatch: null }
    return {
      ...alert,
      sev: match.sev === 'Critical' || alert.sev === 'Critical' ? 'Critical' : match.sev,
      thresholdMatch: match,
    }
  })

  // Breach alerts from live metric comparison
  const breachAlertsRaw = computeBreaches(activeRes, thresholds)

  // Merge — breaches first, then Morpheus, dedup by metric
  const breachMetricIds = new Set(breachAlertsRaw.map(b => b.thresholdMatch?.id))
  const filteredMorpheus = morpheusEnriched.filter(a => {
    const match = matchThreshold(a.name, thresholds)
    return !match || !breachMetricIds.has(match?.id)
  })
  const mergedAlerts = [...breachAlertsRaw, ...filteredMorpheus]

  // Split into active vs acknowledged consistently — previously only
  // breach alerts respected `acked`, so an acknowledged Morpheus alert
  // would still show up in the main list right after acknowledging it.
  const activeAlerts = mergedAlerts.filter(a => !acked.has(a.id))
  const ackedAlerts  = mergedAlerts.filter(a =>  acked.has(a.id))
  const breachAlerts = breachAlertsRaw.filter(b => !acked.has(b.id))

  // Sync to DB on an INTERVAL (not just on dependency change). A breach that
  // keeps firing at the same severity wouldn't change any dep, so an effect
  // keyed only on deps would stop syncing — and then the backend's snooze
  // would never see the alert still firing, so it would never re-fire after
  // the snooze window. Polling the sync guarantees the re-fire triggers.
  const syncPayloadRef = React.useRef([])
  syncPayloadRef.current = mergedAlerts.map(a => ({
    id: a.id, name: a.name, sev: a.sev, rawSev: a.rawSev || a.sev,
    status: acked.has(a.id) ? 'acknowledged' : a.status,
    source: a.source, env: a.env,
    thresholdMatched: !!a.thresholdMatch,
    thresholdId:   a.thresholdMatch?.id   ?? null,
    thresholdVal:  a.thresholdMatch?.val  ?? null,
    thresholdUnit: a.thresholdMatch?.unit ?? null,
    thresholdSev:  a.thresholdMatch?.sev  ?? null,
  }))

  useEffect(() => {
    if (!USE_LIVE || !resourceId || !userId) return
    function pushSync() {
      const payload = syncPayloadRef.current
      if (!payload.length) return
      fetch(`${API_BASE}/alerts/sync`, {
        method: 'POST',
        headers: getAlertHeaders(auth),
        body: JSON.stringify({ resource_id: resourceId, alerts: payload }),
      }).catch(e => console.warn('[Alerts] sync error:', e.message))
    }
    pushSync()                              // immediate
    const interval = setInterval(pushSync, 10_000)  // then every 10s
    return () => clearInterval(interval)
  }, [resourceId, userId])


  async function acknowledge(alert) {
    setAcked(p => new Set([...p, alert.id]))
    try {
      await acknowledgeAlertDB(resourceId, alert.id, auth)
      const now = new Date().toISOString()
      const username = auth?.user?.username || `User ${getUserId(auth)}`
      // Optimistically update audit log if it's open
      setAuditLog(prev => {
        const extId = String(alert.id)
        const existing = prev.find(r => r.alert_ext_id === extId)
        if (existing) {
          return prev.map(r => r.alert_ext_id === extId
            ? { ...r, status: 'acknowledged', acknowledged_by_name: username, acknowledged_at: now }
            : r
          )
        }
        // Not in log yet — prepend it
        return [{
          id: `local-${extId}`,
          alert_ext_id: extId,
          name: alert.name,
          severity: alert.sev,
          status: 'acknowledged',
          threshold_matched: !!alert.thresholdMatch,
          threshold_id: alert.thresholdMatch?.id ?? null,
          threshold_val: alert.thresholdMatch?.val ?? null,
          threshold_unit: alert.thresholdMatch?.unit ?? null,
          threshold_severity: alert.thresholdMatch?.sev ?? null,
          fired_at: null,
          acknowledged_by_name: username,
          acknowledged_at: now,
        }, ...prev]
      })
      // Auto-open audit log so user sees the result immediately
      if (!auditOpen) setAuditOpen(true)
    } catch (e) { console.warn('[Alerts] ack error:', e.message) }
  }

  function runRemediation() {
    setRlogVisible(true); setRlogLines([])
    timers.current.forEach(clearTimeout)
    timers.current = REMEDIATION_STEPS.map(({ delay, msg, type }) =>
      setTimeout(() => {
        const now = new Date()
        const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map(n => String(n).padStart(2, '0')).join(':')
        setRlogLines(p => [...p, { ts, msg, type }])
      }, delay)
    )
  }

  async function loadAuditLog(silent = false) {
    if (!USE_LIVE || !resourceId) return
    if (!silent) setAuditLoading(true)
    try { setAuditLog(await fetchAlertLog(resourceId, auth)) }
    catch (e) { console.error('[Alerts] audit log error:', e) }
    finally { if (!silent) setAuditLoading(false) }
  }

  function toggleAudit() {
    setAuditOpen(o => !o)
  }

  // Poll continuously from mount, not only while the panel is visibly
  // open — fetching only on open meant the very first thing you saw after
  // clicking "Show history" could already be stale (e.g. an alert that
  // re-fired seconds before you opened it), since the fetch only started
  // at that moment. Loading it in the background the whole time the page
  // is mounted means the data is already current the instant you open it.
  useEffect(() => {
    loadAuditLog()
    const interval = setInterval(() => loadAuditLog(true), 5_000)
    return () => clearInterval(interval)
  }, [resourceId])

  const critCount   = activeAlerts.filter(a => a.sev === 'Critical').length
  const breachCount = breachAlerts.length

  return (
    <div className="fade-up">
      {error && <ErrorBanner error={`Alerts: ${error}`} />}

      <Card>
        <CardHeader>
          <span className="m-card-title">Active Alerts — {activeRes?.name || 'All resources'}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {critCount   > 0 && <Badge v="crit">{critCount} Critical</Badge>}
            {breachCount > 0 && <Badge v="crit">⚡ {breachCount} threshold breach{breachCount > 1 ? 'es' : ''}</Badge>}
          </div>
        </CardHeader>
        <div style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '0 20px' }}><LoadingRow message="Loading alerts from Morpheus…" /></div>
          ) : activeAlerts.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--tx-muted)' }}>
              ✓ No active alerts for this resource
            </div>
          ) : activeAlerts.map(alert => (
            <div key={alert.id} className="alert-row"
              style={{ background: alert.isBreach ? 'var(--status-crit-bg, rgba(210,25,25,0.04))' : 'transparent' }}>
              <div className="sev-dot" style={{ background: sevColor(alert.sev) }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {alert.isBreach && <span style={{ fontSize: 10, marginRight: 5, color: 'var(--status-crit)' }}>⚡</span>}
                  {alert.name} — <span style={{ fontFamily: "'Roboto Mono',monospace", fontWeight: 400, fontSize: 12 }}>{alert.resource}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Fired {alert.firedAgo} · {alert.source} · {alert.env}</span>
                  {alert.thresholdMatch && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                      background: alert.thresholdMatch.sev === 'Critical' ? 'var(--status-crit-bg,#fef2f2)' : 'var(--status-warn-bg,#fffbeb)',
                      color: alert.thresholdMatch.sev === 'Critical' ? 'var(--status-crit)' : 'var(--status-warn)',
                      border: '1px solid currentColor',
                    }}>
                      Threshold {alert.thresholdMatch.val}{alert.thresholdMatch.unit} · {alert.thresholdMatch.sev}
                    </span>
                  )}
                </div>
              </div>
              <Badge v={sevBadge(alert.sev)}>{alert.sev}</Badge>
              {alert.canFix && (
                <MBtn action sm onClick={runRemediation}>Remediate</MBtn>
              )}
              {!alert.canFix && (
                <MBtn sm onClick={() => acknowledge(alert)}>Acknowledge</MBtn>
              )}
            </div>
          ))}

          {/* Acknowledged — inline within the same card, not a separate
              window. Dimmed and collapsed by default so the active list
              stays the visual focus, but it's one place to look, not two. */}
          {ackedAlerts.length > 0 && (
            <div style={{ borderTop: '1px solid var(--divider)' }}>
              <div
                onClick={() => setShowAcked(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', cursor: 'pointer', fontSize: 12, color: 'var(--tx-muted)',
                }}
              >
                <span>{showAcked ? '▾' : '▸'} Acknowledged ({ackedAlerts.length})</span>
              </div>
              {showAcked && ackedAlerts.map(alert => (
                <div key={alert.id} className="alert-row" style={{ opacity: 0.55 }}>
                  <div className="sev-dot" style={{ background: 'var(--status-ok)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {alert.name} — <span style={{ fontFamily: "'Roboto Mono',monospace", fontWeight: 400, fontSize: 12 }}>{alert.resource}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>
                      Fired {alert.firedAgo} · {alert.source} · {alert.env}
                    </div>
                  </div>
                  <Badge v="ok">Acknowledged</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {rlogVisible && (
        <Card>
          <CardHeader><span className="m-card-title">Auto-remediation log</span></CardHeader>
          <div className="m-card-body">
            <div className="rlog">
              {rlogLines.length === 0 && <span style={{ color: 'var(--tx-muted)' }}>Starting remediation pipeline…</span>}
              {rlogLines.map((l, i) => (
                <div key={i} className="rlog-line">
                  <span className="rlog-ts">{l.ts}</span>
                  <span className={l.type === 'ok' ? 'rlog-ok' : 'rlog-run'}>{l.type === 'ok' ? '[OK] ' : '[RUN]'}</span>
                  <span style={{ color: 'var(--tx-second)' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="m-card-title">Alert Audit Log</span>
          <MBtn sm onClick={toggleAudit}>{auditOpen ? 'Hide' : 'Show history'}</MBtn>
        </CardHeader>
        {auditOpen && (
          <div className="m-card-body">
            {auditLoading ? <LoadingRow message="Loading audit log…" /> : auditLog.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No records yet for this resource.</span>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {['Alert', 'Severity', 'Status', 'Threshold', 'Fired', 'Acknowledged by', 'Ack time'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--divider)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: '6px 8px' }}><Badge v={sevBadge(row.severity)}>{row.severity}</Badge></td>
                      <td style={{ padding: '6px 8px', color: row.status === 'acknowledged' ? 'var(--status-ok)' : 'var(--tx-second)' }}>{row.status}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--tx-muted)' }}>
                        {row.threshold_matched ? `⚡ ${row.threshold_id} · ${row.threshold_val}${row.threshold_unit} · ${row.threshold_severity}` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>{formatTs(row.fired_at)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--tx-muted)' }}>{row.acknowledged_by_name || '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>{formatTs(row.acknowledged_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
