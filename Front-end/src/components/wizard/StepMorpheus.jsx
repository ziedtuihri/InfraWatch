import React, { useState, useEffect } from 'react'
import { getMorpheusConfig, saveMorpheusConfig } from '../../api/morpheusConfig'

export default function StepMorpheus({ auth, onSaved }) {
  // superadmin must pass every check admin passes
  const isAdmin = auth?.user?.role === 'admin' || auth?.user?.role === 'superadmin'

  const [url, setUrl]       = useState('')
  const [token, setToken]   = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]  = useState(false)
  const [saved, setSaved]    = useState(false)
  const [error, setError]    = useState(null)

  useEffect(() => {
    getMorpheusConfig(auth)
      .then(cfg => {
        if (cfg) {
          setUrl(cfg.morpheus_url || '')
          setToken(cfg.morpheus_token || '')
          setSaved(true)
          onSaved?.(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setError(null)
    if (!url.trim() || !token.trim()) {
      setError('Both Morpheus URL and API token are required.')
      return
    }
    setSaving(true)
    try {
      await saveMorpheusConfig(auth, {
        morpheus_url: url.trim(),
        morpheus_token: token.trim(),
      })
      setSaved(true)
      onSaved?.(true)
    } catch (e) {
      setError(e?.message || 'Failed to save config.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--tx-muted)', fontSize: 13 }}>
        Loading saved config…
      </div>
    )
  }

  /* ── Viewer: read-only message ── */
  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--tx-muted)', margin: 0 }}>
          Morpheus connection settings are managed by your administrator.
          You can continue to the next step.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'rgba(72,199,142,0.08)',
          border: '1px solid var(--status-ok)',
          borderRadius: 8, fontSize: 13,
        }}>
          <span style={{ color: 'var(--status-ok)', fontSize: 18 }}>✓</span>
          <span>Morpheus connection is configured. You're good to go.</span>
        </div>
      </div>
    )
  }

  /* ── Admin: editable form ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', margin: 0 }}>
        Enter your Morpheus instance URL and API token. These are stored securely
        in the database and used for all Morpheus API calls.
      </p>

      {/* Morpheus URL */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-muted)', display: 'block', marginBottom: 6 }}>
          MORPHEUS URL
        </label>
        <div className="input-wrap">
          <i className="ti ti-link" aria-hidden="true" />
          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setSaved(false); onSaved?.(false) }}
            placeholder="https://your-morpheus-instance"
            autoComplete="off"
          />
        </div>
      </div>

      {/* API Token */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-muted)', display: 'block', marginBottom: 6 }}>
          API TOKEN
        </label>
        <div className="input-wrap">
          <i className="ti ti-key" aria-hidden="true" />
          <input
            type="password"
            value={token}
            onChange={e => { setToken(e.target.value); setSaved(false); onSaved?.(false) }}
            placeholder="Bearer token"
            autoComplete="off"
          />
        </div>
      </div>

      {error && (
        <div className="login-error">{error}</div>
      )}

      {/* Save button + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="m-btn m-btn-action"
          onClick={handleSave}
          disabled={saving || !url.trim() || !token.trim()}
          style={{ minWidth: 140 }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Connection'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--status-ok)' }}>
            Config saved — you can continue or update and re-save.
          </span>
        )}
      </div>
    </div>
  )
}
