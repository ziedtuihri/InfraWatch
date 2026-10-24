const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.100.77:8005'

export async function fetchVMOutageAnalysis({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/v1/vms/outage-analysis`, { signal })
  if (!response.ok) {
    let detail = `VM outage analysis request failed: ${response.status}`
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch (error) {
      if (error.name !== 'SyntaxError') throw error
    }
    throw new Error(detail)
  }
  return response.json()
}
