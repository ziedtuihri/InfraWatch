import React, { useState, useEffect } from 'react'
import { TYPE_LABELS } from '../../data'
import { MBtn } from '../ui/Primitives'
import { LoadingRow, ErrorBanner } from '../ui/LoadingSpinner'
import { useResources } from '../../api/useResources'

const TYPE_ORDER = ['vcenter', 'aws', 'azure', 'physical', 'private', 'network']

export default function StepResources({ selResources = [], act }) {

  const [search, setSearch] = useState('')
  const {   resources = [], loading, error } = useResources()

  /* ✅ Keep store synced */
  useEffect(() => {
    if (resources.length) {
      act('SET_RESOURCES_DATA', { resources })
    }
  }, [resources, act])

  /* ✅ FILTER */
  const filtered = resources.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cloud?.toLowerCase().includes(search.toLowerCase())
  )

  /* ✅ GROUP */
  const grouped = {}
  filtered.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r)
  })

  /* ✅ HELPERS */
  const valColor = v =>
    v > 80 ? 'var(--status-crit)' :
    v > 65 ? 'var(--status-warn)' :
             'var(--status-ok)'

  const statusColor = s =>
    s === 'ok'   ? 'var(--status-ok)' :
    s === 'warn' ? 'var(--status-warn)' :
                   'var(--status-crit)'

  return (
    <div>

      {/* HEADER TEXT */}
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 14 }}>
        Select the Morpheus-managed resources you want to monitor.
      </p>

      {/* ERROR */}
      {error && (
        <ErrorBanner error={`Could not reach Morpheus: ${error}`} />
      )}

      {/* ACTION BAR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <MBtn
          sm
          onClick={() =>
            act('SET_ALL_RESOURCES', { ids: resources.map(r => r.id) })
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
          ))
      )}

    </div>
  )
}
