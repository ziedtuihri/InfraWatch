import { authHeaders } from './auth'

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS?.replace(/\/+$/, '')
const API_BASE = IP_BASE ? `${IP_BASE}:8001/api/v1` : '/api/v1'

export async function fetchNotifications(auth, { signal } = {}) {
  const response = await fetch(`${API_BASE}/notifications`, {
    headers: authHeaders(auth),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Could not load notifications (HTTP ${response.status})`)
  }

  const data = await response.json()
  return Array.isArray(data.notifications) ? data.notifications : []
}
