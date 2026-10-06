import { useState, useEffect } from 'react'

export function useLiveMetrics(base = {}) {
  const [m, setM] = useState(base)
  useEffect(() => {
    const t = setInterval(() => {
      setM(prev => {
        const next = {}
        for (const [k, v] of Object.entries(prev))
          next[k] = Math.max(0, Math.min(100, Math.round(v + (Math.random() - 0.5) * 7)))
        return next
      })
    }, 3000)
    return () => clearInterval(t)
  }, [])
  return m
}

export function useSparkData(n = 24) {
  const [d, setD] = useState(() => Array.from({ length: n }, () => Math.round(35 + Math.random() * 55)))
  useEffect(() => {
    const t = setInterval(() => setD(p => [...p.slice(1), Math.round(35 + Math.random() * 60)]), 2500)
    return () => clearInterval(t)
  }, [])
  return d
}
