const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.100.77:8000'

export async function fetchNotifications(userId = 1, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/v1/notifications`, {
    headers: {
      'x-user-id': String(userId),
      'Content-Type': 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Could not load notifications (HTTP ${response.status})`)
  }

  const data = await response.json()
  return Array.isArray(data.notifications) ? data.notifications : []
}