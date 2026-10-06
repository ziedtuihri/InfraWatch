import React, { useState } from 'react'

import UsersModal from './UsersModal'

export default function Topbar({ state, act, inPortal = false }) {
  const { theme, auth } = state || {}
  const username = auth?.user?.username || auth?.user?.name || null
  const [showUsers, setShowUsers] = useState(false)

  const token = auth?.token
  const currentRole = auth?.user?.role

  return (
    <>
      <div className="m-topnav">

        {/* ✅ LOGO */}
        <div className="m-logo">
          <div className="m-logo-bar" />
          <span>InfraWatch</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

          {/* ✅ THEME SWITCH */}
          <button
            className="m-theme-btn"
            onClick={() =>
              act('SET_THEME', {
                theme: theme === 'light' ? 'dark' : 'light'
              })
            }
          >
            {theme === 'light' ? '⬛ Dark' : '☀ Light'}
          </button>

          {/* ✅ LOGOUT (only when authed + in portal/setup) */}
          {auth?.status === 'authed' && (
            <button
              className="m-theme-btn"
              onClick={() => act('LOGOUT')}
              title="Sign out"
            >
              ⎋ Logout
            </button>
          )}

          {/* ✅ Create User */}
          {auth?.status === 'authed' && (
            <button
              className="m-theme-btn" onClick={() => setShowUsers(true)}
            >
              👤 Users
            </button>
          )}

        </div>
      </div>

      {/* ✅ ✅ FIXED BREADCRUMB (NO RESOURCE NAME) */}
      {inPortal && (
        <div className="m-breadcrumb">
          <a>Monitoring</a>
        </div>
      )}

       {/* Users Modal */}
       {showUsers && (
        <UsersModal
          token={token}
          currentRole={currentRole}
          onClose={() => setShowUsers(false)}
        />
      )}
    </>
  )
}
