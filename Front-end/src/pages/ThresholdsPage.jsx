import React, { useState } from 'react'
import { Card, CardHeader, Badge, MBtn } from '../components/ui/Primitives'
import { useThresholds, DEFAULT_ROWS } from '../api/useThresholds'

const SEV_OPTIONS = ['Warning', 'Critical']

// Map threshold id → which field on activeRes holds the live value
const LIVE_METRIC = {
  cpu:  r => r?.cpu  ?? null,
  cpu2: r => r?.cpu  ?? null,
  disk: r => r?.disk ?? null,
  mem:  r => r?.mem  ?? null,
  net:  r => r?.net  ?? null,
}

function sevBadge(s) { return s === 'Critical' ? 'crit' : 'warn' }

function liveColor(current, threshold) {
  if (current === null) return 'var(--tx-muted)'
  if (current >= threshold) return 'var(--status-crit)'
  if (current >= threshold * 0.85) return 'var(--status-warn)'
  return 'var(--status-ok)'
}

export default function ThresholdsPage({ activeRes, auth }) {
  const resourceId = activeRes?.id || '__global__'
  const [saved, setSaved] = useState(false)

  // Editing existing thresholds (value, severity, enabled) is open to every
  // role — viewer, admin, and superadmin — since these are personal
  // monitoring preferences for a resource someone is watching, not a
  // system-wide configuration change. The role check that used to gate
  // this was also stale: it checked role === 'admin' specifically, which
  // meant after introducing the superadmin tier, superadmin itself got
  // locked OUT of editing while admin could still edit — exactly backwards.
  //
  // If "add a new threshold metric to monitor" becomes a real feature
  // later, THAT action should be gated to admin/superadmin only — track
  // that here: const canAddThreshold = auth?.user?.role === 'admin' || auth?.user?.role === 'superadmin'

  const { thresholds, setThresholds, saving, saveError, save } = useThresholds({
    resourceId,
    auth,
    defaultRows: DEFAULT_ROWS,
  })

  function update(id, field, value) {
    setSaved(false)
    setThresholds(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    await save(auth, thresholds)
    setSaved(true)
  }

  const enabledCount = thresholds.filter(r => r.enabled).length
  const breachCount  = thresholds.filter(r => {
    if (!r.enabled) return false
    const live = LIVE_METRIC[r.id]?.(activeRes)
    return live !== null && live >= r.val
  }).length

  return (
    <div className="fade-up">
      <Card>
        <CardHeader>
          <span className="m-card-title">
            Alert Thresholds — {activeRes?.name || 'Global'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {enabledCount > 0 && <Badge v="accent">{enabledCount} active</Badge>}
            {breachCount  > 0 && <Badge v="crit">⚡ {breachCount} breached</Badge>}
            <Badge v="info">Live metrics</Badge>
            {saveError && <span style={{ fontSize: 11, color: 'var(--status-crit)' }}>✕ {saveError}</span>}
            {saved && !saveError && <span style={{ fontSize: 11, color: 'var(--status-ok)' }}>✓ Saved</span>}
            <MBtn sm action onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save config'}
            </MBtn>
          </div>
        </CardHeader>

        <div className="m-card-body">
          {/* header — 7 cols: checkbox + label + slider + threshold + current + severity + action */}
          <div className="thresh-grid thresh-head"
            style={{ gridTemplateColumns: '28px 150px 1fr 68px 72px 90px 100px' }}>
            <span />
            <span>Metric</span>
            <span>Threshold</span>
            <span>Limit</span>
            <span>Current</span>
            <span>Severity</span>
            <span>Action</span>
          </div>

          {thresholds.map(r => {
            const getLive = LIVE_METRIC[r.id]
            const live    = getLive ? getLive(activeRes) : null
            const breaching = live !== null && r.enabled && live >= r.val

            return (
              <div key={r.id} className="thresh-grid"
                style={{
                  gridTemplateColumns: '28px 150px 1fr 68px 72px 90px 100px',
                  opacity: r.enabled ? 1 : 0.45,
                  transition: 'opacity 0.15s',
                  background: breaching ? 'var(--status-crit-bg, rgba(210,25,25,0.04))' : 'transparent',
                  borderRadius: breaching ? 4 : 0,
                }}>

                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={e => update(r.id, 'enabled', e.target.checked)}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }}
                />

                <span style={{ color: 'var(--tx-primary)', fontWeight: breaching ? 600 : 400 }}>
                  {r.label}
                  {breaching && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--status-crit)' }}>⚡</span>}
                </span>

                <input
                  type="range"
                  min={0}
                  max={r.max}
                  step={1}
                  value={r.val}
                  disabled={!r.enabled}
                  onChange={e => update(r.id, 'val', Number(e.target.value))}
                  style={{ width: '100%', cursor: r.enabled ? 'pointer' : 'default' }}
                />

                <span style={{ fontFamily: "'Roboto Mono',monospace", fontWeight: 600, fontSize: 12 }}>
                  {r.val}{r.unit}
                </span>

                {/* Live current value from Morpheus */}
                <span style={{
                  fontFamily: "'Roboto Mono',monospace",
                  fontWeight: 700,
                  fontSize: 12,
                  color: live !== null ? liveColor(live, r.val) : 'var(--tx-muted)',
                }}>
                  {live !== null ? `${live}${r.unit}` : '—'}
                </span>

                {r.enabled ? (
                  <select
                    value={r.sev}
                    onChange={e => update(r.id, 'sev', e.target.value)}
                    className={`badge badge-${sevBadge(r.sev)}`}
                    style={{ border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '2px 4px', borderRadius: 4, appearance: 'auto' }}
                  >
                    {SEV_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Badge v={sevBadge(r.sev)}>{r.sev}</Badge>
                )}

                <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{r.action}</span>
              </div>
            )
          })}

          {activeRes && (
            <div style={{ marginTop: 12, padding: '8px 4px', fontSize: 11, color: 'var(--tx-muted)', borderTop: '1px solid var(--divider)' }}>
              Live values from Morpheus · {activeRes.name} · Last sync: {activeRes.lastSync || '—'}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
