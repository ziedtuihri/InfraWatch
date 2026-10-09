import React from 'react'

export default function Topbar({ state, act, inPortal = false }) {
  const { theme, auth } = state || {}

  return (
    <>
      <div className="m-topnav">
        <div className="m-logo">
          <div className="m-logo-bar" />
          <span>InfraWatch</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
