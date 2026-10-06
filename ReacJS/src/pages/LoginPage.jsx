import React, { useMemo, useState } from 'react'
import Topbar from '../components/ui/Topbar'
import { MBtn } from '../components/ui/Primitives'
import { login } from '../api/auth'

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
      act('LOGIN_SUCCESS', { token: res.token, user: res.user })
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
          </form>
        </div>
      </div>
    </div>
  )
}

