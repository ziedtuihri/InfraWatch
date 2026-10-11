import React from 'react'
import { useVMMetrics } from '../../api/useVMMetrics'
import { LoadingRow, ErrorBanner } from './LoadingSpinner'

const valColor = v =>
  v > 80 ? 'var(--status-crit)' :
  v > 65 ? 'var(--status-warn)' :
           'var(--status-ok)'

const statusColor = s =>
  s === 'ok'   ? 'var(--status-ok)' :
  s === 'warn' ? 'var(--status-warn)' :
                 'var(--status-crit)'

export default function VMMetricsPanel({ selResources = [], act }) {
  const { vms, error, loading } = useVMMetrics()

  if (loading) return <LoadingRow message="Fetching VM metrics…" />
  if (error)   return <ErrorBanner error={`VM metrics unavailable: ${error}`} />
  if (!vms.length) return null

  return (
    <div style={{ marginBottom: 16 }}>

      {/* SECTION LABEL */}
      <div className="sec-label">Virtual Machines</div>

      <div className="m-card" style={{ overflow: 'hidden' }}>
        <div className="resource-list">

          {vms.map(vm => {
            const id       = vm.name
            const selected = selResources.includes(id)
            const status   = vm.status === 'running' ? 'ok' : 'crit'
            const cpu      = vm.cpu_percent ?? 0
            const mem      = vm.memory_percent ?? 0

            return (
              <div
                key={id}
                className={`resource-item${selected ? ' selected' : ''}`}
                onClick={() => act && act('TOGGLE_RESOURCE', { id })}
              >

                {/* ICON */}
                <div className="resource-icon">🖥</div>

                {/* INFO */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: selected ? 'var(--accent)' : 'var(--tx-primary)'
                  }}>
                    {vm.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>
                    {vm.memory_usage_mb} / {vm.memory_limit_mb} MB
                  </div>
                </div>

                {/* METRICS BLOCK */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>

                  {/* CPU */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: valColor(cpu) }}>
                      {cpu}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>CPU</div>
                  </div>

                  {/* MEM */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: valColor(mem) }}>
                      {mem}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Mem</div>
                  </div>

                  {/* STATUS */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: statusColor(status), display: 'inline-block'
                    }} />
                    <span style={{ fontSize: 11, color: statusColor(status), fontWeight: 600 }}>
                      {vm.status?.toUpperCase()}
                    </span>
                  </div>

                  {/* CHECK */}
                  <div className="resource-check">{selected && '✓'}</div>

                </div>
              </div>
            )
          })}

        </div>
      </div>
    </div>
  )
}