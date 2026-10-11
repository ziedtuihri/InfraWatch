import React from 'react'
import { useVMMetrics } from '../../api/useVMMetrics'

const pctColor = v =>
  v > 80 ? 'var(--status-crit)' : v > 65 ? 'var(--status-warn)' : 'var(--status-ok)'

function Bar({ label, value, suffix = '%' }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{label}</span>
        <span>{value}{suffix}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--table-head)' }}>
        <div style={{
          width: `${Math.min(value, 100)}%`, height: '100%',
          borderRadius: 3, background: pctColor(value),
        }} />
      </div>
    </div>
  )
}

export default function VMMetricsPanel() {
  const { vms, error, loading } = useVMMetrics()

  if (loading) return <div style={{ padding: 12 }}>Loading VM metrics…</div>
  if (error)   return <div style={{ padding: 12, color: 'var(--status-crit)' }}>VM metrics unavailable: {error}</div>
  if (!vms.length) return null

  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 16px',
    }}>
      {vms.map(vm => (
            <div key={type} style={{ marginBottom: 16 }}>

              {/* SECTION LABEL */}
              <div className="sec-label">
                {TYPE_LABELS[type] || type}
              </div>

              <div className="m-card" style={{ overflow: 'hidden' }}>
                <div className="resource-list">

                  {grouped[type].map(r => {

                    const selected = selResources.includes(r.id)

                    return (
                      <div
                        key={r.id}
                        className={`resource-item${selected ? ' selected' : ''}`}
                        onClick={() => act('TOGGLE_RESOURCE', { id: r.id })}
                      >

                        {/* ICON */}
                        <div className="resource-icon">
                          {r.icon || '🖥'}
                        </div>

                        {/* INFO */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: selected
                              ? 'var(--accent)'
                              : 'var(--tx-primary)'
                          }}>
                            {r.name}
                          </div>

                          <div style={{
                            fontSize: 11,
                            color: 'var(--tx-muted)',
                            marginTop: 2
                          }}>
                            {r.cloud} · {r.env}
                          </div>
                        </div>

                        {/* ✅ METRICS BLOCK */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          flexShrink: 0
                        }}>

                          {/* CPU */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: valColor(r.cpu || 0)
                            }}>
                              {r.cpu ?? 0}%
                            </div>
                            <div style={{
                              fontSize: 10,
                              color: 'var(--tx-muted)'
                            }}>
                              CPU
                            </div>

                          </div>

                          {/* MEM */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: valColor(r.mem || 0)
                            }}>
                              {r.mem ?? 0}%
                            </div>
                            <div style={{
                              fontSize: 10,
                              color: 'var(--tx-muted)'
                            }}>
                              Mem
                            </div>

                          </div>

                          {/* STATUS */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}>
                            <span style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: statusColor(r.status),
                              display: 'inline-block'
                            }} />

                            <span style={{
                              fontSize: 11,
                              color: statusColor(r.status),
                              fontWeight: 600
                            }}>
                              {r.status?.toUpperCase()}
                            </span>
                          </div>

                          {/* CHECK */}
                          <div className="resource-check">
                            {selected && '✓'}
                          </div>

                        </div>

                      </div>
                    )
                  })}

                </div>
              </div>

            </div>
      ))}
    </div>
  )
}