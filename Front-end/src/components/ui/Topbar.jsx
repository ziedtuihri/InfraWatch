import React from 'react'

function AIIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 3l1.6 4.4L15 9l-4.4 1.6L9 15l-1.6-4.4L3 9l4.4-1.6L9 3z" />
      <path d="M17 12l1.1 2.9L21 16l-2.9 1.1L17 20l-1.1-2.9L13 16l2.9-1.1L17 12z" />
      <path d="M17.5 3l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L15 5.5l1.8-.7.7-1.8z" />
    </svg>
  )
}

export default function Topbar({ state, act, inPortal = false }) {
  const { theme, auth } = state || {}

  function openAIAssist() {
    window.history.pushState({}, '', '/ai-assist')
    act('SET_SCREEN', { screen: 'ai' })
  }

  return (
    <>
      <div className="m-topnav">
        <div className="m-logo">
          <div className="m-logo-bar" />
          <span>InfraWatch</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {auth?.status === 'authed' && (
            <button
              className="m-theme-btn"
              onClick={openAIAssist}
              title="Open AI Assist"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              <AIIcon /> AI Assist
            </button>
          )}

          <button
            className="m-theme-btn"
            onClick={() => act('SET_THEME', { theme: theme === 'light' ? 'dark' : 'light' })}
          >
            {theme === 'light' ? '⬛ Dark' : '☀ Light'}
          </button>

          {auth?.status === 'authed' && (
            <button className="m-theme-btn" onClick={() => act('LOGOUT')} title="Sign out">
              ⎋ Logout
            </button>
          )}
        </div>
      </div>

      {inPortal && (
        <div className="m-breadcrumb">
          <a>Monitoring</a>
        </div>
      )}
    </>
  )
}
