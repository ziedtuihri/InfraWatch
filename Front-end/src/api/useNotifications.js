import { useEffect, useState } from 'react'
import { fetchNotifications } from './notifications'

const POLL_INTERVAL_MS = 10_000

export function useNotifications(auth) {
  const userId = auth?.user?.id ?? (Number(auth?.token) > 0 ? Number(auth.token) : null)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer

    async function load() {
      try {
        if (!userId) throw new Error('User identity is unavailable.')
        const rows = await fetchNotifications(auth, { signal: controller.signal })
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
  }, [auth, userId])

  return { notifications, loading, error }
}
