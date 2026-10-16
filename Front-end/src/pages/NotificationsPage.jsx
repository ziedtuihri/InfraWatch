import React, { useEffect, useRef, useState } from 'react'
import { ErrorBanner, LoadingRow } from '../components/ui/LoadingSpinner'
import { useNotifications } from '../api/useNotifications'

const severityColor = severity => {
  if (severity === 'critical') return 'var(--status-crit)'
  if (severity === 'warning') return 'var(--status-warn)'
  return 'var(--status-ok)'
}

export default function NotificationsPage({ auth }) {
  const { notifications, loading, error, markRead } = useNotifications(auth)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const didMarkInitialNotifications = useRef(false)

  useEffect(() => {
    if (loading || error || didMarkInitialNotifications.current) return
    didMarkInitialNotifications.current = true
    const unreadIds = notifications
      .filter(notification => !notification.is_read)
      .map(notification => notification.id)
    if (unreadIds.length) markRead(unreadIds)
  }, [error, loading, markRead, notifications])

  const allSelected = notifications.length > 0 &&
    notifications.every(notification => selectedIds.has(notification.id))

  function toggleAll(event) {
    setSelectedIds(event.target.checked
      ? new Set(notifications.map(notification => notification.id))
      : new Set())
  }

  function toggleSelected(id) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function markSelectedRead() {
    const succeeded = await markRead([...selectedIds])
    if (succeeded) setSelectedIds(new Set())
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 14 }}>
        Notifications refresh automatically every 10 seconds.
      </p>

      {notifications.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all
          </label>
          <button
            className="m-theme-btn"
            onClick={markSelectedRead}
            disabled={selectedIds.size === 0}
          >
            Mark selected as read
          </button>
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      {loading ? (
        <LoadingRow message="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <div className="m-card" style={{ padding: 16, fontSize: 13, color: 'var(--tx-muted)' }}>
          No notifications yet.
        </div>
      ) : (
        <div className="m-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--table-head)', textAlign: 'left' }}>
                {['', 'Severity', 'Title / message', 'Resource', 'Type', 'Time'].map(label => (
                  <th key={label} style={{ padding: '10px 12px', color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notifications.map(notification => (
                <tr key={notification.id} style={{
                  borderTop: '1px solid var(--divider)',
                  background: notification.is_read ? 'transparent' : 'var(--table-row-alt)',
                }}>
                  <td style={{ padding: '11px 12px' }}>
                    <input
                      type="checkbox"
                      aria-label={`Select notification: ${notification.title}`}
                      checked={selectedIds.has(notification.id)}
                      onChange={() => toggleSelected(notification.id)}
                    />
                  </td>
                  <td style={{
                    padding: '11px 12px',
                    color: severityColor(notification.severity),
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                  }}>
                    {notification.severity}
                  </td>
                  <td style={{ padding: '11px 12px', minWidth: 250 }}>
                    <div style={{ fontWeight: 600, color: 'var(--tx-primary)' }}>{notification.title}</div>
                    <div style={{ color: 'var(--tx-muted)', marginTop: 3 }}>{notification.message}</div>
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--tx-second)' }}>
                    {notification.resource_name || '—'}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--tx-second)', whiteSpace: 'nowrap' }}>
                    {notification.type}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--tx-second)', whiteSpace: 'nowrap' }}>
                    {notification.created_at ? new Date(notification.created_at).toLocaleString() : '—'}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
