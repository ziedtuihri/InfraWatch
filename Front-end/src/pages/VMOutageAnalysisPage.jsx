import React from 'react'
import { useVMOutageAnalysis } from '../api/useVMOutageAnalysis'
import { ErrorBanner, LoadingRow } from '../components/ui/LoadingSpinner'

function riskColor(percent) {
  if (percent >= 70) return 'var(--status-crit)'
  if (percent >= 35) return 'var(--status-warn)'
  return 'var(--status-ok)'
}

export default function VMOutageAnalysisPage() {
  const { analysis, error, loading } = useVMOutageAnalysis()
  const vms = analysis?.vms ?? []

  return (
    <section>
      <p style={{ fontSize: 13, color: 'var(--tx-muted)', margin: '0 0 14px' }}>
        Current outage likelihood for every Docker VM, refreshed every 10 seconds.
        Running VMs are scored from CPU and memory; stopped VMs are shown as 100%.
      </p>

      <div
        role="note"
        className="m-card"
        style={{ padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--tx-muted)' }}
      >
        This model is trained on synthetic outage labels derived from CPU and memory
        thresholds with seeded noise. Percentages are model estimates, not historical
        outage rates.
      </div>

      {error && <ErrorBanner error={`VM outage analysis unavailable: ${error}`} />}
      {loading ? (
        <LoadingRow message="Analyzing VM metrics…" />
      ) : error && !analysis ? null : vms.length === 0 ? (
        <div className="m-card" style={{ padding: 16, fontSize: 13, color: 'var(--tx-muted)' }}>
          No virtual machines found.
        </div>
      ) : (
        <div className="m-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--card-border)' }}>
                <th style={{ padding: '11px 12px' }}>Virtual machine</th>
                <th style={{ padding: '11px 12px' }}>Status</th>
                <th style={{ padding: '11px 12px' }}>CPU</th>
                <th style={{ padding: '11px 12px' }}>Memory</th>
                <th style={{ padding: '11px 12px', minWidth: 210 }}>Outage likelihood</th>
              </tr>
            </thead>
            <tbody>
              {vms.map(vm => {
                const probability = Number(vm.outage_probability_pct)
                const color = riskColor(probability)
                return (
                  <tr key={vm.id ?? vm.name} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '11px 12px', fontWeight: 600 }}>
                      {vm.name || 'Unnamed VM'}
                    </td>
                    <td style={{ padding: '11px 12px', textTransform: 'capitalize' }}>
                      {vm.status || 'unknown'}
                    </td>
                    <td style={{ padding: '11px 12px' }}>{vm.cpu_percent ?? '—'}%</td>
                    <td style={{ padding: '11px 12px' }}>{vm.memory_percent ?? '—'}%</td>
                    <td style={{ padding: '11px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          aria-label={`${probability}% outage likelihood`}
                          role="img"
                          style={{
                            flex: 1,
                            height: 7,
                            borderRadius: 5,
                            background: 'var(--divider)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, probability))}%`,
                              height: '100%',
                              background: color,
                            }}
                          />
                        </div>
                        <strong style={{ minWidth: 48, textAlign: 'right', color }}>
                          {probability.toFixed(2)}%
                        </strong>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {analysis?.generated_at && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx-muted)' }}>
          Last analyzed: {new Date(analysis.generated_at).toLocaleTimeString()}
        </div>
      )}
    </section>
  )
}
