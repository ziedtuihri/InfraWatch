import React, { useMemo, useState } from 'react'
import Topbar from '../components/ui/Topbar'
import { MBtn } from '../components/ui/Primitives'
import { login } from '../api/auth'
import { setMorpheusAuth } from '../api/morpheus'
import { setTaskAuth } from '../api/TaskPrometheus'
import { getLatestSession, getMorpheusConfig } from '../api/morpheusConfig'

export default function LoginPage({ state, act }) {
  const theme = state?.theme || 'light'

  const initialUsername = useMemo(() => {
    const v = sessionStorage.getItem('infrawatch.lastUser')
    return v || ''
  }, [])

  const [username, setUsername] = useState(initialUsername)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await login({ username: username.trim(), password })
      sessionStorage.setItem('infrawatch.lastUser', username.trim())
      setMorpheusAuth({ user: res.user })
      setTaskAuth({ user: res.user })

      // Dispatch login first
      act('LOGIN_SUCCESS', { token: res.token, user: res.user })

      // Only superadmin lands on step 1 by default (see LOGIN_SUCCESS's
      // own role check) — don't make them stare at the Morpheus URL/token
      // form again if they already saved one in a previous session. Check
      // the DB and correct the step before they ever see it. admin/viewer
      // never land on step 1 in the first place, so there's nothing to
      // check for them here.
      const role = res.user?.role
      if (role === 'superadmin') {
        try {
          const existingConfig = await getMorpheusConfig({ user: res.user })
          if (existingConfig) act('SET_STEP', { step: 2 })
        } catch {
          // No config saved yet (404) or a network error — leave them on
          // step 1, which is the correct place to be in either case.
        }
      }

      // Try to restore the last saved session from DB
      // Build auth in the exact shape authHeaders() expects
      try {
        const auth = { user: res.user }
        const session = await getLatestSession(auth)
        if (session?.config) {
          act('RESTORE_SESSION', { config: session.config })
        } else {
          // The DB has no saved sessions for this user (e.g. they were
          // deleted server-side / demo reset). localStorage is stale:
          // clear it and route to the wizard instead of a ghost portal.
          act('DB_SESSION_MISSING', { userId: res.user?.id })
        }
      } catch {
        // Network error only — keep the localStorage fallback
      }

    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar state={{ theme }} act={act} inPortal={false} />

      <div className="login-wrap">
        <div style={{ width: '100%', maxWidth: 420, marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            Use your InfraWatch account to access the portal.
          </div>
        </div>

        <div className="login-card fade-up">
          <div className="m-card-header" style={{ borderBottom: '1px solid var(--divider)' }}>
            <span className="m-card-title">Login</span>
            <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
              {import.meta.env.VITE_USE_LIVE_DATA === 'true' ? 'Live' : 'Mock'}
            </span>
          </div>

          <form className="login-body" onSubmit={onSubmit}>

            
          <div className="login-field">
            <label className="login-label">Username</label>
            <div className="input-wrap">
              <i className="ti ti-user" aria-hidden="true" />
              <input value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" placeholder="Enter your username" />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="input-wrap">
              <i className="ti ti-lock" aria-hidden="true" />
              <input  type="password"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" placeholder="Enter your password" />
            </div>
          </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="login-footer">
              <button
                type="button"
                className="m-btn m-btn-ghost"
                onClick={() => act('SET_THEME', { theme: theme === 'light' ? 'dark' : 'light' })}
                disabled={submitting}
              >
                {theme === 'light' ? '⬛ Dark' : '☀ Light'}
              </button>

              <MBtn action disabled={submitting || !username.trim() || !password}>
                {submitting ? 'Signing in…' : 'Sign in →'}
              </MBtn>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx-muted)' }}>
              For production security, configure an auth backend behind <code>/auth</code>.
            </div>

            <div style={{ marginTop: 14, fontSize: 13, textAlign: 'center' }}>
              Don't have an account?{' '}
              <a
                href="#"
                onClick={e => { e.preventDefault(); act('SET_SCREEN', { screen: 'signup' }) }}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                Create one
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
