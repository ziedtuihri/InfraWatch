/**
 * useResources — React hook
 * -------------------------
 * Fetches Morpheus resources and falls back to mock data
 * when VITE_USE_LIVE_DATA=false (default for local dev).
 */
import { useState, useEffect } from 'react'
import { fetchResources, USE_LIVE } from './morpheus'
import { MORPHEUS_RESOURCES } from '../data'

export function useResources() {
  const [resources, setResources] = useState(MORPHEUS_RESOURCES)
  const [loading,   setLoading]   = useState(USE_LIVE)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    if (!USE_LIVE) return  // use mock data — no fetch

    setLoading(true)
    setError(null)

    fetchResources()
      .then(data => {
        setResources(data.length ? data : MORPHEUS_RESOURCES)
        setLoading(false)
      })
      .catch(err => {
        console.error('[InfraWatch] fetchResources failed:', err)
        setError(err.message)
        setResources(MORPHEUS_RESOURCES)  // graceful fallback
        setLoading(false)
      })
  }, [])

  return { resources, loading, error }
}
