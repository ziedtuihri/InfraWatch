import React, { useState } from 'react'
import { Card, CardHeader, Badge } from '../components/ui/Primitives'

const DEFAULT_ROWS = [
  { id:'cpu',  label:'CPU utilisation',  val:85,  max:100, sev:'Warning',  action:'Alert + watch', unit:'%'  },
  { id:'cpu2', label:'CPU critical',     val:95,  max:100, sev:'Critical', action:'Alert + AWX',   unit:'%'  },
  { id:'disk', label:'Disk utilisation', val:90,  max:100, sev:'Critical', action:'Alert + AWX',   unit:'%'  },
  { id:'mem',  label:'Memory pressure',  val:80,  max:100, sev:'Warning',  action:'Alert + watch', unit:'%'  },
  { id:'net',  label:'Network latency',  val:200, max:500, sev:'Warning',  action:'Alert only',    unit:'ms' },
]

function sevBadge(s) { return s === 'Critical' ? 'crit' : 'warn' }

export default function ThresholdsPage({ activeRes }) {
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const update = (id, val) => setRows(p => p.map(r => r.id === id ? { ...r, val: Number(val) } : r))

  return (
    <div className="fade-up">
      <Card>
        <CardHeader title={`Alert Thresholds — ${activeRes?.name || 'Global'}`}>
          <Badge v="info">Config-store backed</Badge>
          <Badge v="accent">Morpheus-managed</Badge>
        </CardHeader>
        <div className="m-card-body">
          <div className="thresh-grid thresh-head">
            <span>Metric</span><span>Threshold</span><span>Value</span><span>Severity</span><span>Action</span>
          </div>
          {rows.map(r => (
            <div key={r.id} className="thresh-grid">
              <span style={{ color: 'var(--tx-primary)' }}>{r.label}</span>
              <input
                type="range"
                min={Math.round(r.max * .3)}
                max={r.max}
                step={1}
                value={r.val}
                onChange={e => update(r.id, e.target.value)}
                style={{ width: '100%' }}
              />
              <span style={{ fontFamily: "'Roboto Mono',monospace", fontWeight: 600, fontSize: 12 }}>
                {r.val}{r.unit}
              </span>
              <Badge v={sevBadge(r.sev)}>{r.sev}</Badge>
              <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{r.action}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
