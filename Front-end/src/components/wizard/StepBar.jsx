import React from 'react'

const STEPS = ['Connection', 'Resources', 'Tools', 'Dashboards', 'Review']

export default function StepBar({ current }) {
  return (
    <div className="step-bar">
      {STEPS.map((s, i) => {
        const n = i + 1, done = n < current, active = n === current
        const cc = done ? 'done' : active ? 'active' : 'idle'
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={`step-circ ${cc}`}>{done ? '✓' : n}</div>
              <span className={`step-lbl ${cc}`}>{s}</span>
            </div>
            {n < STEPS.length && <div className={`step-line ${done ? 'done' : 'idle'}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}
