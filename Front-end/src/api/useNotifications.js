import { useEffect, useState } from 'react'
import { fetchNotifications } from './notifications'

const POLL_INTERVAL_MS = 10_000

export function useNotifications() {
  const userId = 1 // Hardcoded user ID
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer

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
    }
  }, [])

  return { notifications, loading, error }
}

