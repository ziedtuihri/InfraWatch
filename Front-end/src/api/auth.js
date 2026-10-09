const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'
const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

function asErrorMessage(e) {
  return e?.message || String(e)
}

export async function login({ username, password }) {
  if (!USE_LIVE) {
    if (!username || !password) throw new Error('Please enter username and password.')
    // Mock: treat usernames starting with "admin" as admin role
    const role = username.toLowerCase().startsWith('admin') ? 'admin' : 'viewer'
    return {
      token: `mock.${btoa(`${username}:${Date.now()}`).replace(/=+$/, '')}`,
      user: { id: 1, username, role },
    }
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const msg = res.status === 401 ? 'Incorrect Password or Username' : 'Server error'
      throw new Error(msg)
    }

    const data = await res.json()
    const user = data?.user
    if (!user) throw new Error('Login response missing user.')

    // Use user.id as the token for simplicity (no JWT needed for header-based auth)
    return {
      token: String(user.id),
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'viewer',
      },
    }
  } catch (e) {
    throw new Error(asErrorMessage(e))
  }
}

export async function signup({ username, password, email, phone }) {
  if (!USE_LIVE) {
    if (!username || !password) throw new Error('Please enter a username and password.')
    return {
      token: `mock.${btoa(`${username}:${Date.now()}`).replace(/=+$/, '')}`,
      user: { id: 1, username, role: 'viewer', email: email || null, phone: phone || null },
    }
  }

  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, email: email || null, phone: phone || null }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.detail || (res.status === 409 ? 'That username is already taken.' : 'Could not create account.'))
    }

    const user = await res.json()
    return {
      token: String(user.id),
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'viewer',
      },
    }
  } catch (e) {
    throw new Error(asErrorMessage(e))
  }
}

/** Build headers that include user identity for backend DB lookups. */
export function authHeaders(auth) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (auth?.user?.id) h['X-User-Id'] = String(auth.user.id)
  if (auth?.user?.role) h['X-User-Role'] = auth.user.role
  return h
}
