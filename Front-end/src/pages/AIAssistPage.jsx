import React from 'react'

export default function AIAssistPage({ act }) {
  return (
    <div className="page-wrap">
      <div className="page-inner">
        <button className="m-theme-btn" onClick={() => {
          window.history.pushState({}, '', '/portal')
          act('SET_SCREEN', { screen: 'portal' })
        }}>
          ← Back to portal
        </button>
        <h2 style={{ marginTop: 16 }}>AI Assist</h2>
        {/* chat UI goes here */}
      </div>
    </div>
  )
}