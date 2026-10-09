import React, { useState } from 'react'
import Topbar from '../components/ui/Topbar'
import { MBtn } from '../components/ui/Primitives'
import { signup } from '../api/auth'
import { setMorpheusAuth } from '../api/morpheus'
import { setTaskAuth } from '../api/TaskPrometheus'

export default function SignupPage({ state, act }) {
  const theme = state?.theme || 'light'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const passwordsMismatch = password && confirmPassword && password !== confirmPassword

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await signup({
        username: username.trim(),
        password,
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      sessionStorage.setItem('infrawatch.lastUser', username.trim())
      setMorpheusAuth({ user: res.user })
      setTaskAuth({ user: res.user })
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
            Create account
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            New accounts start as a Viewer — an admin can upgrade your access later.
          </div>
        </div>

        <div className="login-card fade-up">
          <div className="m-card-header" style={{ borderBottom: '1px solid var(--divider)' }}>
            <span className="m-card-title">Sign up</span>
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
                  autoComplete="username" placeholder="Choose a username" />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Password</label>
              <div className="input-wrap">
                <i className="ti ti-lock" aria-hidden="true" />
                <input type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password" placeholder="At least 4 characters" />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Confirm password</label>
              <div className="input-wrap">
                <i className="ti ti-lock" aria-hidden="true" />
                <input type="password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password" placeholder="Re-enter your password" />
              </div>
              {passwordsMismatch && (
                <div style={{ fontSize: 11, color: 'var(--status-crit)', marginTop: 4 }}>
                  Passwords don't match yet.
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--tx-muted)', margin: '14px 0 6px' }}>
              Optional — used for alert notifications. You can add or change these later.
            </div>

            <div className="login-field">
              <label className="login-label">Email</label>
              <div className="input-wrap">
                <i className="ti ti-mail" aria-hidden="true" />
                <input type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" placeholder="you@example.com" />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Phone</label>
              <div className="input-wrap">
                <i className="ti ti-phone" aria-hidden="true" />
                <input type="tel"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  autoComplete="tel" placeholder="+1 555 123 4567" />
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
                onClick={() => act('SET_SCREEN', { screen: 'login' })}
                disabled={submitting}
              >
                ← Back to sign in
              </button>

              <MBtn action disabled={
                submitting || !username.trim() || !password || !confirmPassword || passwordsMismatch
              }>
                {submitting ? 'Creating account…' : 'Create account →'}
              </MBtn>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
