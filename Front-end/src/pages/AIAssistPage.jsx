import React, { useEffect } from 'react'
import Topbar from '../components/ui/Topbar'
import { MBtn } from '../components/ui/Primitives'

export default function AIAssistPage({ state, act }) {
  useEffect(() => {
    if (state?.auth?.status !== 'authed') act('SET_SCREEN', { screen: 'login' })
  }, [state?.auth?.status])

  function goBack() {
    // Returns to wherever the user came from (portal tab or setup step).
    // If the page was opened directly, fall back to the portal.
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.history.pushState({}, '', '/portal')
      act('SET_SCREEN', { screen: 'portal' })
    }
  }

  return (
    <div className="app-shell">
      <Topbar state={state} act={act} inPortal={false} />
      <div className="page-wrap">
        <div className="page-inner">
          <MBtn sm onClick={goBack}>← Back</MBtn>
          <h2 style={{ margin: '16px 0 8px' }}>AI Assist</h2>
          <p style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            Ask about your resources, alerts, and metrics.
          </p>
          {/* chat UI goes here */}
        </div>
      </div>
    </div>
  )
}