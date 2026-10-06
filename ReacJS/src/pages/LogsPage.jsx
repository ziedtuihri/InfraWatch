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

  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('All Levels')
  const [source, setSource] = useState('All sources')

  const { logs, loading, error } = useLogs({
    instanceId: activeRes?.id,
    level,
    query: search,
  })

  /* ✅ ✅ FIX: use toolConfig PER RESOURCE */
  const cfg = session.toolConfig?.[activeRes?.id] || { logs: {} }

  const lToolIds = Object.keys(cfg.logs || {})

  const lTools = lToolIds
    .map(id => TOOLS.logs.find(t => t.id === id)?.name)
    .filter(Boolean)

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

            {lTools.length > 0 && (
              <select
                style={{ padding: '6px 10px' }}
                value={source}
                onChange={e => setSource(e.target.value)}
              >
                <option>All sources</option>
                {lTools.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
          </div>

          {/* CONTENT */}
          {loading ? (
            <LoadingRow message="Fetching logs from Morpheus…" />
          ) : (
            <div>
              {logs.map((row, i) => (
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

              {logs.length === 0 && (
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
