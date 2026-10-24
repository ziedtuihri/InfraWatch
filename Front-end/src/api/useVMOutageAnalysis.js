import { useEffect, useState } from 'react'
import { fetchVMOutageAnalysis } from './vmOutageAnalysis'

export function useVMOutageAnalysis(intervalMs = 10000) {
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    let timer

    async function load() {
      try {
        const result = await fetchVMOutageAnalysis({ signal: controller.signal })
        setAnalysis(result)
        setError(null)
      } catch (failure) {
        if (failure.name !== 'AbortError') setError(failure.message)
      } finally {
        setLoading(false)
        if (!controller.signal.aborted) {
          timer = window.setTimeout(load, intervalMs)
        }
      }
    }

    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [intervalMs])

  return { analysis, error, loading }
}
