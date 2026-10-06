import React from 'react'
import { DASHBOARD_OPTIONS, TOOLS } from '../data'
import {
  Card, CardHeader, BarRow, Ring, Spark, Badge,
  SrcTag, LivePill, StatusOk, MBtn
} from '../components/ui/Primitives'
import { useSparkData } from '../hooks/useLiveMetrics'
import { useInstanceStats } from '../api/useInstanceStats'

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
 
function valColor(v) {
  return v > 80 ? 'var(--status-crit)'
    : v > 65 ? 'var(--status-warn)'
    : 'var(--accent)'
}
 
/* ===================== GRAFANA VIEW ===================== */
function GrafanaView({ session, activeRes }) {
 
  const fallback = {
    cpu: activeRes?.cpu || 2,
    mem: activeRes?.mem || 30,
    disk: activeRes?.disk || 5
  }
 
  const { stats } = useInstanceStats(activeRes?.id, fallback)
  const spark = useSparkData(24)
 
  const cfg = session.toolConfig?.[activeRes?.id] || { metrics: {} }
  const mToolIds = Object.keys(cfg.metrics || {})
 
  const mToolNames = mToolIds
    .map(id => TOOLS.metrics.find(t => t.id === id)?.name)
    .filter(Boolean)
 
  return (
<>
<div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
<Badge v="warn">Grafana</Badge>
 
        {mToolNames.map(t => (
<SrcTag key={t}>{t}</SrcTag>
        ))}
 
        <div style={{ marginLeft:'auto' }}>
<LivePill />
</div>
</div>
 
      <Card>
<CardHeader>
<div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', flex:1 }}>
<span className="m-card-title">{activeRes?.name || 'Resource'}</span>
<StatusOk />
<span style={{ fontSize:12, color:'var(--tx-muted)' }}>
              Type: {activeRes?.cloud || 'HPE VM'}
</span>
<span style={{ fontSize:12, color:'var(--tx-muted)' }}>
              Last Sync: {activeRes?.lastSync || '—'}
</span>
</div>
 
          <div style={{ display:'flex', gap:6 }}>
<MBtn sm>Edit</MBtn>
<MBtn action sm>Actions ▾</MBtn>
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
 
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
<Card>
<CardHeader>
<span className="m-card-title">CPU Utilisation</span>
</CardHeader>
<div className="m-card-body">
<BarRow label={activeRes?.name || 'primary'} value={stats.cpu} />
<BarRow label="web-node-05" value={44} />
<BarRow label="dev-app-01" value={28} />
</div>
</Card>
 
        <Card>
<CardHeader>
<span className="m-card-title">Memory Pressure</span>
</CardHeader>
<div className="m-card-body">
<BarRow label={activeRes?.name || 'primary'} value={stats.mem} />
<BarRow label="svc-gateway" value={85} />
<BarRow label="auth-svc-01" value={52} />
</div>
</Card>
</div>
 
      <Card>
<CardHeader>
<span className="m-card-title">Network Throughput</span>
<span style={{ fontSize:11, color:'var(--tx-muted)' }}>
            pkts/s — last 60 mins
</span>
</CardHeader>
 
        <div className="m-card-body">
<Spark data={spark} />
</div>
</Card>
</>
  )
}
 
/* ===================== POWER BI VIEW (WORKING) ===================== */
function PowerBIView({ activeRes }) {
 
  // Public demo Power BI report (works immediately)
  const src =
    "https://playground.powerbi.com/sampleReportEmbed"
 
  return (
<>
<div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
<Badge v="info">Power BI</Badge>
<span style={{ fontSize:12, color:'var(--tx-muted)' }}>
          Analytics Dashboard {activeRes?.name ? `for ${activeRes.name}` : ''}
</span>
</div>
 
      <Card>
<CardHeader>
<span className="m-card-title">Power BI Report</span>
</CardHeader>
 
        <div style={{ height: "850px", width: "100%" }}>
<iframe
            title="Power BI Dashboard"
            src={src}
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
 
/* ===================== MORPHEUS VIEW ===================== */
function MorpheusView({ activeRes }) {
  const src = IP_BASE+":3000/d/rYdddlPWk/node-exporter-full?orgId=1&kiosk=tv";
  return (
<div>
<iframe
        src={src}
        width="100%"
        height="100%"
        frameBorder="0"
        style={{ display: "block", minHeight: "1200px" }}
      />
</div>
  )
}
 
/* ===================== MAIN ===================== */
export default function DashboardPage({
  session,
  activeRes,
  activeDash,
  onDashChange
}) {
 
  const currentDashIds =
    session.dashboardConfig?.[activeRes?.id] || []
 
  const dashOpts = DASHBOARD_OPTIONS.filter(d =>
    currentDashIds.includes(d.id)
  )
 
  if (!dashOpts.length) {
    return (
<div style={{ color:'var(--tx-muted)' }}>
        No dashboards configured for this resource
</div>
    )
  }
 
  return (
<div className="fade-up">
 
      {dashOpts.length > 1 && (
<div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          {dashOpts.map(d => (
<button
              key={d.id}
              onClick={() => onDashChange(d.id)}
              style={{
                fontSize:12,
                padding:'5px 16px',
                borderRadius:20,
                border:`1px solid ${
                  activeDash===d.id ? d.color : 'var(--card-border)'
                }`,
                background: activeDash===d.id
                  ? `${d.color}18`
                  : 'var(--card-bg)',
                color: activeDash===d.id
                  ? d.color
                  : 'var(--tx-second)',
                fontWeight: activeDash===d.id ? 600 : 400,
                cursor:'pointer'
              }}
>
              {d.name}
</button>
          ))}
</div>
      )}
 
      {activeDash==='grafana'  && <GrafanaView session={session} activeRes={activeRes} />}
      {activeDash==='powerbi'  && <PowerBIView activeRes={activeRes} />}
      {activeDash==='morpheus' && <MorpheusView activeRes={activeRes} />}
 
    </div>
  )
}
