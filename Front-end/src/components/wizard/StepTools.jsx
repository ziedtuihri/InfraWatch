import React, { useState, useEffect } from 'react'
import { TOOLS } from '../../data'
import { MBtn } from '../ui/Primitives'
import { getResourceToolConfig, saveResourceToolConfig } from '../../api/resourceTools'

function getResourceName(id, allResources) {
  if (!allResources?.length) return id  // resources not loaded yet, show id temporarily
  const r = allResources.find(x => String(x.id) === String(id))
  return r?.name || id
}

function ToolItem({ tool, selected, selExps, expanded, onToggle, onToggleExp, onTogglePanel, disabled }) {
  // Resolve exporter ids -> names so the selection is actually readable
  // without expanding the panel — a viewer picking a matching Grafana
  // template needs to know it's specifically "Node Exporter," not just
  // "1 exporter," since the dashboard template depends on which one.
  const selExpNames = selExps
    .map(id => tool.exporters.find(e => e.id === id)?.name)
    .filter(Boolean)

  return (
    <div className="tool-select-wrap" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div
        className={`tool-trigger${selected ? ' selected' : ''}`}
        onClick={disabled ? undefined : onToggle}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={disabled ? undefined : onToggle}
            onClick={e => e.stopPropagation()}
            disabled={disabled}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}>{tool.name}</div>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{tool.desc}</div>
            {selected && selExpNames.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selExpNames.map(name => (
                  <span key={name} style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                    background: 'var(--accent-bg)', color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {selected && !disabled && (
          <MBtn ghost sm onClick={e => { e.stopPropagation(); onTogglePanel() }}>
            {expanded ? '▴ Hide' : '▾ Exporters'}
          </MBtn>
        )}
      </div>

      {selected && expanded && !disabled && (
        <div className="exp-panel">
          <div className="exp-label">Select exporters for {tool.name}</div>
          <div className="exp-grid">
            {tool.exporters.map(exp => (
              <div
                key={exp.id}
                className={`exp-chip${selExps.includes(exp.id) ? ' sel' : ''}`}
                onClick={() => onToggleExp(exp.id)}
              >
                {selExps.includes(exp.id) && '✓ '}{exp.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolColumn({ label, tools, toolMap, expandedTools, cat, act, resourceId, disabled }) {
  return (
    <div>
      <div className="sec-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {label}
        {disabled && (
          <span style={{ fontSize: 10, color: 'var(--tx-muted)', fontWeight: 400, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
            admin only
          </span>
        )}
      </div>
      {tools.map(tool => {
        const toggleType = cat === 'metrics' ? 'TOGGLE_METRIC_TOOL' : 'TOGGLE_LOG_TOOL'
        const expType    = cat === 'metrics' ? 'TOGGLE_METRIC_EXP' : 'TOGGLE_LOG_EXP'
        return (
          <ToolItem
            key={tool.id}
            tool={tool}
            selected={toolMap[tool.id] !== undefined}
            selExps={toolMap[tool.id] || []}
            expanded={!!expandedTools[tool.id]}
            disabled={disabled}
            onToggle={() => act(toggleType, { id: tool.id, resourceId })}
            onToggleExp={eid => act(expType, { tid: tool.id, eid, resourceId })}
            onTogglePanel={() => act('TOGGLE_EXP_PANEL', { id: tool.id })}
          />
        )
      })}
    </div>
  )
}

export default function StepTools({
  selectedResources = [],
  allResources = [],
  currentResourceId,
  setCurrentResourceId,
  toolConfig,
  expandedTools,
  act,
  state
}) {
  const { auth } = state || {}
  // superadmin must pass every check admin passes — this was written
  // before the superadmin tier existed and never got updated.
  const isAdmin = auth?.user?.role === 'admin' || auth?.user?.role === 'superadmin'

  const safeResourceId = currentResourceId || selectedResources[0] || null

  // Shared, per-resource tool config — what's ACTUALLY configured on this
  // VM, readable by any role. Without this, a viewer landing here for the
  // first time saw a blank toolConfig (it previously only ever lived in
  // the configuring admin's own wizard session state, never persisted
  // anywhere a different user could read it) and had no way to tell
  // which Grafana template would actually match real collected data.
  const [sharedConfig, setSharedConfig] = useState(null)
  const [loadingShared, setLoadingShared] = useState(true)
  const [savingShared, setSavingShared] = useState(false)

  useEffect(() => {
    if (!safeResourceId) { setLoadingShared(false); return }
    let cancelled = false
    setLoadingShared(true)
    getResourceToolConfig(safeResourceId, auth)
      .then(cfg => {
        if (cancelled) return
        setSharedConfig(cfg)
        // Seed the wizard's local toolConfig from the shared truth so a
        // viewer's checkboxes (rendered read-only) reflect reality, and
        // an admin starts from what's already there instead of blank.
        if (cfg && !toolConfig[safeResourceId]) {
          act('SET_TOOL_CONFIG_FOR_RESOURCE', {
            resourceId: safeResourceId,
            metrics: cfg.metrics || {},
            logs: cfg.logs || {},
          })
        }
      })
      .finally(() => { if (!cancelled) setLoadingShared(false) })
    return () => { cancelled = true }
  }, [safeResourceId])

  const currentConfig  = toolConfig[safeResourceId] || { metrics: {}, logs: {} }
  const selMetricTools = currentConfig.metrics
  const selLogTools    = currentConfig.logs
  const hasAny = Object.keys(selMetricTools).length + Object.keys(selLogTools).length > 0

  // Admin/superadmin edits push to the shared config automatically so the
  // next person — any role — sees the change immediately, not just in
  // this wizard session. Debounced slightly so rapid toggling (checking
  // several exporters in a row) doesn't fire a save per click.
  useEffect(() => {
    if (!isAdmin || !safeResourceId || loadingShared) return
    if (!hasAny) return  // nothing selected yet — don't save an empty config over a real one
    const t = setTimeout(() => {
      setSavingShared(true)
      saveResourceToolConfig(safeResourceId, { metrics: selMetricTools, logs: selLogTools }, auth)
        .catch(e => console.warn('[StepTools] failed to save shared resource tool config:', e.message))
        .finally(() => setSavingShared(false))
    }, 600)
    return () => clearTimeout(t)
  }, [isAdmin, safeResourceId, loadingShared, JSON.stringify(selMetricTools), JSON.stringify(selLogTools)])

  return (
    <div>
      {/* Resource tabs — always visible for both roles */}
      {selectedResources.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sec-label">Configure resource</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedResources.map(id => {
              const active = id === safeResourceId
              return (
                <div
                  key={id}
                  onClick={() => setCurrentResourceId(id)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-bg)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--tx-muted)',
                  }}
                >
                  {getResourceName(id, allResources)}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Viewer notice — distinguishes "showing you what's really configured"
          from "nothing's been configured yet, so there's nothing to show" */}
      {!isAdmin && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 6, fontSize: 12, color: 'var(--tx-muted)',
        }}>
          {loadingShared ? (
            '🔒 Checking what your administrator has configured…'
          ) : hasAny ? (
            '🔒 Showing the collection tools your administrator already configured for this resource. Configuration itself is admin-only, but you can use this to pick a matching dashboard template.'
          ) : (
            '🔒 Tool & exporter configuration is managed by your administrator — nothing has been configured for this resource yet. You can still select resources and configure dashboards.'
          )}
        </div>
      )}

      {isAdmin && savingShared && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--tx-muted)' }}>
          Saving shared configuration…
        </div>
      )}

      {/* Tool grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ToolColumn
          label="Metrics collection"
          tools={TOOLS.metrics}
          toolMap={selMetricTools}
          expandedTools={expandedTools}
          cat="metrics"
          act={act}
          resourceId={safeResourceId}
          disabled={!isAdmin}
        />
        <ToolColumn
          label="Log collection"
          tools={TOOLS.logs}
          toolMap={selLogTools}
          expandedTools={expandedTools}
          cat="logs"
          act={act}
          resourceId={safeResourceId}
          disabled={!isAdmin}
        />
      </div>

      {isAdmin && hasAny && (
        <div style={{
          marginTop: 14, padding: '10px 14px',
          background: 'var(--accent-bg)', border: '1px solid var(--accent)',
          borderRadius: 3, fontSize: 12, color: 'var(--accent)',
        }}>
          ✓ Morpheus will provision collection agents on this resource automatically on launch.
        </div>
      )}
    </div>
  )
}
