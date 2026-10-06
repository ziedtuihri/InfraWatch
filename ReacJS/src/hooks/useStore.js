import { useReducer, useCallback, useEffect } from 'react'

const COLLECTION_TOOLS_STORAGE_KEY = 'infrawatch.collectionTools'
const AUTH_STORAGE_KEY = 'infrawatch.auth'

const INIT = {
  screen: 'login',
  step: 1,

  auth: {
    status: 'anon',
    user: null,
    token: null,
  },

  selResources: [],

  toolConfig: {},
  dashboardConfig: {},

  grafanaConfig: {}, // ✅ NEW

  currentResourceId: null,
  resources: [],

  sessions: [],
  activeSessionId: null,

  activeTab: 'dash',
  theme: 'light',
  expandedTools: {},

  addMode: false
}

/* helpers */
function getResourceConfig(state, resourceId) {
  return state.toolConfig[resourceId] || { metrics: {}, logs: {} }
}

function ensureConfig(state, resourceId) {
  if (!resourceId || state.toolConfig[resourceId]) return state
  return {
    ...state,
    toolConfig: {
      ...state.toolConfig,
      [resourceId]: { metrics: {}, logs: {} }
    }
  }
}

function loadStoredToolConfig() {
  try {
    const raw = localStorage.getItem(COLLECTION_TOOLS_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)

    const tc = parsed?.toolConfig
    if (!tc || typeof tc !== 'object') return null

    return tc
  } catch {
    return null
  }
}

function loadStoredAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (!parsed?.token) return null

    return {
      status: 'authed',
      user: parsed.user || null,
      token: String(parsed.token),
    }
  } catch {
    return null
  }
}

function initStoreState(base) {
  const stored = loadStoredToolConfig()
  const auth = loadStoredAuth()

  return {
    ...base,
    ...(stored ? { toolConfig: stored } : null),
    ...(auth ? { auth, screen: 'setup' } : null),
  }
}

function reducer(s, a) {
  switch (a.type) {

    case 'LOGIN_SUCCESS':
      return {
        ...s,
        auth: {
          status: 'authed',
          user: a.user || null,
          token: a.token || null,
        },
        screen: 'setup',
        step: 1,
      }

    case 'LOGOUT':
      return {
        ...INIT,
        theme: s.theme,
        toolConfig: s.toolConfig,
      }

    case 'SET_SCREEN':
      return { ...s, screen: a.screen }

    case 'SET_THEME':
      return { ...s, theme: a.theme }

    case 'SET_STEP':
      return { ...s, step: a.step }

    case 'START_ADD_RESOURCE':
      return {
        ...s,
        screen: 'setup',
        step: 1,
        addMode: true
      }

    case 'SET_RESOURCES_DATA':
      return { ...s, resources: a.resources }

    case 'SET_ACTIVE_SESSION':
      return { ...s, activeSessionId: a.id }

    case 'REMOVE_SESSION': {
      const next = (s.sessions || []).filter(sess => sess.id !== a.id)
      const nextActive =
        s.activeSessionId === a.id
          ? (next[0]?.id ?? null)
          : s.activeSessionId
      return { ...s, sessions: next, activeSessionId: nextActive }
    }

    case 'TOGGLE_RESOURCE': {
      const has = s.selResources.includes(a.id)
      const next = has
        ? s.selResources.filter(x => x !== a.id)
        : [...s.selResources, a.id]

      return {
        ...s,
        selResources: next,
        currentResourceId: next[0] || null
      }
    }

    case 'SET_ALL_RESOURCES':
      return { ...s, selResources: a.ids, currentResourceId: a.ids[0] || null }

    case 'CLEAR_RESOURCES':
      return { ...s, selResources: [], currentResourceId: null }

    case 'SET_CURRENT_RESOURCE':
      return { ...s, currentResourceId: a.id }

    case 'TOGGLE_METRIC_TOOL': {
      const s2 = ensureConfig(s, a.resourceId)
      const r = getResourceConfig(s2, a.resourceId)
      const exists = r.metrics[a.id]

      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            metrics: exists
              ? Object.fromEntries(
                  Object.entries(r.metrics).filter(([k]) => k !== a.id)
                )
              : { ...r.metrics, [a.id]: [] }
          }
        }
      }
    }

    case 'TOGGLE_LOG_TOOL': {
      const s2 = ensureConfig(s, a.resourceId)
      const r = getResourceConfig(s2, a.resourceId)
      const exists = r.logs[a.id]

      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            logs: exists
              ? Object.fromEntries(
                  Object.entries(r.logs).filter(([k]) => k !== a.id)
                )
              : { ...(r.logs || {}), [a.id]: [] }
          }
        }
      }
    }

    case 'TOGGLE_METRIC_EXP': {
      const s2 = ensureConfig(s, a.resourceId)
      const r = getResourceConfig(s2, a.resourceId)

      const current = r.metrics[a.tid] || []
      const has = current.includes(a.eid)

      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            metrics: {
              ...r.metrics,
              [a.tid]: has
                ? current.filter(x => x !== a.eid)
                : [...current, a.eid]
            }
          }
        }
      }
    }

    case 'TOGGLE_LOG_EXP': {
      const s2 = ensureConfig(s, a.resourceId)
      const r = getResourceConfig(s2, a.resourceId)

      const current = r.logs[a.tid] || []
      const has = current.includes(a.eid)

      return {
        ...s2,
        toolConfig: {
          ...s2.toolConfig,
          [a.resourceId]: {
            ...r,
            logs: {
              ...r.logs,
              [a.tid]: has
                ? current.filter(x => x !== a.eid)
                : [...current, a.eid]
            }
          }
        }
      }
    }

    case 'TOGGLE_EXP_PANEL':
      return {
        ...s,
        expandedTools: {
          ...s.expandedTools,
          [a.id]: !s.expandedTools[a.id]
        }
      }

    case 'TOGGLE_DASH': {
      const rid = s.currentResourceId
      if (!rid) return s

      const current = s.dashboardConfig[rid] || []
      const has = current.includes(a.id)

      return {
        ...s,
        dashboardConfig: {
          ...s.dashboardConfig,
          [rid]: has
            ? current.filter(x => x !== a.id)
            : [...current, a.id]
        }
      }
    }

    /* ✅ ONLY NEW FEATURE */
    case 'SET_GRAFANA_CONFIG': {
      const { resourceId, config } = a
      if (!resourceId) return s

      const current = s.grafanaConfig[resourceId] || {}

      return {
        ...s,
        grafanaConfig: {
          ...s.grafanaConfig,
          [resourceId]: {
            ...current,
            ...config
          }
        }
      }
    }

    case 'LAUNCH': {

      if (s.addMode && s.activeSessionId) {

        const updatedSessions = s.sessions.map(sess => {
          if (sess.id !== s.activeSessionId) return sess

          return {
            ...sess,
            resources: Array.from(
              new Set([...sess.resources, ...s.selResources])
            ),
            toolConfig: {
              ...sess.toolConfig,
              ...s.toolConfig
            },
            dashboardConfig: {
              ...sess.dashboardConfig,
              ...s.dashboardConfig
            },
            grafanaConfig: {
              ...sess.grafanaConfig,
              ...s.grafanaConfig
            }
          }
        })

        return {
          ...s,
          screen: 'portal',
          sessions: updatedSessions,
          addMode: false
        }
      }

      const session = {
        id: Date.now(),
        resources: s.selResources,
        toolConfig: s.toolConfig,
        dashboardConfig: s.dashboardConfig,
        grafanaConfig: s.grafanaConfig
      }

      return {
        ...s,
        screen: 'portal',
        sessions: [...s.sessions, session],
        activeSessionId: session.id,
        addMode: false
      }
    }

    default:
      return s
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, INIT, initStoreState)

  useEffect(() => {
    try {
      localStorage.setItem(
        COLLECTION_TOOLS_STORAGE_KEY,
        JSON.stringify({ toolConfig: state.toolConfig })
      )
    } catch {}
  }, [state.toolConfig])

  useEffect(() => {
    try {
      if (state.auth?.status === 'authed' && state.auth?.token) {
        sessionStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ token: state.auth.token, user: state.auth.user })
        )
      } else {
        sessionStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch {}
  }, [state.auth])

  const act = useCallback(
    (type, payload = {}) => dispatch({ type, ...payload }),
    []
  )

  return { state, act }
}

