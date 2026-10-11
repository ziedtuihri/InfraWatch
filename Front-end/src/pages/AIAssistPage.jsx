import React, { useEffect, useState } from 'react'
import Topbar from '../components/ui/Topbar'
import { MBtn } from '../components/ui/Primitives'

const NAV = [
  { id: 'analysis',    label: 'AI Analysis',        icon: '📊', desc: 'Ask about your resources, alerts and metrics.' },
  { id: 'vm-creation', label: 'Advanced VM Creation', icon: '🖥', desc: 'Describe the VM you need and let AI prepare it.' },
]

function pageFromPath() {
  const seg = window.location.pathname.split('/')[2]
  return NAV.some(n => n.id === seg) ? seg : 'analysis'
}

/* ── Placeholder pages: replace the bodies with your real UI ── */
function AnalysisPage({ state, act }) {
  return (
    <div>
      {/* chat / analysis UI goes here */}
    </div>
  )
}

function VMCreationPage({ state, act }) {
  return (
    <div>
      {/* VM creation form / AI prompt goes here */}
    </div>
  )
}

export default function AIAssistPage({ state, act }) {
  const [page, setPage] = useState(pageFromPath)

  useEffect(() => {
    if (state?.auth?.status !== 'authed') act('SET_SCREEN', { screen: 'login' })
  }, [state?.auth?.status])

  // Keep the sidebar in sync with browser back/forward
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname.startsWith('/ai-assist')) setPage(pageFromPath())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function go(id) {
    if (id === page) return
    window.history.pushState({}, '', `/ai-assist/${id}`)
    setPage(id)
  }

  function goBack() {
    // Always return to the portal, not to the previous sub-page
    window.history.pushState({}, '', '/portal')
    act('SET_SCREEN', { screen: 'portal' })
  }

  const current = NAV.find(n => n.id === page)

  return (
    <div className="app-shell">
      <Topbar state={state} act={act} inPortal={false} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── SIDEBAR ── */}
        <aside style={{
          width: 230, flexShrink: 0, padding: 14,
          background: 'var(--card-bg)',
          borderRight: '1px solid var(--card-border)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <MBtn sm onClick={goBack} style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
            ← Back
          </MBtn>

          <div style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em',
            color: 'var(--tx-muted)', margin: '0 6px 4px',
          }}>
            AI Assist
          </div>

          {NAV.map(n => {
            const active = n.id === page
            return (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  background: active ? 'var(--accent-bg)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--tx-second)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all .15s',
                }}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            )
          })}
        </aside>

        {/* ── CONTENT ── */}
        <main style={{ flex: 1, minWidth: 0, padding: '20px 28px', overflowY: 'auto' }}>
          <h2 style={{ margin: '0 0 6px' }}>{current.label}</h2>
          <p style={{ fontSize: 13, color: 'var(--tx-muted)', margin: '0 0 18px' }}>
            {current.desc}
          </p>

          {page === 'analysis'    && <AnalysisPage   state={state} act={act} />}
          {page === 'vm-creation' && <VMCreationPage state={state} act={act} />}
        </main>
      </div>
    </div>
  )
}