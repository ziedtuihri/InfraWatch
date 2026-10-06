import React, { useState } from 'react'
import { MBtn } from '../ui/Primitives'

function valColor(v) {
  return v > 80
    ? 'var(--status-crit)'
    : v > 65
      ? 'var(--status-warn)'
      : 'var(--status-ok)'
}

export default function ResourceSwitcherModal({
  session,
  resources = [],
  activeResourceId,
  onSwitch,
  onClose
}) {
  const [query, setQuery] = useState('')

  /* ✅ Resolve resources from session */
  const sessionRes = resources.filter(r =>
    session.resources.includes(r.id)
  )

  /* ✅ Filter */
  const filtered = sessionRes.filter(r =>
    !query ||
    r.name?.toLowerCase().includes(query.toLowerCase()) ||
    r.ip?.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-box fade-up" style={{ width: 480 }}>

        {/* ✅ HEADER */}
        <div className="modal-head">
          <span className="modal-title">Switch Resource</span>
          <MBtn sm onClick={onClose}>Close</MBtn>
        </div>

        {/* ✅ SEARCH */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--divider)'
        }}>
          <input
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              fontSize: 13
            }}
            placeholder="Search resources…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* ✅ LIST */}
        <div
          className="resource-list"
          style={{
            maxHeight: 320,
            overflowY: 'auto'
          }}
        >

          {filtered.map(r => {
            const isActive = r.id === activeResourceId

            return (
              <div
                key={r.id}
                onClick={() => {
                  onSwitch(r.id)
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent-bg)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background .15s'
                }}
              >

                {/* ✅ STATUS DOT */}
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: valColor(r.cpu || 0),
                  flexShrink: 0
                }} />

                {/* ✅ NAME + META */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive
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

                {/* ✅ METRICS */}
                <div style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 11,
                  flexShrink: 0
                }}>
                  <span style={{ color: valColor(r.cpu) }}>
                    {r.cpu ?? 0}% CPU
                  </span>

                  <span style={{ color: valColor(r.mem) }}>
                    {r.mem ?? 0}% Mem
                  </span>
                </div>

              </div>
            )
          })}

          {/* ✅ EMPTY */}
          {filtered.length === 0 && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--tx-muted)'
            }}>
              No results found
            </div>
          )}

        </div>

      </div>
    </div>
  )
}

