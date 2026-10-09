import React from 'react'

export function MBtn({ children, onClick, action, danger, ghost, sm, disabled, style }) {
  const cls = ['m-btn',
    action  && 'm-btn-action',
    danger  && 'm-btn-danger',
    ghost   && 'm-btn-ghost',
    sm      && 'm-btn-sm',
  ].filter(Boolean).join(' ')
  return (
    <button className={cls} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  )
}

export function Badge({ v = 'muted', children, style }) {
  return <span className={`badge badge-${v}`} style={style}>{children}</span>
}

export function SrcTag({ children }) {
  return <span className="src-tag">{children}</span>
}

export function LivePill() {
  return (
    <span className="live-pill">
      <span className="status-dot" />&nbsp;Live
    </span>
  )
}

export function StatusOk({ label = 'Ok' }) {
  return (
    <span className="status-ok-row">
      <span className="status-dot" />{label}
    </span>
  )
}

export function BarRow({ label, value, max = 100 }) {
  const pct   = Math.round((value / max) * 100)
  const color = pct > 80 ? 'var(--status-crit)' : pct > 65 ? 'var(--status-warn)' : 'var(--accent)'
  return (
    <div className="bar-row">
      <span className="bar-lbl">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width:`${pct}%`, background:color }} />
      </div>
      <span className="bar-pct">{value}{max === 100 ? '%' : ''}</span>
    </div>
  )
}

export function Ring({ pct, color = '#27ae60' }) {
  const r   = 28
  const c   = 2 * Math.PI * r
  const off = c - (pct / 100) * c
  return (
    <div className="stat-ring">
      <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="35" cy="35" r={r} fill="none" stroke="var(--divider)" strokeWidth="5" />
        <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="stat-ring-val">{pct}%</div>
    </div>
  )
}

export function Spark({ data }) {
  const max = Math.max(...data, 1)
  return (
    <div className="spark">
      {data.map((v, i) => (
        <div key={i} className="spark-bar" style={{
          height:`${Math.round((v/max)*100)}%`,
          background: v>80 ? 'var(--status-crit)' : v>65 ? 'var(--status-warn)' : 'var(--accent)',
        }}/>
      ))}
    </div>
  )
}

/** Simple card wrapper */
export function Card({ children, style }) {
  return <div className="m-card" style={style}>{children}</div>
}

/**
 * CardHeader — renders .m-card-header
 * Pass children directly; they are laid out with space-between flex.
 * Usage:
 *   <CardHeader>
 *     <span className="m-card-title">Title</span>
 *     <div>...right content...</div>
 *   </CardHeader>
 */
export function CardHeader({ children }) {
  return <div className="m-card-header">{children}</div>
}

export function SecLabel({ children }) {
  return <div className="sec-label">{children}</div>
}
