import React, { useState, useEffect, useMemo } from 'react'
import { TYPE_LABELS } from '../../data'
import { MBtn } from '../ui/Primitives'
import { LoadingRow, ErrorBanner } from '../ui/LoadingSpinner'
import { useResources } from '../../api/useResources'
import { useVMMetrics } from '../../api/useVMMetrics'

const TYPE_ORDER = ['vcenter', 'aws', 'azure', 'physical', 'private', 'network', 'vm']

const valColor = v =>
  v > 80 ? 'var(--status-crit)' :
  v > 65 ? 'var(--status-warn)' :
           'var(--status-ok)'

const statusColor = s =>
  s === 'ok'   ? 'var(--status-ok)' :
  s === 'warn' ? 'var(--status-warn)' :
                 'var(--status-crit)'

export default function StepResources({ selResources = [], act }) {
  const [search, setSearch] = useState('')
  const { resources = [], loading, error } = useResources()
  const { vms = [], error: vmError } = useVMMetrics()

  /* Merge Morpheus resources + VMs from the metrics endpoint into one list */
  const allResources = useMemo(() => {
    const byName = Object.fromEntries(vms.map(v => [v.name, v]))
    const morpheusNames = new Set(resources.map(r => r.name))

    // Morpheus resources: overlay live metrics when the name matches
    const base = resources.map(r => {
      const m = byName[r.name]
      if (!m) return r
      return {
        ...r,
        cpu: m.cpu_percent,
        mem: m.memory_percent,
        status: m.status === 'running' ? 'ok' : 'crit',
      }
    })

    // VMs that Morpheus doesn't know about: add them as their own group
    const extra = vms
      .filter(v => !morpheusNames.has(v.name))
      .map(v => ({
        id: `vm:${v.name}`,
        name: v.name,
        type: 'vm',
        cloud: 'Virtual Machine',
        env: `${v.memory_usage_mb} / ${v.memory_limit_mb} MB`,
        cpu: v.cpu_percent,
        mem: v.memory_percent,
        status: v.status === 'running' ? 'ok' : 'crit',
      }))

    return [...base, ...extra]
  }, [resources, vms])

  /* Sync the store only when the set of resources changes,
     not on every 10s metrics poll */
  const idsKey = allResources.map(r => r.id).join('|')
  useEffect(() => {
    if (allResources.length) {
      act('SET_RESOURCES_DATA', { resources: allResources })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, act])

  /* FILTER */
  const filtered = allResources.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cloud?.toLowerCase().includes(search.toLowerCase())
  )

  /* GROUP */
  const grouped = {}
  filtered.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r)
  })

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 14 }}>
        Select the resources you want to monitor.
      </p>

      {error && <ErrorBanner error={`Could not reach Morpheus: ${error}`} />}
      {vmError && <ErrorBanner error={`VM metrics unavailable: ${vmError}`} />}

      {/* ACTION BAR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <MBtn
          sm
          onClick={() =>
            act('SET_ALL_RESOURCES', { ids: allResources.map(r => r.id) })
          }
        >
          Select All
        </MBtn>

        <MBtn sm onClick={() => act('CLEAR_RESOURCES')}>
          Clear
        </MBtn>

        <input
          style={{ padding: '5px 10px', flex: 1, maxWidth: 260 }}
          placeholder="Filter resources…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* CONTENT */}
      {loading ? (
        <LoadingRow message="Fetching resources from Morpheus…" />
      ) : (
        TYPE_ORDER
          .filter(type => grouped[type])
          .map(type => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div className="sec-label">{TYPE_LABELS[type] || (type === 'vm' ? 'Virtual Machines' : type)}</div>

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
                        <div className="resource-icon">{r.icon || '🖥'}</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 500,
                            color: selected ? 'var(--accent)' : 'var(--tx-primary)'
                          }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>
                            {r.cloud} · {r.env}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: valColor(r.cpu || 0) }}>
                              {r.cpu ?? 0}%
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>CPU</div>
                          </div>

                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: valColor(r.mem || 0) }}>
                              {r.mem ?? 0}%
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Mem</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: statusColor(r.status), display: 'inline-block'
                            }} />
                            <span style={{ fontSize: 11, color: statusColor(r.status), fontWeight: 600 }}>
                              {r.status?.toUpperCase()}
                            </span>
                          </div>

                          <div className="resource-check">{selected && '✓'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))
      )}
    </div>
  )
}