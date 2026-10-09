import React, { useEffect, useState } from 'react'
import { Card, CardHeader, Badge, MBtn } from '../components/ui/Primitives'

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

function roleColor(role) {
  if (role === 'superadmin') return '#a855f7'  // distinct purple — visually above admin's red
  return role === 'admin' ? 'var(--status-crit)' : 'var(--accent)'
}

// Mirrors the backend's _require_can_manage_target — a superadmin can act
// on anyone, a regular admin only on viewers. UI-side check so disabled
// actions don't even render rather than failing with a 403 after a click;
// the backend still enforces this independently as the real boundary.
function canManageTarget(actorRole, targetRole) {
  if (actorRole === 'superadmin') return true
  return actorRole === 'admin' && targetRole === 'viewer'
}

export default function RBACPage({ auth }) {
  const userId       = auth?.user?.id ?? (Number(auth?.token) > 0 ? Number(auth.token) : undefined)
  const currentRole  = auth?.user?.role
  const isSuperadmin = currentRole === 'superadmin'
  const isAdmin       = currentRole === 'admin' || isSuperadmin

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(userId      ? { 'X-User-Id':   String(userId)  } : {}),
    ...(currentRole ? { 'X-User-Role': currentRole     } : {}),
  }

  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [newUser,  setNewUser]  = useState({ username: '', password: '', role: 'viewer' })
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState(null)

  useEffect(() => {
    if (!userId) return
    fetch(`${API_BASE}/users`, { headers })
      .then(r => {
        if (r.status === 403) throw new Error('403')
        return r.ok ? r.json() : Promise.reject(r.status)
      })
      .then(data => { setUsers(data); setLoading(false) })
      .catch(e => {
        setError(e.message === '403' ? '403' : `Failed to load users (${e})`)
        setLoading(false)
      })
  }, [userId])

  async function handleDelete(id) {
    if (!confirm('Delete this user?')) return
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (e) { alert(e.message) }
  }

  async function handleRoleChange(id, newRole) {
    const verb = newRole === 'admin' ? 'Promote this user to admin' : 'Demote this user to viewer'
    if (!confirm(`${verb}?`)) return
    try {
      const res = await fetch(`${API_BASE}/users/${id}/role`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Role change failed (${res.status})`)
      }
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: updated.role } : u))
    } catch (e) { alert(e.message) }
  }

  async function handleAdd() {
    setAddError(null)
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setAddError('Username and password are required.')
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST', headers,
        body: JSON.stringify({ username: newUser.username.trim(), password: newUser.password.trim(), role: newUser.role }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Add failed (${res.status})`)
      }
      const created = await res.json()
      setUsers(prev => [...prev, created])
      setNewUser({ username: '', password: '', role: 'viewer' })
    } catch (e) { setAddError(e.message) }
    finally { setAdding(false) }
  }

  return (
    <div className="fade-up">
      <Card>
        <CardHeader>
          <span className="m-card-title">User Management</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge v="info">SSO Enabled</Badge>
            {isSuperadmin ? <Badge v="accent">Superadmin</Badge> : isAdmin && <Badge v="accent">Admin</Badge>}
          </div>
        </CardHeader>
        <div className="m-card-body">
          {loading && <p style={{ color: 'var(--tx-muted)', fontSize: 13 }}>Loading users…</p>}
          {error === '403' ? (
            <div style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-primary)', marginBottom: 6 }}>
                Access restricted
              </div>
              <div style={{ fontSize: 13, color: 'var(--tx-muted)', maxWidth: 320, margin: '0 auto' }}>
                You don't have permission to view or manage users. Contact your administrator to request access.
              </div>
            </div>
          ) : error ? (
            <p style={{ color: 'var(--status-crit)', fontSize: 13 }}>{error}</p>
          ) : null}

          {!loading && !error && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {['ID', 'Username', 'Role', 'Created', ...(isAdmin ? ['Actions'] : [])].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--divider)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--tx-muted)' }}>{u.id}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: `${roleColor(u.role)}22`, border: `1px solid ${roleColor(u.role)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: roleColor(u.role),
                        }}>
                          {u.username?.[0]?.toUpperCase()}
                        </div>
                        {u.username}
                        {u.id === userId && <Badge v="muted">you</Badge>}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        background: `${roleColor(u.role)}18`, color: roleColor(u.role),
                        border: `1px solid ${roleColor(u.role)}44`,
                      }}>{u.role || '—'}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx-muted)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '8px 10px' }}>
                        {u.id !== userId && (canManageTarget(currentRole, u.role)) && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <MBtn sm onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'viewer' : 'admin')}>
                              {u.role === 'admin' ? '↓ Make viewer' : '↑ Make admin'}
                            </MBtn>
                            <MBtn sm onClick={() => handleDelete(u.id)}>🗑 Delete</MBtn>
                          </div>
                        )}
                        {u.id !== userId && !canManageTarget(currentRole, u.role) && (
                          <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>🔒 Superadmin only</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {isSuperadmin && error !== '403' && (
        <Card>
          <CardHeader><span className="m-card-title">Add User</span></CardHeader>
          <div className="m-card-body">
            <p style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 14, marginTop: 0 }}>
              New users are assigned <strong>viewer</strong> role by default. Morpheus connection must be configured before viewers can access live data.
              Only a superadmin can add users directly — anyone else can self-register via the signup page and be promoted afterward.
            </p>
            {addError && (
              <div style={{ fontSize: 12, color: 'var(--status-crit)', marginBottom: 10, padding: '6px 10px', background: 'rgba(210,25,25,0.07)', borderRadius: 4 }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="m-input"
                placeholder="Username"
                value={newUser.username}
                onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                autoComplete="off"
                style={{ flex: '1 1 140px' }}
              />
              <input
                className="m-input"
                placeholder="Password"
                type="password"
                value={newUser.password}
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                autoComplete="new-password"
                style={{ flex: '1 1 140px' }}
              />
              <select
                className="m-input"
                value={newUser.role}
                onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                style={{ flex: '0 0 110px' }}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <MBtn action onClick={handleAdd} disabled={adding || !newUser.username.trim() || !newUser.password.trim()}>
                {adding ? 'Adding…' : '+ Add user'}
              </MBtn>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
