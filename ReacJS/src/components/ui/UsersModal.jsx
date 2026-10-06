import React, { useEffect, useState } from 'react'

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = IP_BASE ? `${IP_BASE}:8000/api/v1` : (import.meta.env.VITE_AUTH_BASE || '/api/v1')

export default function UsersModal({ token, currentRole, onClose }) {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'user' })
  const [adding, setAdding]   = useState(false)

  const isAdmin = currentRole?.toLowerCase() === 'admin'

  // ── fetch users ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
  }, [token])

  // ── delete user ───────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  // ── add user ──────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newUser.username || !newUser.password || !newUser.email) return
    setAdding(true)
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      })
      if (!res.ok) throw new Error(`Add failed (${res.status})`)
      const created = await res.json()
      setUsers(prev => [...prev, created])
      setNewUser({ username: '', email: '', password: '', role: 'user' })
    } catch (e) {
      alert(e.message)
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
                  <th>Email</th>
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
                    <td>{u.email}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role || '—'}</span></td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    {isAdmin && (
                      <td>
                        <button className="btn-delete" onClick={() => handleDelete(u.id)}>
                          🗑 Delete
                        </button>
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
              <p className="add-user-title">Add User</p>
              <div className="add-user-fields">
                <input
                  placeholder="Username"
                  value={newUser.username}
                  onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                  autoComplete="off"
                />
                <input
                  placeholder="Email"
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
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
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="btn-add" onClick={handleAdd} disabled={adding}>
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