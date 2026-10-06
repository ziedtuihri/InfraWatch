import React, { useEffect } from 'react'
import { DASHBOARD_OPTIONS } from '../../data'

function getResourceName(id, allResources) {
  return (
    allResources.find(r => String(r.id) === String(id))?.name || id
  )
}

export default function StepDashboards({
  selectedResources = [],
  currentResourceId,
  setCurrentResourceId,
  dashboardConfig = {},
  grafanaConfig = {},
  act,
  allResources = [],
}) {

  const safeId =
    currentResourceId || selectedResources[0] || null

  const selDashboards = dashboardConfig[safeId] || []
  const gConfig = grafanaConfig[safeId] || {}

  const uidInput = gConfig.tempInput || ''
  const uidList = gConfig.uids || []

  /* ✅ AUTO DEFAULT TEMPLATE */
  useEffect(() => {
    if (!safeId) return

    const hasGrafana = selDashboards.includes('grafana')
    const hasMode = !!gConfig.mode

    if (hasGrafana && !hasMode) {
      act('SET_GRAFANA_CONFIG', {
        resourceId: safeId,
        config: { mode: 'template' }
      })
    }
  }, [selDashboards, safeId])

  return (
    <div>

      {/* RESOURCE TABS */}
      {selectedResources.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sec-label">Configure resource</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedResources.map(id => {
              const active = id === safeId

              return (
                <div
                  key={id}
                  onClick={() => setCurrentResourceId(id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    border: active
                      ? '1px solid var(--accent)'
                      : '1px solid var(--border)',
                    background: active
                      ? 'var(--accent-bg)'
                      : 'transparent',
                    color: active
                      ? 'var(--accent)'
                      : 'var(--tx-muted)',
                  }}
                >
                  {getResourceName(id, allResources)}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p style={{
        fontSize: 13,
        color: 'var(--tx-muted)',
        marginBottom: 16
      }}>
        Select one or more dashboards for this resource.
      </p>

      <div className="dash-choice-row">
        {DASHBOARD_OPTIONS.map(d => {

          const selected = selDashboards.includes(d.id)

          return (
            <div key={d.id}>

              {/* TILE */}
              <div
                className={`dash-choice${selected ? ' sel' : ''}`}
                onClick={() => act('TOGGLE_DASH', { id: d.id })}
              >
                <div className="dash-check">
                  {selected && '✓'}
                </div>

                <div className="dash-dot" style={{ background: d.color }} />

                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: selected ? d.color : 'var(--tx-primary)'
                }}>
                  {d.name}
                </div>

                <div style={{
                  fontSize: 11,
                  color: 'var(--tx-muted)'
                }}>
                  {d.sub}
                </div>
              </div>

              {/* ✅ GRAFANA PANEL */}
              {selected && d.id === 'grafana' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 4,            // ✅ FIXED spacing
                    padding: 10,             // ✅ balanced
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-secondary)'
                  }}
                >

                  {/* MODE BUTTONS */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 6 // ✅ tighter
                  }}>

                    <div
                      onClick={() =>
                        act('SET_GRAFANA_CONFIG', {
                          resourceId: safeId,
                          config: { mode: 'template' }
                        })
                      }
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        border: gConfig.mode === 'template'
                          ? '1px solid var(--accent)'
                          : '1px solid var(--border)',
                        background: gConfig.mode === 'template'
                          ? 'var(--accent-bg)'
                          : 'transparent'
                      }}
                    >
                      Template
                    </div>

                    <div
                      onClick={() =>
                        act('SET_GRAFANA_CONFIG', {
                          resourceId: safeId,
                          config: { mode: 'custom' }
                        })
                      }
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        border: gConfig.mode === 'custom'
                          ? '1px solid var(--accent)'
                          : '1px solid var(--border)',
                        background: gConfig.mode === 'custom'
                          ? 'var(--accent-bg)'
                          : 'transparent'
                      }}
                    >
                      Custom
                    </div>

                  </div>

                  {/* ✅ TEMPLATE */}
                  {gConfig.mode === 'template' && (
                    <>
                      <div style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 6
                      }}>
                        <input
                          placeholder="Enter Template UID"
                          value={uidInput}
                          onChange={(e) =>
                            act('SET_GRAFANA_CONFIG', {
                              resourceId: safeId,
                              config: { tempInput: e.target.value }
                            })
                          }
                          style={{
                            flex: 1,
                            padding: '8px 12px'
                          }}
                        />

                        <div
                          onClick={() => {
                            const trimmed = uidInput.trim()
                            if (!trimmed) return
                            if (uidList.includes(trimmed)) return

                            act('SET_GRAFANA_CONFIG', {
                              resourceId: safeId,
                              config: {
                                uids: [...uidList, trimmed],
                                tempInput: ''
                              }
                            })
                          }}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: '1px solid var(--accent)',
                            background: 'var(--accent-bg)',
                            color: 'var(--accent)',
                            fontSize: 12
                          }}
                        >
                          Add
                        </div>
                      </div>

                      {uidList.length > 0 && (
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginBottom: 4
                        }}>
                          {uidList.map(uid => (
                            <span
                              key={uid}
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                border: '1px solid var(--accent)',
                                borderRadius: 999,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              {uid}
                              <span
                                onClick={() =>
                                  act('SET_GRAFANA_CONFIG', {
                                    resourceId: safeId,
                                    config: {
                                      uids: uidList.filter(u => u !== uid)
                                    }
                                  })
                                }
                                style={{ cursor: 'pointer', opacity: 0.7 }}
                              >
                                ×
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: 11 }}>
                        <a
                          href="https://grafana.com/grafana/dashboards/"
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent)' }}
                        >
                          Browse Grafana Templates →
                        </a>
                      </div>
                    </>
                  )}

                  {/* ✅ CUSTOM (2 LINES FIXED) */}
                  {gConfig.mode === 'custom' && (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--tx-muted)',
                      padding: '4px 2px',
                      lineHeight: 1.5,
                      maxWidth: 260
                    }}>
                      You can customize your dashboards later<br />
                      from the Dashboards page.
                    </div>
                  )}

                </div>
              )}

            </div>
          )
        })}
      </div>

    </div>
  )
}
