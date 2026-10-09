import { useReducer, useCallback, useEffect } from 'react'

const AUTH_STORAGE_KEY      = 'infrawatch.auth'
const WIZARD_STORAGE_PREFIX = 'infrawatch.wizard.'  // + userId
const THEME_STORAGE_KEY     = 'infrawatch.theme'

// ── Per-user wizard localStorage ──────────────────────────────────────────────

function wizardKey(userId) { return `${WIZARD_STORAGE_PREFIX}${userId}` }

function saveWizardState(userId, state) {
  if (!userId) return
  try {
    localStorage.setItem(wizardKey(userId), JSON.stringify({
      selResources:    state.selResources,
      toolConfig:      state.toolConfig,
      dashboardConfig: state.dashboardConfig,
      grafanaConfig:   state.grafanaConfig,
      resources:       state.resources,
      // persist sessions so portal survives refresh
      sessions:        state.sessions,
      activeSessionId: state.activeSessionId,
    }))
  } catch {}
}

function clearWizardState(userId) {
  if (!userId) return
  try { localStorage.removeItem(wizardKey(userId)) } catch {}
}

function loadWizardState(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(wizardKey(userId))
    if (!raw) return null
    const p = JSON.parse(raw)
    return {
      selResources:    Array.isArray(p.selResources)                              ? p.selResources    : [],
      toolConfig:      p.toolConfig      && typeof p.toolConfig      === 'object' ? p.toolConfig      : {},
      dashboardConfig: p.dashboardConfig && typeof p.dashboardConfig === 'object' ? p.dashboardConfig : {},
      grafanaConfig:   p.grafanaConfig   && typeof p.grafanaConfig   === 'object' ? p.grafanaConfig   : {},
      resources:       Array.isArray(p.resources)                                 ? p.resources       : [],
      sessions:        Array.isArray(p.sessions)                                  ? p.sessions        : [],
      activeSessionId: p.activeSessionId || null,
    }
  } catch { return null }
}

// ── Auth session ──────────────────────────────────────────────────────────────

function loadStoredAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p?.token) return null
    return { status: 'authed', user: p.user || null, token: String(p.token) }
  } catch { return null }
}

// ── Initial state ─────────────────────────────────────────────────────────────

const INIT = {
  screen: 'login',
  step:   1,

  auth: { status: 'anon', user: null, token: null },

  morpheusConfigDone: false,

  selResources:    [],
  resources:       [],
  toolConfig:      {},
  dashboardConfig: {},
  grafanaConfig:   {},

  currentResourceId: null,
  sessions:          [],
  activeSessionId:   null,

  activeTab:     'dash',
  theme:         'light',
  expandedTools: {},
  addMode:       false,
}

function initStoreState(base) {
  // Always restore theme regardless of auth state
  const savedTheme = (() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light' } catch { return 'light' }
  })()

  const auth = loadStoredAuth()
  if (!auth) {
    window.history.replaceState({}, '', '/')
    return { ...base, theme: savedTheme }
  }

  const wizard = loadWizardState(auth.user?.id)
  const role   = auth.user?.role
  const path   = window.location.pathname

  // Determine screen/step from URL (handles refresh on any page)
  let screen = 'setup'
  // Only superadmin manages the shared Morpheus connection on step 1 —
  // admin and viewer both always inherit it (see _get_morpheus_creds'
  // fallback) and skip straight to step 2. Earlier this also let plain
  // 'admin' land on step 1, which was wrong: admin should never be sent
  // there at all, not even conditionally.
  let step   = (role === 'superadmin') ? 1 : 2

  if (path.startsWith('/portal')) {
    screen = 'portal'
  } else if (path.startsWith('/setup')) {
    // User explicitly navigated to setup — respect that
    screen = 'setup'
    const n = parseInt(path.split('/')[2], 10)
    if (n >= 1 && n <= 5) step = n
  } else if (wizard?.sessions?.length > 0) {
    // Fresh load on '/' with saved sessions — go straight to portal
    screen = 'portal'
    window.history.replaceState({}, '', '/portal')
  }

  // Only superadmin manages the shared Morpheus connection — admin and
  // viewer must never land on step 1, even if the URL itself says
  // /setup/1 (stale browser history, a refresh mid-step, etc.).
  if (role !== 'superadmin' && screen === 'setup' && step === 1) step = 2

  return {
    ...base,
    auth,
    theme: savedTheme,
    screen,
    step,
    ...(wizard ? {
      selResources:      wizard.selResources,
      toolConfig:        wizard.toolConfig,
      dashboardConfig:   wizard.dashboardConfig,
      grafanaConfig:     wizard.grafanaConfig,
      resources:         wizard.resources,
      currentResourceId: wizard.selResources?.[0] || null,
      sessions:          wizard.sessions,
      activeSessionId:   wizard.activeSessionId,
    } : {}),
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getResourceConfig(s, resourceId) {
  return s.toolConfig[resourceId] || { metrics: {}, logs: {} }
}

function ensureConfig(s, resourceId) {
  if (!resourceId || s.toolConfig[resourceId]) return s
  return {
    ...s,
    toolConfig: { ...s.toolConfig, [resourceId]: { metrics: {}, logs: {} } }
  }
}

// ── reducer ───────────────────────────────────────────────────────────────────

function reducer(s, a) {
  switch (a.type) {

    // ── auth ──────────────────────────────────────────────────────────────────

    case 'LOGIN_SUCCESS': {
      const role   = a.user?.role
      const userId = a.user?.id
      const url    = new URL(window.location)
      url.searchParams.delete('step')
      window.history.replaceState({}, '', url)

      const wizard = loadWizardState(userId)

      // If the user has previously configured sessions, skip the wizard
      // and send them straight to the portal. They can add resources at any
      // time via '+ Add resource' in the portal.
      const hasSessions  = Array.isArray(wizard?.sessions) && wizard.sessions.length > 0
      const targetScreen = hasSessions ? 'portal' : 'setup'
      if (hasSessions) window.history.replaceState({}, '', '/portal')

      return {
        ...s,
        auth: { status: 'authed', user: a.user || null, token: a.token || null },
        morpheusConfigDone: false,
        screen:            targetScreen,
        // Only superadmin lands on step 1 — admin and viewer always skip
        // straight to resource selection.
        step:              (role === 'superadmin') ? 1 : 2,
        selResources:      wizard?.selResources    || [],
        toolConfig:        wizard?.toolConfig      || {},
        dashboardConfig:   wizard?.dashboardConfig || {},
        grafanaConfig:     wizard?.grafanaConfig   || {},
        resources:         wizard?.resources       || [],
        sessions:          wizard?.sessions        || [],
        activeSessionId:   wizard?.activeSessionId || (wizard?.sessions?.[0]?.id ?? null),
        currentResourceId: wizard?.selResources?.[0] || null,
      }
    }

    case 'SET_RESOURCES': {
      // Merge full Morpheus resource objects (ip, serverId, live stats, etc.)
      // onto whatever resources are currently in state. This matters
      // because RESTORE_SESSION deliberately only persists {id, name, type}
      // to the DB (resourcesMeta) — full objects were always meant to be
      // re-fetched from Morpheus after a session restore, but nothing
      // actually did that fetch. On a direct portal load (skipping the
      // wizard, which is the only place fetchResources() was ever called),
      // activeRes.ip stayed permanently undefined, breaking Grafana iframe
      // target resolution. This merges fresh Morpheus data in by id,
      // regardless of how resources first arrived in state.
      const fresh = Array.isArray(a.resources) ? a.resources : []
      if (!fresh.length) return s
      const byId = new Map(fresh.map(r => [String(r.id), r]))
      const merged = (s.resources || []).map(r => byId.get(String(r.id)) || r)
      // Include any fresh resources not already present (e.g. resourcesMeta
      // was empty/missing for some reason)
      const existingIds = new Set(merged.map(r => String(r.id)))
      const additions = fresh.filter(r => !existingIds.has(String(r.id)))
      return { ...s, resources: [...merged, ...additions] }
    }

    case 'MORPHEUS_CONFIG_DONE':
      return { ...s, morpheusConfigDone: true }

    // Restore wizard config from DB (called after login if a saved session exists)
    // DB is source of truth — overrides whatever localStorage had
    case 'RESTORE_SESSION': {
      const c = a.config || {}
      // If DB returns saved sessions, restore them too so the portal has
      // something to render on re-login without going through the wizard again.
      const restoredSessions = Array.isArray(c.sessions) && c.sessions.length > 0
        ? c.sessions
        : s.sessions
      const restoredActiveId = c.activeSessionId || s.activeSessionId || restoredSessions?.[0]?.id || null
      const hasSessions      = restoredSessions.length > 0

      // IMPORTANT: `{}` is truthy, so `c.grafanaConfig || s.grafanaConfig`
      // would pick an EMPTY db object over a populated in-memory one — which
      // wiped the dashboards loaded at login and made the datasource buttons
      // appear then vanish. Only take the DB value when it actually has
      // content; otherwise keep what's already in state.
      const nonEmpty = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0
      const pickObj  = (dbVal, curVal) => (nonEmpty(dbVal) ? dbVal : curVal)
      const pickArr  = (dbVal, curVal) => (Array.isArray(dbVal) && dbVal.length ? dbVal : curVal)

      return {
        ...s,
        screen:            hasSessions ? 'portal' : s.screen,
        selResources:      pickArr(c.selResources, s.selResources),
        toolConfig:        pickObj(c.toolConfig,      s.toolConfig),
        dashboardConfig:   pickObj(c.dashboardConfig, s.dashboardConfig),
        grafanaConfig:     pickObj(c.grafanaConfig,   s.grafanaConfig),
        resources:         pickArr(c.resourcesMeta,   s.resources),
        sessions:          restoredSessions,
        activeSessionId:   restoredActiveId,
        currentResourceId: c.selResources?.[0] || s.currentResourceId,
      }
    }

    // The DB reports no saved sessions for this user — any local wizard
    // cache is stale (sessions were deleted server-side). Wipe it and make
    // sure we are not sitting on a ghost portal.
    case 'DB_SESSION_MISSING': {
      clearWizardState(a.userId)
      return {
        ...s,
        sessions:          [],
        activeSessionId:   null,
        selResources:      [],
        toolConfig:        {},
        dashboardConfig:   {},
        grafanaConfig:     {},
        resources:         [],
        currentResourceId: null,
        screen:            s.screen === 'portal' ? 'setup' : s.screen,
      }
    }

    case 'LOGOUT': {
      const url = new URL(window.location)
      url.searchParams.delete('step')
      window.history.replaceState({}, '', url)
      // keep localStorage wizard data — restored on next login
      return { ...INIT, theme: s.theme }
    }

    // ── navigation ────────────────────────────────────────────────────────────

    case 'SET_SCREEN':      return { ...s, screen: a.screen }
    case 'SET_THEME':       return { ...s, theme:  a.theme  }
    case 'SET_STEP': {
      // Single source of truth for "can this role land on step 1" — only
      // superadmin manages the shared Morpheus connection. Guarding here
      // protects every SET_STEP caller at once (URL restore, browser
      // back/forward in App.jsx, etc.) instead of needing the same fix
      // repeated at each call site.
      const role = s.auth?.user?.role
      const step = (a.step === 1 && role !== 'superadmin') ? 2 : a.step
      return { ...s, step }
    }
    case 'SET_ACTIVE_TAB':  return { ...s, activeTab: a.tab }
    case 'START_ADD_RESOURCE': {
      // Only admin/superadmin have their own morpheus_config row to manage —
      // everyone else inherits shared credentials (see _get_morpheus_creds'
      // Only superadmin manages the shared Morpheus connection — admin
      // and viewer both always inherit it (see _get_morpheus_creds'
      // fallback) and skip straight to step 2, regardless of whether a
      // config row happens to exist for them. Plain 'admin' was
      // previously treated the same as superadmin here, which incorrectly
      // sent admin to step 1 (or kept them there even after checking the
      // DB) when they should never see that form at all.
      //
      // a.skipMorpheusStep lets a caller that already checked the DB
      // (MainPortal's handleAddResource, for superadmin specifically —
      // don't re-show the form if they already saved a config) override
      // the default; any other role always skips regardless.
      const role = s.auth?.user?.role
      const roleBasedSkip = role !== 'superadmin'
      const skipMorpheusStep = roleBasedSkip ? true : (a.skipMorpheusStep ?? false)
      return { ...s, screen: 'setup', step: skipMorpheusStep ? 2 : 1, addMode: true }
    }

    // ── resources ─────────────────────────────────────────────────────────────

    // Full resource objects from Morpheus — stored so names persist across steps
    case 'SET_RESOURCES_DATA':
      return { ...s, resources: a.resources }

    case 'TOGGLE_RESOURCE': {
      const has  = s.selResources.includes(a.id)
      const next = has
        ? s.selResources.filter(x => x !== a.id)
        : [...s.selResources, a.id]
      return { ...s, selResources: next, currentResourceId: next[0] || null }
    }

    case 'SET_ALL_RESOURCES':
      return { ...s, selResources: a.ids, currentResourceId: a.ids[0] || null }

    case 'CLEAR_RESOURCES':
      return { ...s, selResources: [], currentResourceId: null }

    case 'SET_CURRENT_RESOURCE':
      return { ...s, currentResourceId: a.id }

    // ── sessions ──────────────────────────────────────────────────────────────

    case 'SET_ACTIVE_SESSION':
      return { ...s, activeSessionId: a.id }

    case 'REMOVE_SESSION': {
      const next       = (s.sessions || []).filter(sess => sess.id !== a.id)
      const nextActive = s.activeSessionId === a.id
        ? (next[0]?.id ?? null)
        : s.activeSessionId
      return { ...s, sessions: next, activeSessionId: nextActive }
    }

    // ── tools ─────────────────────────────────────────────────────────────────

    case 'TOGGLE_METRIC_TOOL': {
      const s2 = ensureConfig(s, a.resourceId)
      const r  = getResourceConfig(s2, a.resourceId)
      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            metrics: r.metrics[a.id]
              ? Object.fromEntries(Object.entries(r.metrics).filter(([k]) => k !== a.id))
              : { ...r.metrics, [a.id]: [] }
          }
        }
      }
    }

    case 'TOGGLE_LOG_TOOL': {
      const s2 = ensureConfig(s, a.resourceId)
      const r  = getResourceConfig(s2, a.resourceId)
      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            logs: r.logs[a.id]
              ? Object.fromEntries(Object.entries(r.logs).filter(([k]) => k !== a.id))
              : { ...r.logs, [a.id]: [] }
          }
        }
      }
    }

    case 'SET_TOOL_CONFIG_FOR_RESOURCE': {
      // Seeds toolConfig for a resource from the shared backend truth
      // (resource_tool_configs) — used when a viewer (or anyone) lands on
      // this step and the wizard's own local state is empty, so they see
      // what's actually configured instead of a blank slate. Never
      // overwrites an already-populated local config for this resource.
      const s2 = ensureConfig(s, a.resourceId)
      const r  = getResourceConfig(s2, a.resourceId)
      const alreadyHasSomething =
        Object.keys(r.metrics || {}).length > 0 || Object.keys(r.logs || {}).length > 0
      if (alreadyHasSomething) return s2
      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            metrics: a.metrics || {},
            logs:    a.logs    || {},
          },
        },
      }
    }

    case 'TOGGLE_METRIC_EXP': {
      const s2  = ensureConfig(s, a.resourceId)
      const r   = getResourceConfig(s2, a.resourceId)
      const cur = r.metrics[a.tid] || []
      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            metrics: {
              ...r.metrics,
              [a.tid]: cur.includes(a.eid) ? cur.filter(x => x !== a.eid) : [...cur, a.eid]
            }
          }
        }
      }
    }

    case 'TOGGLE_LOG_EXP': {
      const s2  = ensureConfig(s, a.resourceId)
      const r   = getResourceConfig(s2, a.resourceId)
      const cur = r.logs[a.tid] || []
      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            logs: {
              ...r.logs,
              [a.tid]: cur.includes(a.eid) ? cur.filter(x => x !== a.eid) : [...cur, a.eid]
            }
          }
        }
      }
    }

    case 'TOGGLE_EXP_PANEL':
      return { ...s, expandedTools: { ...s.expandedTools, [a.id]: !s.expandedTools[a.id] } }

    // ── dashboards ────────────────────────────────────────────────────────────

    case 'TOGGLE_DASH': {
      const rid = s.currentResourceId
      if (!rid) return s
      const cur = s.dashboardConfig[rid] || []
      return {
        ...s,
        dashboardConfig: {
          ...s.dashboardConfig,
          [rid]: cur.includes(a.id) ? cur.filter(x => x !== a.id) : [...cur, a.id]
        }
      }
    }

    case 'SET_GRAFANA_CONFIG': {
      const { resourceId, config } = a
      if (!resourceId) return s
      const cur = s.grafanaConfig[resourceId] || {}
      return {
        ...s,
        grafanaConfig: {
          ...s.grafanaConfig,
          [resourceId]: { ...cur, ...config }
        }
      }
    }

    // ── launch ────────────────────────────────────────────────────────────────

    case 'LAUNCH': {
      if (s.addMode && s.activeSessionId) {
        const updatedSessions = s.sessions.map(sess => {
          if (sess.id !== s.activeSessionId) return sess
          return {
            ...sess,
            resources:       Array.from(new Set([...sess.resources, ...s.selResources])),
            toolConfig:      { ...sess.toolConfig,      ...s.toolConfig },
            dashboardConfig: { ...sess.dashboardConfig, ...s.dashboardConfig },
            grafanaConfig:   { ...sess.grafanaConfig,   ...s.grafanaConfig },
          }
        })
        return { ...s, screen: 'portal', sessions: updatedSessions, addMode: false }
      }

      const session = {
        id:              Date.now(),
        resources:       s.selResources,
        toolConfig:      s.toolConfig,
        dashboardConfig: s.dashboardConfig,
        grafanaConfig:   s.grafanaConfig,
      }

      return {
        ...s,
        screen:          'portal',
        sessions:        [...s.sessions, session],
        activeSessionId: session.id,
        addMode:         false,
      }
    }

    default:
      return s
  }
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useStore() {
  const [state, dispatch] = useReducer(reducer, INIT, initStoreState)

  // Persist auth to sessionStorage
  useEffect(() => {
    try {
      if (state.auth?.status === 'authed' && state.auth?.token) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          token: state.auth.token,
          user:  state.auth.user,
        }))
      } else {
        sessionStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch {}
  }, [state.auth])

  // Persist theme independently so it survives refresh without needing auth
  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, state.theme) } catch {}
  }, [state.theme])

  // Persist full wizard state per user (includes sessions so portal survives refresh)
  useEffect(() => {
    const userId = state.auth?.user?.id
    if (!userId || state.auth?.status !== 'authed') return
    saveWizardState(userId, state)
  }, [
    state.auth?.user?.id,
    state.selResources,
    state.toolConfig,
    state.dashboardConfig,
    state.grafanaConfig,
    state.resources,
    state.sessions,
    state.activeSessionId,
  ])

  const act = useCallback(
    (type, payload = {}) => dispatch({ type, ...payload }),
    []
  )

  return { state, act }
}
