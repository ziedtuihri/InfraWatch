/**
 * useInstanceStats — React hook
 * ------------------------------
 * Polls live CPU / Memory / Disk stats for a single Morpheus instance
 * every 15 seconds.  Falls back to the static values from the resource
 * object when VITE_USE_LIVE_DATA=false.
 */
import { useState, useEffect } from 'react'
import { fetchInstanceStats, poll, USE_LIVE } from './morpheus'

export function useInstanceStats(instanceId, fallback = { cpu: 0, mem: 0, disk: 0 }) {
  const [stats,   setStats]   = useState(fallback)
  const [loading, setLoading] = useState(USE_LIVE)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!USE_LIVE || !instanceId) {
      setStats(fallback)
      return
    }

    setLoading(true)
    const stop = poll(async () => {
      try {
        const data = await fetchInstanceStats(instanceId)
        setStats(data)
        setError(null)
      } catch (err) {
        console.error('[InfraWatch] fetchInstanceStats failed:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }, 15_000)

    return stop
  }, [instanceId])

  return { stats, loading, error }
}
