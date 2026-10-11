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
        <div key={vm.name} style={{
          minWidth: 220, padding: 12, borderRadius: 8,
          border: '1px solid var(--border, rgba(128,128,128,.25))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>{vm.name}</span>
            <span style={{
              fontSize: 11,
              color: vm.status === 'running' ? 'var(--status-ok)' : 'var(--status-crit)',
            }}>
              ● {vm.status}
            </span>
          </div>
          <Bar label="CPU" value={vm.cpu_percent} />
          <Bar label="Memory" value={vm.memory_percent} />
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
            {vm.memory_usage_mb} / {vm.memory_limit_mb} MB
          </div>
        </div>
      ))}
    </div>
  )
}