import React from 'react'
import { Card, CardHeader, Badge } from '../components/ui/Primitives'
import { LoadingRow, ErrorBanner } from '../components/ui/LoadingSpinner'
import { useUsers } from '../api/useUsers'

export default function RBACPage() {
  const { users, loading, error } = useUsers()

  return (
    <div className="fade-up">
      {error && <ErrorBanner error={`Users: ${error}`} />}
      <Card>
        <CardHeader>
          <span className="m-card-title">Role-based Access Control</span>
          <Badge v="info">SSO Enabled</Badge>
        </CardHeader>
        <div style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '0 20px' }}><LoadingRow message="Loading users from Morpheus…" /></div>
          ) : (
            <table className="rbac-table">
              <thead>
                <tr><th>User</th><th>Role</th><th>Scope</th><th>Access</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: `${u.color}22`, border: `1px solid ${u.color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: u.color, flexShrink: 0,
                        }}>
                          {u.init}
                        </div>
                        <span style={{ fontWeight: 500, color: 'var(--tx-primary)' }}>{u.name}</span>
                      </div>
                    </td>
                    <td>{u.role}</td>
                    <td>{u.scope}</td>
                    <td><Badge v="accent">{u.access}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
