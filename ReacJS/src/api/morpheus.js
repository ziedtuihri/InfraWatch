
/**
 * morpheus.js
 * -----------
 * All communication with the Morpheus API lives here.
 * All functions return normalised shapes expected by the UI.
 *
 * Morpheus API docs:
 * https://apidocs.morpheusdata.com/
 */

const BASE  = import.meta.env.VITE_API_BASE || '/api'
const TOKEN = import.meta.env.VITE_MORPHEUS_TOKEN || ''
const LIVE  = import.meta.env.VITE_USE_LIVE_DATA === 'true'


/* ── Core fetch wrapper ─────────────────────────────────────────────── */
async function mFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...options.headers
    }
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
    this.body = body
    this.path = path
  }
}

export const USE_LIVE = LIVE

/* ═══════════════════════════════════════════════════════════════════════
   INSTANCES
═══════════════════════════════════════════════════════════════════════=== */

export async function fetchResources() {

  const data = await mFetch('/api/instances?max=500&offset=0')
  return (data.instances || []).map(normaliseInstance)
}

export async function fetchResource(id) {
  const data = await mFetch(`/api/instances/${id}`)
  return normaliseInstance(data.instance)
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
    vmware: 'vcenter',
    amazon: 'aws',
    azure: 'azure',
    azureArm: 'azure',
    manual: 'physical',
    nutanix: 'physical',
    openstack: 'private',
    network: 'network'
  }

  const iconMap = {
    vcenter: '⚙',
    aws: '☁',
    azure: '◈',
    physical: '▣',
    private: '⊕',
    network: '⋈'
  }

  const statusMap = {
    running: 'ok',
    stopped: 'crit',
    suspended: 'warn',
    failed: 'crit',
    unknown: 'warn'
  }

  const rawType =
    inst.instanceType?.code ||
    inst.cloud?.zoneType?.code ||
    'vmware'

  const type = typeMap[rawType] || 'vcenter'

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
    mem: stats.maxMemory
      ? Math.round((stats.usedMemory / stats.maxMemory) * 100)
      : 0,
    disk: stats.maxStorage
      ? Math.round((stats.usedStorage / stats.maxStorage) * 100)
      : 0,
    status: statusMap[inst.status] || 'warn',
    lastSync: inst.lastUpdated
      ? new Date(inst.lastUpdated).toLocaleString()
      : '—',
    _raw: inst
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ALERTS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchAlerts(instanceId = null) {
  const qs = instanceId
    ? `?resourceId=${instanceId}&status=open&max=100`
    : '?status=open&max=100'

  const data = await mFetch(`/api/monitoring/alerts${qs}`)
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
    _raw: a
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   LOGS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchLogs({ instanceId, level, query, max = 100 } = {}) {
  const params = new URLSearchParams({ max })

  if (instanceId) params.set('instanceId', instanceId)
  if (level && level !== 'All Levels') params.set('level', level.toLowerCase())
  if (query) params.set('message', query)

  const data = await mFetch(`/api/logging?${params}`)
  return (data.logItems || []).map(normaliseLog)
}

function normaliseLog(l) {
  const levelMap = { error: 'ERROR', warning: 'WARN', warn: 'WARN', info: 'INFO' }
  const ts = l.ts ?? l.date

  return {
    time: ts ? new Date(ts).toLocaleTimeString('en-GB', { hour12: false }) : '—',
    level: levelMap[l.level?.toLowerCase()] || 'INFO',
    msg: l.message || '—',
    _raw: l
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchInstanceStats(instanceId) {
  const data = await mFetch(`/api/instances/${instanceId}/stats`)
  const s = data.stats || {}

  return {
    cpu: Math.round(s.cpuUsage || 0),
    mem: s.maxMemory ? Math.round((s.usedMemory / s.maxMemory) * 100) : 0,
    disk: s.maxStorage ? Math.round((s.usedStorage / s.maxStorage) * 100) : 0
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchUsers() {
  const data = await mFetch('/api/users?max=200')

  return (data.users || []).map(u => ({
    id: u.id,
    init: initials(u.displayName || u.username),
    name: u.displayName || u.username,
    role: u.roles?.[0]?.authority || 'User',
    scope: u.accountId ? `Account ${u.accountId}` : 'All',
    access: u.roles?.[0]?.name || 'Standard',
    color: '#00b796',
    _raw: u
  }))
}

/* ═══════════════════════════════════════════════════════════════════════
   CLOUDS
═══════════════════════════════════════════════════════════════════════ */

export async function fetchClouds() {
  const data = await mFetch('/api/zones?max=200')
  return data.zones || []
}

/* ═══════════════════════════════════════════════════════════════════════
   ✅ AUTOMATION — SINGLE, GENERIC EXECUTION FUNCTION
═══════════════════════════════════════════════════════════════════════ */

/**
 * Execute a Morpheus task against an instance
 * ✅ Used by the ONE generalized button
 */
export async function executeTask(taskId, instanceId, customOptions = {}) {
  return mFetch(`/api/instances/${instanceId}/task`, {
    method: 'POST',
    body: JSON.stringify({
      taskId,
      customOptions
    })
  })
}

/* ═══════════════════════════════════════════════════════════════════════
   POLLING
═══════════════════════════════════════════════════════════════════════ */

export function poll(fn, intervalMs = 15000) {
  fn()
  const id = setInterval(fn, intervalMs)
  return () => clearInterval(id)
}

/* ── Utilities ─────────────────────────────────────────────────────── */

function initials(name = '') {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??'
}

function timeSince(dateStr) {
  if (!dateStr) return '—'
  const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}