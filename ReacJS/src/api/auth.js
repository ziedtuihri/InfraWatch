const AUTH_BASE = import.meta.env.VITE_AUTH_BASE || '/api/v1'
const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'
const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''

function asErrorMessage(e) {
  return e?.message || String(e)
}

export async function login({ username, password }) {
  if (!USE_LIVE) {
    if (!username || !password) {
      throw new Error('Please enter username and password.')
    }
    return {
      token: `mock.${btoa(`${username}:${Date.now()}`).replace(/=+$/, '')}`,
      user: { username, role: 'Admin' },
    }
  }

  try {
    const res = await fetch(`${IP_BASE}:8000/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const msg = res.status === 401 ? 'Incorrect Password or Username' : 'Server error'
      throw new Error(msg)
    }

    const data = await res.json()

    // ✅ Check what your API actually returns
    console.log('API response:', data)

    const token = data?.access_token || data?.token
    if (!token) throw new Error('Login response missing token.')

    // ✅ Decode role from JWT payload (no library needed)
    let role = data?.user?.role || null
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      role = payload?.role || payload?.user?.role || role
    } catch {
      // JWT decode failed, fall back to role from response body
    }

    return {
      token,
      user: {
        ...(data.user || { username }),
        role,
      },
    }
    console.log('Token response:', token)
  } catch (e) {
    throw new Error(asErrorMessage(e))
  }
}