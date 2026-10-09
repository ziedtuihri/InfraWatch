import React from 'react'
import { TOOLS, DASHBOARD_OPTIONS } from '../../data'

function Pill({ label, color = 'var(--accent)' }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 10px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        display: 'inline-block',
        margin: '2px 6px 2px 0'
      }}
    >
      {label}
    </span>
  )
}

export default function StepReview({ state }) {
  const {
    selResources,
    toolConfig = {},
    dashboardConfig = {},
    grafanaConfig = {}, // ✅ IMPORTANT
    resources = []
  } = state

  const selRes = resources.filter(r =>
    selResources.includes(r.id)
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {selRes.map(resource => {

        const cfg = toolConfig[resource.id] || {
          metrics: {},
          logs: {}
        }

        const dashboards = dashboardConfig[resource.id] || []
        const gConfig = grafanaConfig?.[resource.id] || {}

        /* ✅ METRICS */
        const metricEntries = Object.entries(cfg.metrics || {})
          .map(([tid, expIds]) => {
            const tool = TOOLS.metrics.find(t => t.id === tid)

            const expLabels = (expIds || [])
              .map(eid =>
                tool?.exporters?.find(e => e.id === eid)?.name
              )
              .filter(Boolean)

            return { tid, name: tool?.name, expLabels }
          })
          .filter(x => x.name)

        /* ✅ LOGS */
        const logEntries = Object.entries(cfg.logs || {})
          .map(([tid, expIds]) => {
            const tool = TOOLS.logs.find(t => t.id === tid)

            const expLabels = (expIds || [])
              .map(eid =>
                tool?.exporters?.find(e => e.id === eid)?.name
              )
              .filter(Boolean)

            return { tid, name: tool?.name, expLabels }
          })
          .filter(x => x.name)

        /* ✅ DASHBOARDS */
        const dashObjs = dashboards
          .map(id => DASHBOARD_OPTIONS.find(d => d.id === id))
          .filter(Boolean)

        return (
          <div
            key={resource.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 14,
              background: 'var(--bg-secondary)',
            }}
          >

            {/* HEADER */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{resource.icon}</span>
                <strong>{resource.name}</strong>
              </div>

              <span className="badge badge-muted">
                {resource.cloud}
              </span>
            </div>

            {/* GRID */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                rowGap: 6,
                columnGap: 10
              }}
            >

              {/* METRICS */}
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
                Metrics
              </div>
              <div>
                {metricEntries.length
                  ? metricEntries.map(({ tid, name, expLabels }) => (
                      <div key={tid} style={{ marginBottom: 6 }}>
                        <Pill label={name} />
                        {expLabels.length > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginLeft: 6 }}>
                            ({expLabels.join(', ')})
                          </span>
                        )}
                      </div>
                    ))
                  : <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>—</span>}
              </div>

              {/* LOGS */}
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
                Logs
              </div>
              <div>
                {logEntries.length
                  ? logEntries.map(({ tid, name, expLabels }) => (
                      <div key={tid} style={{ marginBottom: 6 }}>
                        <Pill label={name} color="#2980b9" />
                        {expLabels.length > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginLeft: 6 }}>
                            ({expLabels.join(', ')})
                          </span>
                        )}
                      </div>
                    ))
                  : <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>—</span>}
              </div>

              {/* DASHBOARDS */}
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
                Dashboards
              </div>
              <div>
                {dashObjs.length
                  ? dashObjs.map(d => (
                      <Pill key={d.id} label={d.name} color={d.color} />
                    ))
                  : <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>—</span>}

                {/* ✅ ✅ GRAFANA UIDS (MULTIPLE SUPPORT) */}
                {gConfig.uids?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
                      Grafana UIDs:
                    </div>

                    {gConfig.uids.map(uid => (
                      <Pill key={uid} label={uid} />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )
      })}

    </div>
  )
}
