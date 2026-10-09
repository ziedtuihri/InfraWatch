import React, { useState } from 'react'
import { TOOLS } from '../data'
import { Card, CardHeader, SrcTag, Badge } from '../components/ui/Primitives'
import { LoadingRow, ErrorBanner } from '../components/ui/LoadingSpinner'
import { useLogs } from '../api/useLogs'

function levelColor(l) {
  return l === 'ERROR'
    ? 'var(--status-crit)'
    : l === 'WARN'
    ? 'var(--status-warn)'
    : 'var(--status-ok)'
}

export default function LogsPage({ session, activeRes }) {

  const [search, setSearch]   = useState('')
  const [level, setLevel]     = useState('All Levels')
  const [source, setSource]   = useState('All sources')
  const [hours, setHours]     = useState(1)
  const [nonce, setNonce]     = useState(0)   // manual refresh trigger

  const resourceIp = activeRes?.ip || null
  const resourceName = activeRes?.name || null

  const { logs, sources, loading, error } = useLogs({
    resourceIp,
    resourceName,
    level,
    query: search,
    hours,
    limit: 300,
    nonce,
  })

  /* use toolConfig PER RESOURCE */
  const cfg = session.toolConfig?.[activeRes?.id] || { logs: {} }
  const lToolIds = Object.keys(cfg.logs || {})
  const lTools = lToolIds
    .map(id => TOOLS.logs.find(t => t.id === id)?.name)
    .filter(Boolean)

  // Source filter options come from the live Loki streams (job/unit labels),
  // falling back to the configured tool names.
  const sourceOptions = (sources && sources.length) ? sources : lTools

  // Apply the source filter client-side (Loki already filtered level + text).
  const visibleLogs = (source === 'All sources')
    ? logs
    : logs.filter(l => {
        const lbls = l.labels || {}
        const src = lbls.job || lbls.service_name || lbls.unit || ''
        return src === source
      })

  return (
    <div className="fade-up">

      {error && <ErrorBanner error={`Logs: ${error}`} />}

      <Card>
        <CardHeader>
          <span className="m-card-title">
            Log Stream — {activeRes?.name || 'Resource'}
          </span>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lTools.map(t => <SrcTag key={t}>{t}</SrcTag>)}
            <Badge v="ok">● Streaming</Badge>
          </div>
        </CardHeader>

        <div className="m-card-body">

          {/* FILTERS */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: 140, padding: '6px 10px' }}
              placeholder="Search logs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select
              style={{ padding: '6px 10px' }}
              value={level}
              onChange={e => setLevel(e.target.value)}
            >
              {['All Levels','ERROR','WARN','INFO'].map(o =>
                <option key={o}>{o}</option>
              )}
            </select>

            <select
              style={{ padding: '6px 10px' }}
              value={hours}
              onChange={e => setHours(Number(e.target.value))}
              title="Look-back window"
            >
              {[[1,'Last 1h'],[6,'Last 6h'],[24,'Last 24h'],[168,'Last 7d']].map(([v,l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>

            {sourceOptions.length > 0 && (
              <select
                style={{ padding: '6px 10px' }}
                value={source}
                onChange={e => setSource(e.target.value)}
              >
                <option>All sources</option>
                {sourceOptions.map(t => <option key={t}>{t}</option>)}
              </select>
            )}

            <button
              style={{ padding: '6px 12px', cursor: 'pointer' }}
              onClick={() => setNonce(n => n + 1)}
              title="Refresh logs"
            >
              ↻ Refresh
            </button>
          </div>

          {/* CONTENT */}
          {!resourceIp && !resourceName ? (
            <div style={{ color: 'var(--tx-muted)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
              No resource selected. Run setup with a Logs tool (Loki) to enable log streaming.
            </div>
          ) : loading ? (
            <LoadingRow message="Querying Loki…" />
          ) : (
            <div>
              {visibleLogs.map((row, i) => (
                <div key={i} className="log-line">
                  <span className="log-ts">{row.time}</span>
                  <span
                    className="log-lvl"
                    style={{ color: levelColor(row.level) }}
                  >
                    {row.level}
                  </span>
                  <span>{row.msg}</span>
                </div>
              ))}

              {visibleLogs.length === 0 && (
                <div style={{
                  color: 'var(--tx-muted)',
                  fontSize: 12,
                  padding: '16px 0',
                  textAlign: 'center'
                }}>
                  No log entries match the current filter
                </div>
              )}
            </div>
          )}

        </div>
      </Card>

    </div>
  )
}
