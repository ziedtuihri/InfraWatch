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

function NotificationIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-6-7h2v2h-2v-2z" />
    </svg>
  )
}

export default function Topbar({ state, act, inPortal = false }) {
  const { theme, auth, notifications } = state || {}
  const hasNotifications = notifications && notifications.length > 0

  function openAIAssist() {
    window.history.pushState({}, '', '/ai-assist')
    act('SET_SCREEN', { screen: 'ai' })
  }

    function openNotification() {
    window.history.pushState({}, '', '/ai-assist/vm-notification')
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
            <>
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

              <button
                className="m-theme-btn"
                onClick={() => act('TOGGLE_NOTIFICATIONS')}
                title="Notifications"
                style={{ position: 'relative' }}
              >
                <NotificationIcon />
                {hasNotifications && (
                  <span style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    background: 'var(--accent, #ff4444)',
                    color: 'white',
                    borderRadius: '50%',
                    width: 18,
                    height: 18,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--bg)'
                  }}>
                    {notifications.length}
                  </span>
                )}
              </button>
            </>
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