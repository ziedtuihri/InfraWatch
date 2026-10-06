import React, { useState } from 'react'
import { TOOLS } from '../../data'
import { MBtn, Badge } from '../ui/Primitives'

/* ✅ Helper: resolve name from ID */
function getResourceName(id, allResources) {
  const r = allResources.find(x => String(x.id) === String(id))
  return r?.name || id
}

/* ✅ Tool Item */
function ToolItem({
  tool,
  selected,
  selExps,
  expanded,
  onToggle,
  onToggleExp,
  onTogglePanel
}) {
  return (
    <div className="tool-select-wrap">
      <div
        className={`tool-trigger${selected ? ' selected' : ''}`}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={e => e.stopPropagation()}
          />

          <div>
            <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}>
              {tool.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
              {tool.desc}
            </div>
          </div>

          {selected && selExps.length > 0 && (
            <Badge v="accent" style={{ marginLeft: 8 }}>
              {selExps.length} exporters
            </Badge>
          )}
        </div>

        {selected && (
          <MBtn ghost sm onClick={e => { e.stopPropagation(); onTogglePanel() }}>
            {expanded ? '▴ Hide' : '▾ Exporters'}
          </MBtn>
        )}
      </div>

      {selected && expanded && (
        <div className="exp-panel">
          <div className="exp-label">
            Select exporters for {tool.name}
          </div>

          <div className="exp-grid">
            {tool.exporters.map(exp => (
              <div
                key={exp.id}
                className={`exp-chip${selExps.includes(exp.id) ? ' sel' : ''}`}
                onClick={() => onToggleExp(exp.id)}
              >
                {selExps.includes(exp.id) && '✓ '}
                {exp.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ✅ Tool column */
function ToolColumn({
  label,
  tools,
  toolMap,
  expandedTools,
  cat,
  act,
  resourceId
}) {
  return (
    <div>
      <div className="sec-label">{label}</div>

      {tools.map(tool => {
        const toggleType =
          cat === 'metrics' ? 'TOGGLE_METRIC_TOOL' : 'TOGGLE_LOG_TOOL'

        const expType =
          cat === 'metrics' ? 'TOGGLE_METRIC_EXP' : 'TOGGLE_LOG_EXP'

        return (
          <ToolItem
            key={tool.id}
            tool={tool}
            selected={toolMap[tool.id] !== undefined}
            selExps={toolMap[tool.id] || []}
            expanded={!!expandedTools[tool.id]}

            onToggle={() =>
              act(toggleType, { id: tool.id, resourceId })
            }

            onToggleExp={eid =>
              act(expType, { tid: tool.id, eid, resourceId })
            }

            onTogglePanel={() =>
              act('TOGGLE_EXP_PANEL', { id: tool.id })
            }
          />
        )
      })}
    </div>
  )
}

/* ✅ MAIN COMPONENT */
export default function StepTools({
  selectedResources = [],
  allResources = [],        // ✅ needed for names
  currentResourceId,
  setCurrentResourceId,
  toolConfig,
  expandedTools,
  act,
  state
}) {

  const { theme, auth } = state || {}
  const username = auth?.user?.username || auth?.user?.name || null
  const [showUsers, setShowUsers] = useState(false)

  const token = auth?.token
  const currentRole = auth?.user?.role

  let isAdmin = false

  if (currentRole === "admin") {
      isAdmin = true
  }


  /* ✅ fallback safety */
  const safeResourceId =
    currentResourceId || selectedResources[0] || null

  const currentConfig = toolConfig[safeResourceId] || {
    metrics: {},
    logs: {}
  }

  const selMetricTools = currentConfig.metrics
  const selLogTools = currentConfig.logs

  console.log('selMetricTools  ----- ', selMetricTools)
  console.log('selLogTools  ----- ', selLogTools)

  const hasAny =
    Object.keys(selMetricTools).length +
    Object.keys(selLogTools).length > 0

  return (
    <div>

      {/* ✅ ✅ RESOURCE TABS (replaces dropdown) */}
      {selectedResources.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sec-label">Configure resource</div>

          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap'
          }}>
            {selectedResources.map(id => {
              const active = id === safeResourceId

              return (
                <div
                  key={id}
                  onClick={() => setCurrentResourceId(id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    border: active
                      ? '1px solid var(--accent)'
                      : '1px solid var(--border)',
                    background: active
                      ? 'var(--accent-bg)'
                      : 'transparent',
                    color: active
                      ? 'var(--accent)'
                      : 'var(--tx-muted)'
                  }}
                >
                  {getResourceName(id, allResources)}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ✅ TOOL GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20
      }}>

       {/* ✅ Admin sees full columns, user sees empty state */}
        {isAdmin ? (
          <>
            <ToolColumn
              label="Metrics collection"
              tools={TOOLS.metrics}
              toolMap={selMetricTools}
              expandedTools={expandedTools}
              cat="metrics"
              act={act}
              resourceId={safeResourceId}
            />
            <ToolColumn
              label="Log collection"
              tools={TOOLS.logs}
              toolMap={selLogTools}
              expandedTools={expandedTools}
              cat="logs"
              act={act}
              resourceId={safeResourceId}
            />
          </>
        ) : (
          <>
            <div>
              <div className="sec-label">Metrics collection</div>
              <p style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 8 }}>
                You don't have permission to configure metrics.
              </p>
            </div>
            <div>
              <div className="sec-label">Log collection</div>
              <p style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 8 }}>
                You don't have permission to configure logs.
              </p>
            </div>
          </>
        )}

      </div>

      {/* Info panel — admin only */}
      {isAdmin && hasAny && (
        <div style={{
          marginTop: 14, padding: '10px 14px',
          background: 'var(--accent-bg)', border: '1px solid var(--accent)',
          borderRadius: 3, fontSize: 12, color: 'var(--accent)'
        }}>
          ✓ Morpheus will provision collection agents on this resource automatically on launch.
        </div>
      )}

    </div>
  )
}