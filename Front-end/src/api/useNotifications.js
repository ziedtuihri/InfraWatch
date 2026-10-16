import { useCallback, useEffect, useState } from 'react'
import { fetchNotifications, markNotificationsRead } from './notifications'

const POLL_INTERVAL_MS = 10_000
const NOTIFICATIONS_READ_EVENT = 'infrawatch:notifications-read'

export function useNotifications(auth) {
  const userId = auth?.user?.id
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setLoading(false)
      setError(null)
      return
    }

    setNotifications([])
    setError(null)
    const controller = new AbortController()
    let timer

    function onNotificationsRead(event) {
      if (String(event.detail.userId) !== String(userId)) return
      const readIds = new Set(event.detail.notificationIds)
      setNotifications(current => current.map(notification => (
        readIds.has(notification.id) ? { ...notification, is_read: true } : notification
      )))
    }

    window.addEventListener(NOTIFICATIONS_READ_EVENT, onNotificationsRead)

    async function load() {
      try {
        const rows = await fetchNotifications(userId, { signal: controller.signal })
        setNotifications(rows)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      } finally {
        setLoading(false)
        if (!controller.signal.aborted) {
          timer = window.setTimeout(load, POLL_INTERVAL_MS)
        }
      }
    }

    setLoading(true)
    load()

    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onNotificationsRead)
    }
  }, [userId])

  const markRead = useCallback(async notificationIds => {
    if (!userId || notificationIds.length === 0) return false

    try {
      await markNotificationsRead(userId, notificationIds)
      const readIds = new Set(notificationIds)
      setNotifications(current => current.map(notification => (
        readIds.has(notification.id) ? { ...notification, is_read: true } : notification
      )))
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT, {
        detail: { userId, notificationIds },
      }))
      setError(null)
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [userId])

  return { notifications, loading, error, markRead }
}
