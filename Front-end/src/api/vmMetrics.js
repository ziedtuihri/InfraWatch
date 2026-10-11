const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.100.77:8000'

export async function fetchVMMetrics({ allContainers = false, signal } = {}) {
  const res = await fetch(
    `${API_BASE}/api/v1/vms/metrics?all_containers=${allContainers}`,
    {
      signal,
      // add your auth header here if the endpoint requires it, e.g.
      // headers: { Authorization: `Bearer ${auth.token}` },
    }
  )
  if (!res.ok) throw new Error(`VM metrics request failed: ${res.status}`)
  return res.json()
}