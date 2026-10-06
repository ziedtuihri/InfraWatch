/**
 * useAlerts — React hook
 * ----------------------
 * Polls Morpheus alerts every 30 seconds.
 * Falls back to mock data when VITE_USE_LIVE_DATA=false.
 */
import { useState, useEffect } from 'react'
import { fetchAlerts, poll, USE_LIVE } from './morpheus'
import { MOCK_ALERTS } from '../data'

export function useAlerts(instanceId = null) {
  const [alerts,  setAlerts]  = useState(MOCK_ALERTS)
  const [loading, setLoading] = useState(USE_LIVE)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!USE_LIVE) return

    setLoading(true)
    const stop = poll(async () => {
      try {
        const data = await fetchAlerts(instanceId)
        setAlerts(data.length ? data : MOCK_ALERTS)
        setError(null)
      } catch (err) {
        console.error('[InfraWatch] fetchAlerts failed:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }, 30_000)

    return stop
  }, [instanceId])

  return { alerts, loading, error }
}
