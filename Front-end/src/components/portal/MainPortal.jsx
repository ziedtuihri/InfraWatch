import React, { useState, useEffect } from 'react'
import Topbar from '../ui/Topbar'
import DashboardPage from '../../pages/DashboardPage'
import AlertsPage from '../../pages/AlertsPage'
import LogsPage from '../../pages/LogsPage'
import ThresholdsPage from '../../pages/ThresholdsPage'
import RBACPage from '../../pages/RBACPage'
import { useActiveAlertCount } from '../../api/useActiveAlertCount'
import { fetchResources, USE_LIVE } from '../../api/morpheus'
import { getMorpheusConfig } from '../../api/morpheusConfig'

const FEAT_TABS = [
  { id: 'dash',   label: 'Dashboard' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'logs',   label: 'Logs' },
  { id: 'thresh', label: 'Thresholds' },
  { id: 'rbac',   label: 'Access Control' },
]

function valColor(v) {
  return v > 80 ? 'var(--status-crit)' : v > 65 ? 'var(--status-warn)' : 'var(--status-ok)'
}

function toSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function SessionPanel({ session, resources, auth, initialTab }) {

  const [activeResourceId, setActiveResourceId] = useState(() => {
    const parts = window.location.pathname.split('/')
    if (parts[1] === 'portal' && parts[2]) {
      const slug = parts[2]
      const matched = (resources || []).find(r =>
        session.resources.includes(r.id) && toSlug(r.name) === slug
      )
      if (matched) return matched.id
    }
    return session.resources[0] || null
  })

  const [activeTab,  setActiveTab]  = useState(initialTab || 'dash')
  const [activeDash, setActiveDash] = useState(
    session.dashboardConfig?.[session.resources[0]]?.[0] || 'grafana'
  )

  const sessionRes = (resources || []).filter(r => session.resources.includes(r.id))
  const activeRes  = sessionRes.find(r => r.id === activeResourceId) || sessionRes[0]

  // Live active-alert count for the badge — recomputed automatically as
  // useAlerts polls in the background, so it never goes stale.
  const { count: liveAlertCount } = useActiveAlertCount(activeRes, auth)

  useEffect(() => {
    if (!session?.resources?.length) return
    if (!session.resources.includes(activeResourceId)) {
      setActiveResourceId(session.resources[0])
    }
  }, [session.resources, activeResourceId])

  useEffect(() => {
    const next = session.dashboardConfig?.[activeResourceId]?.[0]
    if (next) setActiveDash(next)
  }, [activeResourceId])

  const activeResName = activeRes ? toSlug(activeRes.name) : null

  const navigatingFromHistory = React.useRef(false)

  useEffect(() => {
    if (!activeResName) return
    if (navigatingFromHistory.current) {
      navigatingFromHistory.current = false
      window.history.replaceState(
        { portalTab: activeTab, portalRes: activeResName },
        '',
        `/portal/${activeResName}/${activeTab}`
      )
      return
    }
    window.history.pushState(
      { portalTab: activeTab, portalRes: activeResName },
      '',
      `/portal/${activeResName}/${activeTab}`
    )
  }, [activeResName, activeTab])

  useEffect(() => {
    function onPopState() {
      const parts = window.location.pathname.split('/')
      if (parts[1] !== 'portal') return

      navigatingFromHistory.current = true

      const tab = parts[3]
      if (tab && ['dash','alerts','logs','thresh','rbac'].includes(tab)) {
        setActiveTab(tab)
      }

      const nameSlug = parts[2]
      if (nameSlug) {
        const matched = sessionRes.find(r => toSlug(r.name) === nameSlug)
        if (matched) setActiveResourceId(matched.id)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [sessionRes])

  useEffect(() => {
    if (!sessionRes.length) return
    const parts = window.location.pathname.split('/')
    if (parts[1] !== 'portal') return
    if (parts[2]) {
      const matched = sessionRes.find(r => toSlug(r.name) === parts[2])
      if (matched && matched.id !== activeResourceId) setActiveResourceId(matched.id)
    }
    if (parts[3]) {
      const tab = parts[3]
      if (['dash','alerts','logs','thresh','rbac'].includes(tab)) setActiveTab(tab)
    }
  }, [sessionRes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="m-tabs" style={{ background: 'var(--table-head)' }}>
        {sessionRes.map(r => (
          <div
            key={r.id}
            className={`m-tab${activeResourceId === r.id ? ' active' : ''}`}
            onClick={() => setActiveResourceId(r.id)}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: valColor(r.cpu || 0),
              marginRight: 6, display: 'inline-block'
            }} />
            {r.name}
          </div>
        ))}
      </div>

      <div className="m-tabs">
        {FEAT_TABS.map(t => {
          const badgeCount = t.id === 'alerts' ? liveAlertCount : null
          return (
            <div
              key={t.id}
              className={`m-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {badgeCount > 0 && activeTab !== t.id && (
                <span className="m-tab-badge">{badgeCount}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="page-wrap">
        <div className="page-inner">
          {activeTab === 'dash'   && <DashboardPage session={session} activeRes={activeRes} activeDash={activeDash} onDashChange={setActiveDash} />}
          {activeTab === 'alerts' && <AlertsPage activeRes={activeRes} auth={auth} />}
          {activeTab === 'logs'   && <LogsPage session={session} activeRes={activeRes} />}
          {activeTab === 'thresh' && <ThresholdsPage activeRes={activeRes} auth={auth} />}
          {activeTab === 'rbac'   && <RBACPage auth={auth} />}
        </div>
      </div>
    </div>
  )
}

export default function MainPortal({ state, act }) {
  const { sessions, activeSessionId, resources = [] } = state

  useEffect(() => {
    if (state?.auth?.status !== 'authed') act('SET_SCREEN', { screen: 'login' })
  }, [state?.auth?.status])

  // Refresh full resource data (ip, serverId, live stats) from Morpheus on
  // every portal mount — not just during the setup wizard. RESTORE_SESSION
  // only persists {id, name, type} for a saved session (resourcesMeta), so
  // without this, activeRes.ip stays undefined forever on a direct portal
  // load (login → redirected straight here, skipping the wizard entirely),
  // which broke Grafana iframe target resolution.
  useEffect(() => {
    if (!USE_LIVE) return
    let cancelled = false
    fetchResources()
      .then(fresh => {
        if (!cancelled && fresh?.length) act('SET_RESOURCES', { resources: fresh })
      })
      .catch(err => console.warn('[MainPortal] fetchResources failed:', err.message))
    return () => { cancelled = true }
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0]
  const activeRes     = resources.find(r => activeSession?.resources?.[0] === r.id)

  useEffect(() => {
    if (!window.location.pathname.startsWith('/portal')) {
      window.history.replaceState({}, '', '/portal')
    }
  }, [])

  const [restoredTab] = useState(() => {
    const parts = window.location.pathname.split('/')
    if (parts[1] === 'portal' && parts[3]) {
      const tab = parts[3]
      if (['dash','alerts','logs','thresh','rbac'].includes(tab)) return tab
    }
    return null
  })

  async function handleAddResource() {
    // Only superadmin manages the shared Morpheus connection on step 1 —
    // admin and viewer both always inherit it (see _get_morpheus_creds'
    // fallback) and have nothing of their own to configure. Plain 'admin'
    // was previously treated the same as superadmin here, which is wrong:
    // admin should never be sent to step 1 at all, regardless of whether
    // a config row happens to exist for them.
    //
    // For superadmin specifically: don't blindly send them to step 1
    // every single time — if they already saved a config in a previous
    // session, check the DB first and skip straight to step 2 instead of
    // making them stare at the same URL/token form again with nothing
    // new to enter.
    const role = state.auth?.user?.role

    let startStep = 2
    if (role === 'superadmin') {
      startStep = 1
      try {
        const existing = await getMorpheusConfig(state.auth)
        if (existing) startStep = 2
      } catch {
        // getMorpheusConfig already treats 404 as null, not a throw —
        // a real error here just means we can't confirm either way, so
        // fall back to showing step 1 rather than silently skipping it.
      }
    }

    window.history.pushState({ step: startStep }, '', `/setup/${startStep}`)
    act('START_ADD_RESOURCE', { skipMorpheusStep: startStep === 2 })
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
              <div className="res-tab-dot" style={{
                background: 'var(--accent)',
                animation: isActive ? 'pulse 2s infinite' : 'none'
              }} />
              <span>Resources</span>
              <span className="badge badge-muted">{sess.resources.length}</span>
              <span
                className="res-tab-x"
                onClick={e => { e.stopPropagation(); act('REMOVE_SESSION', { id: sess.id }) }}
              >✕</span>
            </div>
          )
        })}
        <div className="res-tab-add" onClick={handleAddResource}>+ Add resource</div>
      </div>

      {activeSession ? (
        <SessionPanel
          key={activeSession.id}
          session={activeSession}
          resources={resources}
          auth={state.auth}
          initialTab={restoredTab}
        />
      ) : (
        <div style={{ textAlign: 'center', marginTop: 40 }}>No sessions active</div>
      )}
    </div>
  )
}
