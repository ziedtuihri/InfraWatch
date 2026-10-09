import React from 'react'

export function LoadingSpinner({ size = 20, color = 'var(--accent)' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 1s linear infinite', display: 'block' }}
    >
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      <circle cx="12" cy="12" r="10" stroke="var(--divider)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function LoadingRow({ message = 'Loading…' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: 'var(--tx-muted)', fontSize: 13 }}>
      <LoadingSpinner />
      {message}
    </div>
  )
}

export function ErrorBanner({ error, onRetry }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', marginBottom: 14,
      background: '#fde8e8', border: '1px solid #f5c6c6', borderRadius: 3,
      fontSize: 12, color: '#c0392b',
    }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>{error}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{ background: 'none', border: '1px solid #c0392b', borderRadius: 12,
            padding: '2px 10px', color: '#c0392b', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
