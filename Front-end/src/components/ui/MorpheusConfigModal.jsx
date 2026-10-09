import React, { useState, useEffect } from 'react'
import { getMorpheusConfig, saveMorpheusConfig } from '../../api/morpheusConfig'

export default function MorpheusConfigModal({ auth, onDone }) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Pre-fill if config already exists
  useEffect(() => {
    getMorpheusConfig(auth)
      .then(cfg => {
        if (cfg) {
          setUrl(cfg.morpheus_url || '')
          setToken(cfg.morpheus_token || '')
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
      onDone()
    } catch (e) {
      setError(e?.message || 'Failed to save config.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '28px 32px',
        width: '100%', maxWidth: 480,
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
            🔌 Morpheus Connection
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            Enter your Morpheus API URL and token. These are stored securely and used for all API calls.
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tx-muted)', fontSize: 13 }}>
            Loading saved config…
          </div>
        ) : (
          <>
            {/* URL field */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-muted)', display: 'block', marginBottom: 6 }}>
                MORPHEUS URL
              </label>
              <div className="input-wrap">
                <i className="ti ti-link" aria-hidden="true" />
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://your-morpheus-instance"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Token field */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-muted)', display: 'block', marginBottom: 6 }}>
                API TOKEN
              </label>
              <div className="input-wrap">
                <i className="ti ti-key" aria-hidden="true" />
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Bearer token"
                  autoComplete="off"
                />
              </div>
            </div>

            {error && (
              <div className="login-error" style={{ marginBottom: 14 }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="m-btn m-btn-ghost"
                onClick={onDone}
                disabled={saving}
              >
                Skip for now
              </button>
              <button
                className="m-btn m-btn-action"
                onClick={handleSave}
                disabled={saving || !url.trim() || !token.trim()}
              >
                {saving ? 'Saving…' : 'Save & Continue →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
