import { useState, useEffect } from 'react'
import { fetchVMMetrics } from './vmMetrics'

export function useVMMetrics(intervalMs = 10000) {
  const [vms, setVms]         = useState([])
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    let timer

    async function load() {
      try {
        const data = await fetchVMMetrics({ signal: ctrl.signal })
        setVms(Array.isArray(data) ? data : [])
        setError(null)
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message)
      } finally {
        setLoading(false)
        if (!ctrl.signal.aborted) timer = setTimeout(load, intervalMs)
      }
    }

    load()
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [intervalMs])

  return { vms, error, loading }
}