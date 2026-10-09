/**
 * morpheus.js
 * -----------
 * All communication with Morpheus goes through the FastAPI backend (port 8001),
 * which reads the Morpheus URL + token from the database per user.
 * No Morpheus credentials are needed in the frontend.
 */

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const BASE    = `${IP_BASE}:8001/api/v1`
const LIVE    = import.meta.env.VITE_USE_LIVE_DATA === 'true'

export const USE_LIVE = LIVE

/* ── Auth store (set once at login) ─────────────────────────────────── */
let _auth = null
export function setMorpheusAuth(auth) { _auth = auth }

function userHeaders() {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (_auth?.user?.id)   h['X-User-Id']   = String(_auth.user.id)
  if (_auth?.user?.role) h['X-User-Role'] = _auth.user.role
  return h
}

/* ── Core fetch wrapper ─────────────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...userHeaders(), ...options.headers },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new MorpheusError(res.status, res.statusText, text, path)
  }

  return res.json()
}

export class MorpheusError extends Error {
  constructor(status, statusText, body, path) {
    super(`Morpheus API ${status} ${statusText} — ${path}`)
    this.status = status
    this.body   = body
    this.path   = path
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   INSTANCES
═══════════════════════════════════════════════════════════════════════ */

export async function fetchResources() {
  // details=true is required to get connectionInfo/IP and other fields
  // Morpheus omits from the lightweight summary response — without it,
  // IP presence was inconsistent per-VM depending on what happened to
  // leak through in the summary payload.
  const data = await apiFetch('/AllInstances?max=500&offset=0&details=true')
  return (data.instances || []).map(normaliseInstance)
}

export async function fetchResource(id) {
  const data = await apiFetch(`/AllInstances?max=1&offset=0&details=true`)
  const inst = (data.instances || []).find(i => String(i.id) === String(id))
  return inst ? normaliseInstance(inst) : null
}

/**
 * Fetch all Morpheus Servers (distinct id-space from Instances).
 * Server-scoped tasks (Grafana config, etc.) need a real Server id —
 * an Instance id will be silently rejected by Morpheus with a 400.
 */
export async function fetchAllServers() {
  const data = await apiFetch('/AllServers?max=500&offset=0')
  return data.servers || []
}

let _serverCache = null
let _serverCacheTime = 0
const SERVER_CACHE_TTL_MS = 60_000

/**
 * Resolve the real Morpheus Server id for a given resource (Instance).
 * Matches by IP first (most reliable), falling back to exact name match.
 * Caches the server list for 60s since it rarely changes mid-session.
 * Returns null if no match is found — callers must handle this explicitly
 * rather than silently falling back to the Instance id (which Morpheus
 * will reject with "Target server(s) not found").
 */
export async function resolveServerId(resource) {
  const now = Date.now()
  if (!_serverCache || now - _serverCacheTime > SERVER_CACHE_TTL_MS) {
    _serverCache = await fetchAllServers()
    _serverCacheTime = now
  }

  if (resource.ip) {
    const byIp = _serverCache.find(s =>
      s.internalIp === resource.ip ||
      s.externalIp === resource.ip ||
      s.sshHost === resource.ip ||
      (s.interfaces || []).some(i => i.ipAddress === resource.ip)
    )
    if (byIp) return byIp.id
  }

  const byName = _serverCache.find(s => s.name === resource.name)
  if (byName) return byName.id

  return null
}

export async function fetchResourcesByType() {
  const items = await fetchResources()
  return items.reduce((acc, r) => {
    acc[r.type] ||= []
    acc[r.type].push(r)
    return acc
  }, {})
}

function normaliseInstance(inst) {
  const stats = inst.stats || {}

  const typeMap = {
    vmware: 'vcenter', amazon: 'aws', azure: 'azure',
    azureArm: 'azure', manual: 'physical', nutanix: 'physical',
    openstack: 'private', network: 'network',
  }
  const iconMap = {
    vcenter: '⚙', aws: '☁', azure: '◈',
    physical: '▣', private: '⊕', network: '⋈',
  }
  const statusMap = {
    running: 'ok', stopped: 'crit', suspended: 'warn',
    failed: 'crit', unknown: 'warn',
  }

  const rawType = inst.instanceType?.code || inst.cloud?.zoneType?.code || 'vmware'
  const type    = typeMap[rawType] || 'vcenter'

  const ip =
    inst.connectionInfo?.[0]?.ip ||
    inst.connectionInfo?.[0]?.address ||
    inst.containerDetails?.[0]?.ip ||
    inst.computeServers?.[0]?.ip ||
    inst.interfaces?.[0]?.ipAddress ||
    inst.ip || null

  // Morpheus separates Instance from the underlying compute Server; some
  // tasks (e.g. server-scoped configs) need the Server id, not the Instance id.
  const serverId =
    inst.computeServerId ||
    inst.containerDetails?.[0]?.serverId ||
    inst.servers?.[0]?.id ||
    inst.server?.id ||
    null

  return {
    id: String(inst.id),
    name: inst.name || `Instance ${inst.id}`,
    type,
    icon: iconMap[type],
    cloud: inst.cloud?.name || inst.group?.name || '—',
    env: inst.environment?.name || inst.group?.name || '—',
    hosts: inst.serverCount || 0,
    vms: inst.containerCount || 0,
    cpu: Math.round(stats.cpuUsage || 0),
    mem: stats.maxMemory  ? Math.round((stats.usedMemory  / stats.maxMemory)  * 100) : 0,
    disk: stats.maxStorage ? Math.round((stats.usedStorage / stats.maxStorage) * 100) : 0,
    status: statusMap[inst.status] || 'warn',
    lastSync: inst.lastUpdated ? new Date(inst.lastUpdated).toLocaleString() : '—',
    ip,
    serverId,
    _raw: inst,
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ALERTS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchAlerts() {
  const data = await apiFetch('/alerts?max=100&offset=0')
  return (data.alerts || []).map(normaliseAlert)
}

function normaliseAlert(a) {
  const sevMap = { critical: 'Critical', warning: 'Warning', info: 'Warning' }
  return {
    id: a.id,
    name: a.name || a.message,
    resource: a.instance?.name || a.server?.name || '—',
    env: a.instance?.cloud?.name || '—',
    sev: sevMap[a.severity] || 'Warning',
    firedAgo: timeSince(a.startDate),
    source: a.description || a.checkName,
    status: a.resolveDate ? 'resolved' : 'active',
    canFix: false,
    _raw: a,
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   LOGS — not in FastAPI routes yet, placeholder
═══════════════════════════════════════════════════════════════════════ */

export async function fetchLogs() {
  return []
}

/* ═══════════════════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchInstanceStats(instanceId) {
  if (!instanceId) return { cpu: 0, mem: 0, disk: 0, raw: null }
  try {
    // details=true makes Morpheus include the live `stats` block per instance.
    const data = await apiFetch(`/AllInstances?max=500&offset=0&details=true`)
    const inst = (data.instances || []).find(i => String(i.id) === String(instanceId))
    const stats = inst?.stats || {}

    const cpu  = Math.round(stats.cpuUsage || 0)
    const mem  = stats.maxMemory  ? Math.round((stats.usedMemory  / stats.maxMemory)  * 100) : 0
    const disk = stats.maxStorage ? Math.round((stats.usedStorage / stats.maxStorage) * 100) : 0

    return {
      cpu, mem, disk,
      // Raw byte figures for the breakdown labels (GB).
      raw: {
        usedMemory:  stats.usedMemory  || 0,
        maxMemory:   stats.maxMemory   || 0,
        usedStorage: stats.usedStorage || 0,
        maxStorage:  stats.maxStorage  || 0,
        cpuUsage:    stats.cpuUsage    || 0,
      },
    }
  } catch (err) {
    console.error('[InfraWatch] fetchInstanceStats failed:', err)
    return { cpu: 0, mem: 0, disk: 0, raw: null }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchUsers() {
  return []
}

/* ═══════════════════════════════════════════════════════════════════════
   CLOUDS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchClouds() {
  return []
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTOMATION
═══════════════════════════════════════════════════════════════════════ */

export async function executeTask(taskId, instanceId, customOptions = {}) {
  return apiFetch(`/tasks/${taskId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ job: { targetType: 'instance', instances: [instanceId], customOptions } }),
  })
}

/* ── Polling ─────────────────────────────────────────────────────────── */

export function poll(fn, intervalMs = 15000) {
  fn()
  const id = setInterval(fn, intervalMs)
  return () => clearInterval(id)
}

/* ── Utilities ───────────────────────────────────────────────────────── */

function timeSince(dateStr) {
  if (!dateStr) return '—'
  const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
