
export async function fetchVMMetrics(allContainers = false) {
  const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || 'http://192.168.100.77'
  const API_BASE = `${IP_BASE}:8000/api/v1`
  
  try {
    const url = `${API_BASE}/vms/metrics?all_containers=${allContainers}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}, Message: ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch VM metrics:', error)
    return []
  }
}

