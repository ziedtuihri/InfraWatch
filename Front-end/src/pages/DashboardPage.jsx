import React from 'react'
import { DASHBOARD_OPTIONS, TOOLS } from '../data'
import {
  Card, CardHeader, BarRow, Ring, Spark, Badge,
  SrcTag, LivePill, StatusOk, MBtn
} from '../components/ui/Primitives'
import { useInstanceStats } from '../api/useInstanceStats'

// ── Constants ─────────────────────────────────────────────────────────────────
// VITE_GLOBAL_VM_ADRESS is already set in .env.local: http://10.202.52.94
const IP_BASE       = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const GRAFANA_BASE  = `${IP_BASE}:3000`
// All FastAPI calls go via the Vite proxy /api/v1 → FastAPI :8001
// Never call FastAPI directly — that causes CORS errors
const API           = '/api/v1'

function valColor(v) {
  return v > 80 ? 'var(--status-crit)' : v > 65 ? 'var(--status-warn)' : 'var(--accent)'
}

// ── Resolve a numeric gnetId or a uid string to a Grafana uid ─────────────────
async function resolveGrafanaUid(entry) {
  const str = String(entry || '').trim()
  if (!str) return null

  if (!/^\d+$/.test(str)) {
    // Already a uid — use directly
    return { uid: str, title: str }
  }
  try {
    const res = await fetch(`${API}/grafana/dashboard/${str}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.found) return { uid: data.uid, title: data.title || str }
  } catch (e) {
    console.warn('[InfraWatch] resolveGrafanaUid failed for', str, e.message)
  }
  return null
}

// ── Resolve {dsUid, nodeTarget} for a VM via the backend ──────────────────────
// Calls FastAPI's /grafana/targets, which does the exact same datasource +
// target matching server-side using Grafana admin credentials. This avoids
// the previous client-side approach, which called Grafana's proxy endpoints
// directly from the browser with `credentials: 'include'` — that silently
// fails whenever the browser has no existing Grafana session cookie (e.g.
// landing straight in the portal from a saved session instead of going
// through Setup first, where some other action apparently happened to
// establish that cookie). The backend route has no such dependency, so the
// dashboard resolves identically whether the user just logged in directly
// or just finished the setup wizard.
async function resolveVmTarget(vmIp, vmName, preferPort) {
  try {
    const params = new URLSearchParams()
    if (vmName) params.set('resource_name', vmName)
    if (vmIp)   params.set('resource_ip', vmIp)
    if (preferPort) params.set('prefer_port', String(preferPort))
    const res = await fetch(`${API}/grafana/targets?${params.toString()}`)
    if (!res.ok) return { dsUid: null, nodeTarget: null, verified: false }
    const data = await res.json()
    return { dsUid: data.dsUid || null, nodeTarget: data.nodeTarget || null, verified: !!data.verified }
  } catch (e) {
    console.warn('[InfraWatch] resolveVmTarget failed:', e.message)
    return { dsUid: null, nodeTarget: null, verified: false }
  }
}

// Fetch per-datasource job/instance info for a resource IP. Returns one
// entry per datasource that actually scrapes something, with which jobs it
// has (node_exporter / blackbox_*), the exact node target (with :9100) and
// the real nodename. Drives per-dashboard engine buttons + correct iframe
// scoping. See backend /grafana/resource-datasources.
async function fetchResourceDatasources(vmIp) {
  try {
    const params = new URLSearchParams()
    if (vmIp) params.set('resource_ip', vmIp)
    const res = await fetch(`${API}/grafana/resource-datasources?${params.toString()}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.datasources) ? data.datasources : []
  } catch (e) {
    console.warn('[InfraWatch] fetchResourceDatasources failed:', e.message)
    return []
  }
}

// ── Build the final Grafana iframe URL ────────────────────────────────────────
function buildGrafanaUrl({ uid, dsUid, nodeTarget, nodename, vmName, dashTitle }) {
  const p = new URLSearchParams({
    orgId:   '1',
    refresh: '1m',
    // kiosk mode removed so the Grafana datasource dropdown is visible.
  })

  const isBlackbox = /blackbox/i.test(dashTitle || '')

  if (dsUid) {
    p.set('var-ds_prometheus', dsUid)
    p.set('var-datasource', dsUid)
    p.set('var-DS_PROMETHEUS', dsUid)
  }

  if (isBlackbox) {
    p.set('var-job', 'blackbox_http')
    if (nodeTarget) {
      p.set('var-instance', nodeTarget)
      p.set('var-target', nodeTarget)
    }
  } else {
    // node_exporter dashboards (1860, etc.). Use the REAL nodename label
    // from the scraped target (e.g. localhost.localdomain), not the resource
    // display name — the dashboard's nodename variable must match what the
    // exporter actually reports or every panel filters to nothing.
    p.set('var-job', 'node_exporter')
    if (nodename)   p.set('var-nodename', nodename)
    if (nodeTarget) p.set('var-node', nodeTarget)   // exact instance incl :9100
  }

  return `${GRAFANA_BASE}/d/${uid}?${p.toString()}`
}

/* ══════════════════════════════════════════════════════════════════════════════
   GRAFANA VIEW
══════════════════════════════════════════════════════════════════════════════ */
function GrafanaView({ session, activeRes }) {
  const gConfig     = session?.grafanaConfig?.[activeRes?.id] || {}
  const templateIds = gConfig.mode === 'template' ? (gConfig.uids || []) : []

  const vmIp   = activeRes?.ip   || null
  const vmName = activeRes?.name || null

  // Datasource buttons are now derived per-dashboard from what each
  // datasource actually scrapes (see dsInfo + combos below), not from a
  // resource-wide engine list — so a blackbox dashboard configured only on
  // Prometheus won't show a VictoriaMetrics button.
  const [targeting,  setTargeting]   = React.useState(false)
  const [resolved,   setResolved]    = React.useState([])
  const [resolving,  setResolving]   = React.useState(false)
  const [activeKey,  setActiveKey]   = React.useState(null) // "<uid>::<engineKey>"
  const [noIpWarn,   setNoIpWarn]    = React.useState(false)

  // ── Step 1: Fetch per-datasource job/instance info for this resource ──────
  // One backend call returns every datasource that actually scrapes this IP,
  // with its jobs (node_exporter / blackbox_*), exact node target (:9100)
  // and real nodename. Retries while nothing is scraping yet so a freshly
  // provisioned target self-heals (DOWN→UP) without a manual refresh.
  const [dsInfo, setDsInfo] = React.useState([])  // array of backend entries
  React.useEffect(() => {
    let cancelled = false
    let attempt = 0
    const MAX_ATTEMPTS = 6
    const RETRY_MS = 5000
    // Track the best result we've seen so a transient empty/partial retry
    // can't wipe out good data (which caused buttons to appear then vanish).
    let bestCount = 0

    setTargeting(true)
    setNoIpWarn(false)

    async function tryResolve() {
      const list = await fetchResourceDatasources(vmIp)
      if (cancelled) return

      const withJobs = list.filter(d => (d.jobs || []).length > 0)

      // Only update state if this result is at least as informative as the
      // best we've already shown. Never replace a good list with an empty
      // or smaller one — that's what made the datasource buttons flicker
      // and disappear on a later retry.
      if (withJobs.length >= bestCount) {
        bestCount = withJobs.length
        setDsInfo(list)
      }

      const anyJobs = withJobs.length > 0
      const nodeReady = list
        .filter(d => (d.jobs || []).includes('node_exporter'))
        .every(d => !!d.nodeTarget)

      // Done as soon as we have jobs and node targets are resolved. Also
      // stop retrying once we have ANY jobs after a couple of attempts, so
      // a fully-resolved single engine doesn't keep polling and risk churn.
      if (anyJobs && nodeReady) {
        setNoIpWarn(false)
        setTargeting(false)
        return
      }

      attempt += 1
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(tryResolve, RETRY_MS)
      } else {
        setNoIpWarn(!anyJobs)
        setTargeting(false)
      }
    }

    tryResolve()
    return () => { cancelled = true }
  }, [vmIp])

  // ── Step 2: Resolve template ids → dashboard uids ────────────────────────
  React.useEffect(() => {
    let cancelled = false

    if (!templateIds.length) {
      setResolved([{ templateId: 'default', uid: 'rYdddlPWk', title: 'Node Exporter Full' }])
      return
    }
    setResolving(true)
    Promise.all(
      templateIds.map(id =>
        resolveGrafanaUid(id).then(r =>
          r
            ? { templateId: id, uid: r.uid,  title: r.title }
            : { templateId: id, uid: null,   title: `Template ${id}` }
        )
      )
    ).then(results => {
      if (!cancelled) { setResolved(results); setResolving(false) }
    })
    return () => { cancelled = true }
  }, [activeRes?.id, templateIds.join(',')])

  // ── Step 3: Set default active uid ───────────────────────────────────────
  // De-dupe dashboards by resolved uid (same dashboard may be listed by
  // both gnetId 1860 and uid rYdddlPWk).
  const uniqueDashboards = (() => {
    const seen = new Set()
    const out = []
    for (const r of resolved) {
      if (!r.uid || seen.has(r.uid)) continue
      seen.add(r.uid)
      out.push(r)
    }
    return out
  })()
  const pendingIds = resolved.filter(r => !r.uid).map(r => r.templateId)

  // Build one entry per (dashboard × engine) where that engine actually
  // resolved a datasource. If a resource has both Prometheus and
  // VictoriaMetrics, the user gets a button for each — same dashboard,
  // Build combos that are JOB-AWARE. Each dashboard is classified by title
  // (blackbox vs node), then paired ONLY with datasources that actually have
  // the matching job. This is what makes the per-dashboard datasource buttons
  // correct: a blackbox dashboard only shows engine buttons for engines whose
  // datasource has a blackbox job — so a blackbox dashboard configured only
  // on Prometheus won't get a VictoriaMetrics button just because node is on
  // Victoria. Node dashboards likewise only show engines that scrape node.
  const engineLabelOf = k => (k === 'victoria' ? 'VictoriaMetrics' : 'Prometheus')

  // Map keyed by comboKey so each (dashboard × engine) appears ONCE. The
  // backend can return more than one datasource that classifies to the same
  // engine (e.g. a real Prometheus-<ip> plus a stale Prometheus-0.0.0.0),
  // which previously produced two identical buttons and a React duplicate-key
  // warning. When that happens we keep the better one (real target > none).
  const comboMap = new Map()
  for (const dash of uniqueDashboards) {
    const isBlackboxDash = /blackbox/i.test(dash.title || '')

    for (const ds of dsInfo) {
      const jobs = ds.jobs || []
      const hasNode     = jobs.includes('node_exporter')
      const hasBlackbox = jobs.some(j => j.startsWith('blackbox'))

      // Does THIS datasource have the job THIS dashboard needs?
      if (isBlackboxDash && !hasBlackbox) continue
      if (!isBlackboxDash && !hasNode)    continue

      const nodeTarget = isBlackboxDash
        ? (ds.blackboxInstances && ds.blackboxInstances[0]) || null
        : ds.nodeTarget || null

      const comboKey = `${dash.uid}::${ds.engine}`
      const candidate = {
        comboKey,
        uid:         dash.uid,
        dashTitle:   dash.title || dash.uid,
        engineKey:   ds.engine,
        engineLabel: engineLabelOf(ds.engine),
        dsUid:       ds.dsUid,
        nodeTarget,
        nodename:    ds.nodename || null,
        isBlackbox:  isBlackboxDash,
      }

      const existing = comboMap.get(comboKey)
      if (!existing) {
        comboMap.set(comboKey, candidate)
      } else {
        // Prefer the datasource that actually has a usable target.
        const existingHasTarget  = !!existing.nodeTarget
        const candidateHasTarget = !!candidate.nodeTarget
        if (candidateHasTarget && !existingHasTarget) {
          comboMap.set(comboKey, candidate)
        }
      }
    }
  }
  const combos = Array.from(comboMap.values())

  // Default active combo = first available.
  React.useEffect(() => {
    if (combos.length && !combos.find(c => c.comboKey === activeKey)) {
      setActiveKey(combos[0].comboKey)
    }
  }, [combos.map(c => c.comboKey).join(',')])

  const activeCombo = combos.find(c => c.comboKey === activeKey) || combos[0] || null

  // ── Step 4: Build iframe src for the active combo ─────────────────────────
  const activeSrc = activeCombo
    ? buildGrafanaUrl({
        uid:        activeCombo.uid,
        dsUid:      activeCombo.dsUid,
        nodeTarget: activeCombo.nodeTarget,
        nodename:   activeCombo.nodename,
        vmName,
        dashTitle:  activeCombo.dashTitle,
      })
    : null

  if (resolving || targeting) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-muted)', fontSize: 13 }}>
        {targeting ? `Resolving metrics target for ${vmName}…` : 'Resolving Grafana dashboards…'}
      </div>
    )
  }

  return (
    <div>
      {/* Template not yet imported */}
      {pendingIds.length > 0 && (
        <div style={warnBanner}>
          ⏳ Template{pendingIds.length > 1 ? 's' : ''} <strong>{pendingIds.join(', ')}</strong> not
          yet found in Grafana. Run the <em>Add Template Grafana by ID</em> Morpheus task first.
        </div>
      )}

      {/* No node target found — dashboard won't filter to this VM */}
      {noIpWarn && uniqueDashboards.length > 0 && (
        <div style={warnBanner}>
          ⚠ Could not resolve a metrics scrape target for <strong>{vmName}</strong>.
          {vmIp === '0.0.0.0' || !vmIp
            ? ' Morpheus returned 0.0.0.0 or no IP — the dashboard will show unfiltered data.'
            : ` IP ${vmIp} not found in any metrics datasource.`}
        </div>
      )}

      {/* Dev: show exact URL for debugging */}
      {import.meta.env.DEV && activeSrc && (
        <details style={{ marginBottom: 10, fontSize: 11 }}>
          <summary style={{ color: 'var(--tx-muted)', cursor: 'pointer' }}>
            🔗 Iframe URL (dev only)
          </summary>
          <code style={{ ...codeStyle, display: 'block', marginTop: 6,
            wordBreak: 'break-all', padding: '6px 8px', borderRadius: 3 }}>
            {activeSrc}
          </code>
          <div style={{ marginTop: 6, color: 'var(--tx-muted)' }}>
            Datasources returned for {vmName} ({vmIp}):{' '}
            {dsInfo.length === 0
              ? 'none'
              : dsInfo.map(d => `${d.engine}[${(d.jobs || []).join(',')}]${d.nodeTarget ? '✓' : '✗'}`).join('  ·  ')}
          </div>
        </details>
      )}

      {/* Two-level selector — group by DASHBOARD, then offer a datasource
          toggle for the active dashboard. Avoids the redundant flat list
          where the dashboard name repeats once per engine. */}
      {(() => {
        // Group combos by dashboard uid.
        const byDash = []
        for (const c of combos) {
          let g = byDash.find(g => g.uid === c.uid)
          if (!g) { g = { uid: c.uid, title: c.dashTitle, engines: [] }; byDash.push(g) }
          g.engines.push(c)
        }
        const activeDashUid = activeCombo?.uid
        const activeGroup = byDash.find(g => g.uid === activeDashUid)

        return (
          <>
            {/* Row 1: dashboard tabs (only if more than one dashboard) */}
            {byDash.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {byDash.map(g => {
                  const isActive = g.uid === activeDashUid
                  return (
                    <button
                      key={g.uid}
                      onClick={() => {
                        // Switch dashboard, keeping the same engine if it
                        // exists here, else the first available.
                        const sameEngine = g.engines.find(c => c.engineKey === activeCombo?.engineKey)
                        setActiveKey((sameEngine || g.engines[0]).comboKey)
                      }}
                      style={{
                        fontSize: 13, padding: '6px 16px', borderRadius: 8,
                        cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--card-border)'}`,
                        background: isActive ? 'var(--accent-bg)' : 'var(--card-bg)',
                        color: isActive ? 'var(--accent)' : 'var(--tx-second)',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'all .15s',
                      }}
                    >
                      {g.title}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Row 2: datasource toggle for the active dashboard (only if it
                has more than one engine) */}
            {activeGroup && activeGroup.engines.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Datasource
                </span>
                <div style={{ display: 'inline-flex', border: '1px solid var(--card-border)', borderRadius: 7, overflow: 'hidden' }}>
                  {activeGroup.engines.map((c, idx) => {
                    const isActive = activeCombo && c.comboKey === activeCombo.comboKey
                    return (
                      <button
                        key={c.comboKey}
                        onClick={() => setActiveKey(c.comboKey)}
                        style={{
                          fontSize: 12, padding: '5px 14px',
                          cursor: 'pointer', fontFamily: 'inherit',
                          border: 'none',
                          borderLeft: idx === 0 ? 'none' : '1px solid var(--card-border)',
                          background: isActive ? 'var(--accent)' : 'var(--card-bg)',
                          color: isActive ? '#fff' : 'var(--tx-second)',
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all .15s',
                        }}
                      >
                        {c.engineLabel}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* The iframe */}
      {activeSrc && (
        <iframe
          key={activeSrc}
          src={activeSrc}
          width="100%"
          frameBorder="0"
          style={{ display: 'block', minHeight: '1200px', border: 'none' }}
          allow="fullscreen"
        />
      )}

      {!activeSrc && !resolving && pendingIds.length > 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-muted)', fontSize: 13 }}>
          Waiting for Grafana templates to be imported…
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   POWER BI VIEW
══════════════════════════════════════════════════════════════════════════════ */
function PowerBIView({ activeRes }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Badge v="info">Power BI</Badge>
        <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
          Analytics Dashboard {activeRes?.name ? `for ${activeRes.name}` : ''}
        </span>
      </div>
      <Card>
        <CardHeader><span className="m-card-title">Power BI Report</span></CardHeader>
        <div style={{ height: '850px', width: '100%' }}>
          <iframe
            title="Power BI Dashboard"
            src="https://playground.powerbi.com/sampleReportEmbed"
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
          />
        </div>
      </Card>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MORPHEUS VIEW
══════════════════════════════════════════════════════════════════════════════ */
// Executive summary cards (mimics a Power BI exec card row): per-VM cost from
// Morpheus + alert count / MTTR / MTTD from our alert_log. Fetched per resource.
function ReportCards({ activeRes, userId }) {
  const [data, setData]       = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [err, setErr]         = React.useState(null)

  React.useEffect(() => {
    if (!activeRes?.id) return
    let cancelled = false
    setLoading(true); setErr(null)
    fetch(`${API}/report/resource?resource_id=${encodeURIComponent(activeRes.id)}&resource_name=${encodeURIComponent(activeRes.name || '')}`, {
      headers: userId ? { 'x-user-id': String(userId) } : {},
    })
      .then(async r => {
        if (!r.ok) throw new Error(`Report failed (${r.status})`)
        return r.json()
      })
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setErr(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [activeRes?.id, userId])

  const fmtCost = (v, cur) => {
    if (v == null) return '—'
    const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$'
    return `${sym}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  const fmtMin = (v) => {
    if (v == null) return '—'
    if (v < 60) return `${v} min`
    const h = Math.floor(v / 60), m = Math.round(v % 60)
    return `${h}h ${m}m`
  }

  const cards = [
    { label: 'Monthly Cost', value: data ? fmtCost(data.cost?.monthly, data.cost?.currency) : '—',
      sub: data?.cost?.actual != null
        ? `${fmtCost(data.cost.actual, data.cost.currency)} billed so far`
        : (data?.cost?.hourly != null ? `${fmtCost(data.cost.hourly, data.cost.currency)}/hr` : 'cost from Morpheus'),
      color: 'var(--accent, #2dd4bf)' },
    { label: 'Alerts Triggered', value: data ? String(data.alerts?.total ?? 0) : '—',
      sub: data ? `${data.alerts?.active ?? 0} active now` : 'from alert log',
      color: 'var(--status-warn, #f59e0b)' },
    { label: 'Avg MTTR', value: data ? fmtMin(data.mttrMinutes) : '—',
      sub: 'time to acknowledge', color: 'var(--status-ok, #10b981)' },
    { label: 'Avg MTTD', value: data ? fmtMin(data.mttdMinutes) : '—',
      sub: 'time to detect', color: '#8b5cf6' },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12, marginBottom: 16,
    }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${c.color}`,
        }}>
          <div style={{ fontSize: 11, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {c.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx-first, #e5e7eb)', margin: '4px 0 2px' }}>
            {loading ? '…' : c.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
            {err ? 'unavailable' : c.sub}
          </div>
        </div>
      ))}
    </div>
  )
}

function MorpheusView({ session, activeRes }) {
  const fallback = {
    cpu:  activeRes?.cpu  || 2,
    mem:  activeRes?.mem  || 30,
    disk: activeRes?.disk || 5,
  }
  const { stats } = useInstanceStats(activeRes?.id, fallback)

  const cfg        = session.toolConfig?.[activeRes?.id] || { metrics: {} }
  const mToolNames = Object.keys(cfg.metrics || {})
    .map(id => TOOLS.metrics.find(t => t.id === id)?.name)
    .filter(Boolean)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Badge v="warn">Morpheus</Badge>
        {mToolNames.map(t => <SrcTag key={t}>{t}</SrcTag>)}
        <div style={{ marginLeft: 'auto' }}><LivePill /></div>
      </div>

      {/* Executive summary cards — per-VM cost + reliability metrics */}
      <ReportCards activeRes={activeRes} userId={session?.auth?.user?.id} />

      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flex: 1 }}>
            <span className="m-card-title">{activeRes?.name || 'Resource'}</span>
            <StatusOk />
            <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
              Type: {activeRes?.cloud || 'HPE VM'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
              Last Sync: {activeRes?.lastSync || '—'}
            </span>
          </div>
        </CardHeader>

        <div className="m-card-body">
          <div className="stat-row">
            <div className="stat-item">
              <div className="stat-num">{activeRes?.hosts || 0}</div>
              <div className="stat-lbl">Hosts</div>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <div className="stat-num">0</div>
              <div className="stat-lbl">Alarms</div>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <Ring pct={stats.cpu} color={valColor(stats.cpu)} />
              <div className="stat-lbl">Max CPU</div>
            </div>
            <div className="stat-item">
              <Ring pct={stats.mem} color={valColor(stats.mem)} />
              <div className="stat-lbl">Memory</div>
            </div>
            <div className="stat-item">
              <Ring pct={stats.disk} color={valColor(stats.disk)} />
              <div className="stat-lbl">Storage Cap.</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Real resource metrics breakdown (from Morpheus instance.stats) */}
      <MetricsBreakdown stats={stats} />
    </>
  )
}

// Small CPU/Memory/Storage breakdown with real values from Morpheus stats.
function MetricsBreakdown({ stats }) {
  const raw = stats?.raw || {}
  const gb = (bytes) => {
    if (!bytes) return null
    return (bytes / (1024 ** 3)).toFixed(1)
  }
  const memUsed = gb(raw.usedMemory), memMax = gb(raw.maxMemory)
  const dskUsed = gb(raw.usedStorage), dskMax = gb(raw.maxStorage)

  const rows = [
    { label: 'CPU Usage', pct: stats?.cpu ?? 0,
      detail: `${stats?.cpu ?? 0}%`, color: valColor(stats?.cpu ?? 0) },
    { label: 'Memory', pct: stats?.mem ?? 0,
      detail: (memUsed && memMax) ? `${memUsed} / ${memMax} GB` : `${stats?.mem ?? 0}%`,
      color: valColor(stats?.mem ?? 0) },
    { label: 'Storage', pct: stats?.disk ?? 0,
      detail: (dskUsed && dskMax) ? `${dskUsed} / ${dskMax} GB` : `${stats?.disk ?? 0}%`,
      color: valColor(stats?.disk ?? 0) },
  ]

  return (
    <Card>
      <CardHeader><span className="m-card-title">Resource Metrics</span></CardHeader>
      <div className="m-card-body">
        {rows.map(r => (
          <div key={r.label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--tx-second)' }}>{r.label}</span>
              <span style={{ color: 'var(--tx-muted)' }}>{r.detail}</span>
            </div>
            <div style={{ height: 6, background: 'var(--divider)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(r.pct, 100)}%`, height: '100%', background: r.color, transition: 'width .3s' }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT EXPORT
══════════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage({ session, activeRes, activeDash, onDashChange }) {
  const currentDashIds = session.dashboardConfig?.[activeRes?.id] || []
  const dashOpts = DASHBOARD_OPTIONS.filter(d => currentDashIds.includes(d.id))

  if (!dashOpts.length) {
    return (
      <div style={{ color: 'var(--tx-muted)', padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
        No dashboards configured for this resource
      </div>
    )
  }

  return (
    <div className="fade-up">
      {dashOpts.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {dashOpts.map(d => (
            <button
              key={d.id}
              onClick={() => onDashChange(d.id)}
              style={{
                fontSize: 12, padding: '5px 16px', borderRadius: 20,
                border: `1px solid ${activeDash === d.id ? d.color : 'var(--card-border)'}`,
                background: activeDash === d.id ? `${d.color}18` : 'var(--card-bg)',
                color: activeDash === d.id ? d.color : 'var(--tx-second)',
                fontWeight: activeDash === d.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {activeDash === 'grafana'  && <GrafanaView  session={session} activeRes={activeRes} />}
      {activeDash === 'powerbi'  && <PowerBIView  activeRes={activeRes} />}
      {activeDash === 'morpheus' && <MorpheusView session={session} activeRes={activeRes} />}
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────────
const warnBanner = {
  marginBottom: 12, padding: '8px 12px', fontSize: 12, borderRadius: 4,
  color: 'var(--status-warn)',
  border: '1px solid var(--status-warn)',
  background: 'rgba(243,156,18,0.06)',
}
const codeStyle = {
  fontFamily: 'Roboto Mono, monospace', fontSize: 11,
  background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3,
}
