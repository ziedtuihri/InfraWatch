/**
 * useLogs — React hook
 * --------------------
 * Fetches Morpheus logs and re-fetches when filters change.
 * Falls back to mock data when VITE_USE_LIVE_DATA=false.
 */
import { useState, useEffect } from 'react'
import { fetchLogs, USE_LIVE } from './morpheus'
import { MOCK_LOGS } from '../data'

export function useLogs({ instanceId, level, query } = {}) {
  const [logs,    setLogs]    = useState(MOCK_LOGS)
  const [loading, setLoading] = useState(USE_LIVE)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!USE_LIVE) {
      // Client-side filter mock data
      setLogs(MOCK_LOGS.filter(l => {
        if (level && level !== 'All Levels' && l.level !== level) return false
        if (query && !l.msg.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }))
      return
    }

    setLoading(true)
    fetchLogs({ instanceId, level, query })
      .then(data => {
        setLogs(data.length ? data : MOCK_LOGS)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        console.error('[InfraWatch] fetchLogs failed:', err)
        setError(err.message)
        setLogs(MOCK_LOGS)
        setLoading(false)
      })
  }, [instanceId, level, query])

  return { logs, loading, error }
}
