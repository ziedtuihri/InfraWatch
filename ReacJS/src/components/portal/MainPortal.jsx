import React, { useState, useEffect } from 'react'
import Topbar from '../ui/Topbar'
import DashboardPage from '../../pages/DashboardPage'
import AlertsPage from '../../pages/AlertsPage'
import LogsPage from '../../pages/LogsPage'
import ThresholdsPage from '../../pages/ThresholdsPage'
import RBACPage from '../../pages/RBACPage'

const FEAT_TABS = [
  { id: 'dash', label: 'Dashboard' },
  { id: 'alerts', label: 'Alerts', badge: 3 },
  { id: 'logs', label: 'Logs' },
  { id: 'thresh', label: 'Thresholds' },
  { id: 'rbac', label: 'Access Control' },
]

function valColor(v) {
  return v > 80
    ? 'var(--status-crit)'
    : v > 65
    ? 'var(--status-warn)'
    : 'var(--status-ok)'
}

/* ✅ SESSION PANEL (FIXED) */
function SessionPanel({ session, resources }) {

  const [activeResourceId, setActiveResourceId] = useState(
    session.resources[0] || null
  )

  const [activeTab, setActiveTab] = useState('dash')

  const [activeDash, setActiveDash] = useState(
    session.dashboardConfig?.[session.resources[0]]?.[0] || 'grafana'
  )

  const sessionRes = (resources || []).filter(r =>
    session.resources.includes(r.id)
  )

  const activeRes =
    sessionRes.find(r => r.id === activeResourceId) || sessionRes[0]

  /* ✅ ✅ CRITICAL FIX: keep activeResourceId in sync */
  useEffect(() => {
    if (!session?.resources?.length) return

    if (!session.resources.includes(activeResourceId)) {
      setActiveResourceId(session.resources[0])
    }
  }, [session.resources, activeResourceId])

  /* ✅ sync dashboard per VM */
  useEffect(() => {
    const next = session.dashboardConfig?.[activeResourceId]?.[0]
    if (next) setActiveDash(next)
  }, [activeResourceId])

  /* ✅ URL SYNC INSIDE PORTAL (resource/tab only) */
  useEffect(() => {
    if (!activeResourceId) return
    const url = `/ip/${activeResourceId}/${activeTab}`
    window.history.replaceState({}, '', url)
  }, [activeResourceId, activeTab])

  /* ✅ READ URL ON LOAD */
  useEffect(() => {
    const parts = window.location.pathname.split('/')
    if (parts[1] === 'ip') {
      const rid = parts[2]
      const tab = parts[3]

      if (rid) setActiveResourceId(rid)
      if (tab && ['dash','alerts','logs','thresh','rbac'].includes(tab)) {
        setActiveTab(tab)
      }
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* ✅ VM TABS */}
      <div className="m-tabs" style={{ background: 'var(--table-head)' }}>
        {sessionRes.map(r => (
          <div
            key={r.id}
            className={`m-tab${activeResourceId === r.id ? ' active' : ''}`}
            onClick={() => setActiveResourceId(r.id)}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: valColor(r.cpu || 0),
                marginRight: 6,
                display: 'inline-block'
              }}
            />
            {r.name}
          </div>
        ))}
      </div>

      {/* ✅ FEATURE TABS */}
      <div className="m-tabs">
        {FEAT_TABS.map(t => (
          <div
            key={t.id}
            className={`m-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.badge && activeTab !== t.id && (
              <span className="m-tab-badge">{t.badge}</span>
            )}
          </div>
        ))}
      </div>

      {/* ✅ PAGE */}
      <div className="page-wrap">
        <div className="page-inner">

          {activeTab === 'dash' && (
            <DashboardPage
              session={session}
              activeRes={activeRes}
              activeDash={activeDash}
              onDashChange={setActiveDash}
            />
          )}

          {activeTab === 'alerts' && <AlertsPage activeRes={activeRes} />}
          {activeTab === 'logs' && (
            <LogsPage session={session} activeRes={activeRes} />
          )}
          {activeTab === 'thresh' && (
            <ThresholdsPage activeRes={activeRes} />
          )}
          {activeTab === 'rbac' && <RBACPage />}

        </div>
      </div>

    </div>
  )
}

/* ✅ MAIN PORTAL */
export default function MainPortal({ state, act }) {

  const { sessions, activeSessionId, resources = [] } = state

  // Hard gate: require auth (prevents direct deep-link into portal)
  useEffect(() => {
    if (state?.auth?.status !== 'authed') {
      act('SET_SCREEN', { screen: 'login' })
    }
  }, [state?.auth?.status])

  const activeSession =
    sessions.find(s => s.id === activeSessionId) || sessions[0]

  const activeRes =
    resources.find(r => activeSession?.resources?.[0] === r.id)

  /* ✅ CLEAN STEP PARAM WHEN ENTERING PORTAL */
  useEffect(() => {
    const url = new URL(window.location)
    if (url.searchParams.has('step')) {
      url.searchParams.delete('step')
      window.history.replaceState({}, '', url)
    }
  }, [])

  /* ✅ ADD RESOURCE HANDLER */
  function handleAddResource() {
    const url = new URL(window.location)
    url.searchParams.set('step', '1')
    window.history.pushState({ step: 1 }, '', url)
    act('START_ADD_RESOURCE')
  }

  return (
    <div className="app-shell">

      <Topbar state={state} act={act} inPortal activeRes={activeRes} />

      <div className="res-tabbar">
        {sessions.map(sess => {
          const isActive = sess.id === activeSessionId

          return (
            <div
              key={sess.id}
              className={`res-tab${isActive ? ' active' : ''}`}
              onClick={() => act('SET_ACTIVE_SESSION', { id: sess.id })}
            >
              <div
                className="res-tab-dot"
                style={{
                  background: 'var(--accent)',
                  animation: isActive ? 'pulse 2s infinite' : 'none',
                }}
              />
              <span>Resources</span>
              <span className="badge badge-muted">
                {sess.resources.length}
              </span>
              <span
                className="res-tab-x"
                onClick={e => {
                  e.stopPropagation()
                  act('REMOVE_SESSION', { id: sess.id })
                }}
              >
                ✕
              </span>
            </div>
          )
        })}

        {/* ✅ ADD RESOURCE */}
        <div className="res-tab-add" onClick={handleAddResource}>
          + Add resource
        </div>
      </div>

      {activeSession ? (
        <SessionPanel
          key={activeSession.id}
          session={activeSession}
          resources={resources}
        />
      ) : (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          No sessions active
        </div>
      )}

    </div>
  )
}
