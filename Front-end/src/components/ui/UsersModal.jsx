import React, { useEffect, useState } from 'react'

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

export default function UsersModal({ auth, onClose }) {
  const token       = auth?.token
  const currentRole = auth?.user?.role
  const userId      = auth?.user?.id
  const isAdmin     = currentRole?.toLowerCase() === 'admin'

  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [newUser,  setNewUser]  = useState({ username: '', password: '', role: 'viewer' })
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState(null)

  // ── fetch users ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: {
            Accept: 'application/json',
            'X-User-Id':   String(userId),
            'X-User-Role': currentRole,
          },
        })
        if (!res.ok) throw new Error(`Failed to load users (${res.status})`)
        setUsers(await res.json())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  // ── delete user ──────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': String(userId), 'X-User-Role': currentRole },
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  // ── add user ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setAddError(null)
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setAddError('Username and password are required.')
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id':   String(userId),
          'X-User-Role': currentRole,
        },
        body: JSON.stringify({
          username: newUser.username.trim(),
          password: newUser.password.trim(),
          role:     newUser.role,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Add failed (${res.status})`)
      }
      const created = await res.json()
      setUsers(prev => [...prev, created])
      setNewUser({ username: '', password: '', role: 'viewer' })
    } catch (e) {
      setAddError(e.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <span>👤 Users</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading && <p className="modal-info">Loading…</p>}
          {error   && <p className="modal-error">{error}</p>}

          {!loading && !error && (
            <table className="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Created</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role || '—'}</span></td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    {isAdmin && (
                      <td>
                        {u.id !== userId && (
                          <button className="btn-delete" onClick={() => handleDelete(u.id)}>
                            🗑 Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add user — admin only */}
          {isAdmin && (
            <div className="add-user-form">
              <p className="add-user-title">Add Viewer</p>
              <p style={{ fontSize: 11, color: 'var(--tx-muted)', marginBottom: 10, marginTop: -6 }}>
                New users are assigned the <strong>viewer</strong> role by default. Morpheus connection must be configured before viewers can access live data.
              </p>
              {addError && (
                <div style={{ fontSize: 12, color: 'var(--status-crit)', marginBottom: 8, padding: '6px 10px', background: 'rgba(210,25,25,0.07)', borderRadius: 4 }}>
                  {addError}
                </div>
              )}
              <div className="add-user-fields">
                <input
                  placeholder="Username"
                  value={newUser.username}
                  onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                  autoComplete="off"
                />
                <input
                  placeholder="Password"
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  autoComplete="new-password"
                />
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="btn-add"
                  onClick={handleAdd}
                  disabled={adding || !newUser.username.trim() || !newUser.password.trim()}
                >
                  {adding ? 'Adding…' : '+ Add'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
