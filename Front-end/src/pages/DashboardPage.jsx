import React, { useState, useEffect } from 'react'
import { DASHBOARD_OPTIONS, TOOLS } from '../data'
import {
  Card, CardHeader, BarRow, Ring, Spark, Badge,
  SrcTag, LivePill, StatusOk, MBtn
} from '../components/ui/Primitives'
import { useInstanceStats } from '../api/useInstanceStats'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity, Cpu, HardDrive, RefreshCw, Server, AlertCircle } from 'lucide-react'

// FastAPI calls go via Vite proxy /api/v1 -> FastAPI :8001 (or :8000 depending on your environment)
const API = '/api/v1'

function valColor(v) {
  return v > 80 ? 'var(--status-crit)' : v > 65 ? 'var(--status-warn)' : 'var(--accent)'
}

/* ══════════════════════════════════════════════════════════════════════════════
   NATIVE REACT DASHBOARD (REPLACES GRAFANA IFRAME)
══════════════════════════════════════════════════════════════════════════════ */
function NativeVmDashboard({ activeRes }) {
  const [vms, setVms] = useState([])
  const [selectedVmName, setSelectedVmName] = useState(activeRes?.name || 'VM1')
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Sync selection when user switches active resource tab externally
  useEffect(() => {
    if (activeRes?.name) {
      setSelectedVmName(activeRes.name)
    }
  }, [activeRes?.name])

  // Poll FastAPI endpoint every 3 seconds for live Docker metrics
  useEffect(() => {
    let isMounted = true

    const fetchMetrics = async () => {
      try {
        const response = await fetch(`${API}/vms/metrics`)
        if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to reach FastAPI metrics endpoint`)
        const data = await response.json()
        
        if (!isMounted) return

        setVms(data)
        setLoading(false)
        setError(null)

        // Append new telemetry snapshot into historical time-series buffer (max 20 points)
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        
        setHistory((prevHistory) => {
          const updated = { ...prevHistory }
          data.forEach((vm) => {
            const currentVmHistory = updated[vm.name] || []
            const newPoint = {
              time: timestamp,
              cpu: vm.cpu_percent,
              memory: vm.memory_usage_mb,
            }
            updated[vm.name] = [...currentVmHistory.slice(-19), newPoint]
          })
          return updated
        })
      } catch (err) {
        if (isMounted) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 3000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const selectedVm = vms.find((vm) => vm.name === selectedVmName) || vms[0] || {}
  const currentHistory = history[selectedVm?.name] || []

  if (loading) {
    return (
      <div style={{ color: 'var(--tx-muted)', padding: '60px 0', textAlign: 'center', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading native container metrics...</span>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>
      
      {/* Container Selector Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity color="var(--accent, #3B82F6)" size={20} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-first, #E5E7EB)' }}>
            NATIVE CONTAINER METRICS
          </span>
          <LivePill />
        </div>

        {/* Dynamic Selector for Discovered Containers */}
        {vms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>Target VM:</span>
            <select
              value={selectedVmName}
              onChange={(e) => setSelectedVmName(e.target.value)}
              style={{
                backgroundColor: 'var(--card-bg, #111827)',
                color: 'var(--tx-first, #F3F4F6)',
                border: '1px solid var(--card-border, #1F2937)',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {vms.map((vm) => (
                <option key={vm.name} value={vm.name}>
                  {vm.name} ({(vm.status || 'unknown').toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...warnBanner, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          <span>Metrics status: {error}</span>
        </div>
      )}

      {/* Main Dashboard Cards Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        
        {/* Left Stats Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* CPU Gauge Card */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx-muted)', marginBottom: 8 }}>
                <Cpu size={16} color="var(--accent, #3B82F6)" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>CPU Utilization</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: valColor(selectedVm.cpu_percent ?? 0) }}>
                {selectedVm.cpu_percent ?? 0}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 4 }}>Capped @ 0.25 Cores</div>
            </div>
          </Card>

          {/* RAM Gauge Card */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx-muted)', marginBottom: 8 }}>
                <HardDrive size={16} color="var(--status-ok, #10B981)" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Memory Footprint</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--status-ok, #10B981)' }}>
                {selectedVm.memory_usage_mb ?? 0} <span style={{ fontSize: 16, fontWeight: 400 }}>MB</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 4 }}>
                Limit: {selectedVm.memory_limit_mb ?? 64} MB ({selectedVm.memory_percent ?? 0}%)
              </div>
            </div>
          </Card>

          {/* Container Metadata Card */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx-muted)', marginBottom: 12 }}>
                <Server size={16} color="var(--status-warn, #F59E0B)" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Container Specs</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tx-muted)' }}>Name:</span>
                  <span style={{ fontWeight: 600, color: 'var(--tx-first)' }}>{selectedVm.name || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--tx-muted)' }}>State:</span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    backgroundColor: selectedVm.status === 'running' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: selectedVm.status === 'running' ? 'var(--status-ok)' : 'var(--status-crit)'
                  }}>
                    {(selectedVm.status || 'OFFLINE').toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tx-muted)' }}>Backend:</span>
                  <span style={{ color: 'var(--tx-second)' }}>FastAPI Docker SDK</span>
                </div>
              </div>
            </div>
          </Card>

        </div>

        {/* Real-time Telemetry History Chart */}
        <Card style={{ gridColumn: 'span 2' }}>
          <CardHeader>
            <span className="m-card-title">
              {selectedVm.name || 'VM'} Real-time Telemetry Stream
            </span>
          </CardHeader>
          <div style={{ padding: '16px 20px', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentHistory}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent, #3B82F6)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--accent, #3B82F6)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--status-ok, #10B981)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--status-ok, #10B981)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="var(--tx-muted, #4B5563)" fontSize={11} />
                <YAxis stroke="var(--tx-muted, #4B5563)" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card-bg, #1F2937)', borderColor: 'var(--card-border, #374151)', color: 'var(--tx-first, #F3F4F6)', fontSize: 12 }} />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke="var(--accent, #3B82F6)" fillOpacity={1} fill="url(#cpuGrad)" />
                <Area type="monotone" dataKey="memory" name="RAM (MB)" stroke="var(--status-ok, #10B981)" fillOpacity={1} fill="url(#memGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </div>
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

      <MetricsBreakdown stats={stats} />
    </>
  )
}

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
      {activeDash === 'grafana'  && <NativeVmDashboard activeRes={activeRes} />}
      {activeDash === 'powerbi'  && <PowerBIView activeRes={activeRes} />}
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