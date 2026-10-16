import React from 'react'
import { ErrorBanner, LoadingRow } from '../components/ui/LoadingSpinner'
import { useNotifications } from '../api/useNotifications'

const severityColor = severity => {
  if (severity === 'critical') return 'var(--status-crit)'
  if (severity === 'warning') return 'var(--status-warn)'
  return 'var(--status-ok)'
}

export default function NotificationsPage({ auth }) {
  const { notifications, loading, error } = useNotifications(auth)

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 14 }}>
        Notifications refresh automatically every 10 seconds.
      </p>

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
                {['Severity', 'Title / message', 'Resource', 'Type', 'Time', 'Status'].map(label => (
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
