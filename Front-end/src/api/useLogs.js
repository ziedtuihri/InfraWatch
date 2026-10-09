/**
 * useLogs — React hook
 * --------------------
 * Queries a resource's Loki instance (via the InfraWatch backend
 * /logs/query endpoint, which proxies Loki's query_range API) and re-fetches
 * when filters change. Falls back to mock data when not live or when the
 * resource has no IP / Loki isn't reachable yet.
 */
import { useState, useEffect } from 'react'
import { USE_LIVE } from './morpheus'
import { MOCK_LOGS } from '../data'

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const BASE    = `${IP_BASE}:8001/api/v1`

export function useLogs({ resourceIp, resourceName, level, query, hours = 1, limit = 300, nonce = 0 } = {}) {
  const [logs,    setLogs]    = useState(USE_LIVE ? [] : MOCK_LOGS)
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    // Mock mode: client-side filter the sample logs.
    if (!USE_LIVE) {
      setLogs(MOCK_LOGS.filter(l => {
        if (level && level !== 'All Levels' && l.level !== level) return false
        if (query && !l.msg.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }))
      return
    }

    // Live mode: query the central Loki. We can query even without an IP as
    // long as we have a resource name to filter by (logs are centralized).
    if (!resourceIp && !resourceName) {
      setLogs([])
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams({
      hours: String(hours),
      limit: String(limit),
    })
    if (resourceIp)   params.set('resource_ip', resourceIp)
    if (resourceName) params.set('resource_name', resourceName)
    if (query) params.set('query', query)
    if (level && level !== 'All Levels') params.set('level', level)

    fetch(`${BASE}/logs/query?${params.toString()}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail || `Loki query failed (${res.status})`)
        }
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setLogs(Array.isArray(data.logs) ? data.logs : [])
        setSources(Array.isArray(data.sources) ? data.sources : [])
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[InfraWatch] useLogs failed:', err)
        setError(err.message)
        setLogs([])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [resourceIp, resourceName, level, query, hours, limit, nonce])

  return { logs, sources, loading, error }
}
