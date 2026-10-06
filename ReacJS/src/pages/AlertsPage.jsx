import React, { useState, useRef } from 'react'
import { REMEDIATION_STEPS } from '../data'
import { Badge, MBtn, Card, CardHeader } from '../components/ui/Primitives'
import { LoadingRow, ErrorBanner } from '../components/ui/LoadingSpinner'
import { useAlerts } from '../api/useAlerts'

function sevBadge(s) { return s === 'Critical' ? 'crit' : s === 'Warning' ? 'warn' : 'ok' }
function sevColor(s)  { return s === 'Critical' ? 'var(--status-crit)' : s === 'Warning' ? 'var(--status-warn)' : 'var(--status-ok)' }

export default function AlertsPage({ activeRes }) {
  const { alerts, loading, error } = useAlerts(activeRes?.id || null)
  const [acked,       setAcked]       = useState(new Set())
  const [rlogLines,   setRlogLines]   = useState([])
  const [rlogVisible, setRlogVisible] = useState(false)
  const timers = useRef([])

  function acknowledge(id) { setAcked(p => new Set([...p, id])) }

  function runRemediation() {
    setRlogVisible(true)
    setRlogLines([])
    timers.current.forEach(clearTimeout)
    timers.current = REMEDIATION_STEPS.map(({ delay, msg, type }) =>
      setTimeout(() => {
        const now = new Date()
        const ts  = [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map(n => String(n).padStart(2, '0')).join(':')
        setRlogLines(p => [...p, { ts, msg, type }])
      }, delay)
    )
  }

  const critCount = alerts.filter(a => a.sev === 'Critical' && a.status === 'active').length

  return (
    <div className="fade-up">
      {error && <ErrorBanner error={`Alerts: ${error}`} />}
      <Card>
        <CardHeader>
          <span className="m-card-title">
            Active Alerts — {activeRes?.name || 'All resources'}
          </span>
          {critCount > 0 && <Badge v="crit">{critCount} Critical</Badge>}
        </CardHeader>
        <div style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '0 20px' }}><LoadingRow message="Loading alerts from Morpheus…" /></div>
          ) : alerts.map(alert => (
            <div key={alert.id} className="alert-row">
              <div className="sev-dot" style={{ background: sevColor(alert.sev) }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {alert.name} —{' '}
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 400, fontSize: 12 }}>
                    {alert.resource}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>
                  Fired {alert.firedAgo} · {alert.source} · {alert.env}
                </div>
              </div>
              <Badge v={sevBadge(alert.sev)}>
                {acked.has(alert.id) && alert.status === 'active' ? 'Acknowledged' : alert.sev}
              </Badge>
              {alert.canFix && !acked.has(alert.id) && (
                <MBtn action sm onClick={runRemediation}>Remediate</MBtn>
              )}
              {!alert.canFix && alert.status === 'active' && !acked.has(alert.id) && (
                <MBtn sm onClick={() => acknowledge(alert.id)}>Acknowledge</MBtn>
              )}
            </div>
          ))}
        </div>
      </Card>

      {rlogVisible && (
        <Card>
          <CardHeader><span className="m-card-title">Auto-remediation log</span></CardHeader>
          <div className="m-card-body">
            <div className="rlog">
              {rlogLines.length === 0 && (
                <span style={{ color: 'var(--tx-muted)' }}>Starting remediation pipeline…</span>
              )}
              {rlogLines.map((l, i) => (
                <div key={i} className="rlog-line">
                  <span className="rlog-ts">{l.ts}</span>
                  <span className={l.type === 'ok' ? 'rlog-ok' : 'rlog-run'}>
                    {l.type === 'ok' ? '[OK] ' : '[RUN]'}
                  </span>
                  <span style={{ color: 'var(--tx-second)' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
