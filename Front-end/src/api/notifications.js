const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.100.77:8005'

export async function fetchNotifications(userId, { signal } = {}) {
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

export async function markNotificationsRead(userId, notificationIds) {
  const response = await fetch(`${API_BASE}/api/v1/notifications/read`, {
    method: 'POST',
    headers: {
      'x-user-id': String(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notification_ids: notificationIds }),
  })

  if (!response.ok) {
    throw new Error(`Could not mark notifications as read (HTTP ${response.status})`)
  }

  return response.json()
}