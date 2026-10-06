import React, { useEffect, useState } from 'react'
import Topbar from '../ui/Topbar'
import StepBar from './StepBar'
import StepResources from './StepResources'
import StepTools from './StepTools'
import StepDashboards from './StepDashboards'
import StepReview from './StepReview'
import { MBtn } from '../ui/Primitives'

import { TaskPrometheus } from '../../api/TaskPrometheus'

const STEP_TITLES = [
  'Select Morpheus Resources',
  'Select Collection Tools',
  'Choose Dashboards',
  'Review & Launch',
]

function canNext(state) {
  const { step, selResources, toolConfig, dashboardConfig } = state

  if (step === 1) return selResources.length > 0

  if (step === 2) {
    return Object.values(toolConfig || {}).some(cfg =>
      Object.keys(cfg.metrics || {}).length > 0 ||
      Object.keys(cfg.logs || {}).length > 0
    )
  }

  if (step === 3) {
    return Object.values(dashboardConfig || {}).some(list => list.length > 0)
  }

  return true
}

export default function SetupWizard({ state, act }) {
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState(null)

  useEffect(() => {
    if (state?.auth?.status !== 'authed') {
      act('SET_SCREEN', { screen: 'login' })
    }
  }, [state?.auth?.status])

  useEffect(() => {
    if (state.screen !== 'setup') return

    const stepFromUrl = Number(
      new URL(window.location).searchParams.get('step')
    )

    if (stepFromUrl) {
      act('SET_STEP', { step: stepFromUrl })
    }
  }, [state.screen])

  useEffect(() => {
    function handlePopState() {
      if (state.screen !== 'setup') return

      const stepFromUrl = Number(
        new URL(window.location).searchParams.get('step')
      )

      if (stepFromUrl) {
        act('SET_STEP', { step: stepFromUrl })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [state.screen])

  function goToStep(step) {
    const url = new URL(window.location)
    url.searchParams.set('step', step)
    window.history.pushState({ step }, '', url)
    act('SET_STEP', { step })
  }

  async function handleNext() {
    if (state.step < 4) {
      goToStep(state.step + 1)
      return
    }

    const tasks = [
      {
        id: 1,
        name: 'Install Prometheus',
        payload: {
          job: {
            targetType: 'instance',
            instances: [37],
          },
        },
      },
      {
        id: 12,
        name: 'Configure Prometheus',
        payload: {
          job: {
            targetType: 'instance',
            instances: [37],
          },
        },
      },
      {
        id: 16,
        name: 'Install Node Exporter',
        payload: {
          job: {
            targetType: 'instance',
            instances: [37],
            customOptions: {
              EXPORTER_NAME: 'node_exporter',
              FILE_ID: '220',
              EXEC_START: '/opt/node_exporter/node_exporter',
            },
          },
        },
      },
      {
        id: 8,
        name: 'Configure Node Exporter Target',
        payload: {
          job: {
            targetType: 'instance',
            instances: [37],
            customOptions: {
              TARGET: '10.202.52.96:9100',
              JOB_NAME: 'node_exporter',
            },
          },
        },
      },
      {
        id: 17,
        name: 'Configure Grafana Dashboard',
        payload: {
          job: {
            targetType: "server",
            servers: [4],
            customOptions: {
              MYIP: "10.202.52.96"
            },
          },
        },
      },
    ]

    setLaunchError(null)
    setLaunching(true)

    try {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const allResults = []

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]

        try {
          const taskResponse = await TaskPrometheus(task.id, task.payload)

          allResults.push({
            taskId: task.id,
            taskName: task.name,
            status: 'success',
            response: taskResponse,
          })
        } catch (taskErr) {
          const errorMsg = taskErr?.message || String(taskErr)

          allResults.push({
            taskId: task.id,
            taskName: task.name,
            status: 'failed',
            error: errorMsg,
          })
        }

        if (i < tasks.length - 1) {
          await delay(20000)
        }
      }

      const allSuccessful = allResults.every(r => r.status === 'success')

      if (!allSuccessful) {
        const failedTasks = allResults.filter(r => r.status === 'failed')
        throw new Error(
          failedTasks.map(t => `${t.taskName} (${t.taskId})`).join(', ')
        )
      }

      act('LAUNCH')

    } catch (err) {
      setLaunchError(err?.message || String(err))
    } finally {
      setLaunching(false)
    }
  }

  function handleBack() {
    if (state.step > 1) {
      goToStep(state.step - 1)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar state={state} act={act} inPortal={false} />

      <div className="wiz-wrap">

        <div style={{ width: '100%', maxWidth: 800, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            InfraWatch Setup
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx-muted)' }}>
            Configure your monitoring stack — follow the steps below
          </div>
        </div>

        <StepBar current={state.step} />

        <div className="wiz-card fade-up" key={state.step}>

          <div className="wiz-card-header">
            <div className="wiz-step-num">{state.step}</div>
            <div>
              <div className="wiz-step-title">
                {STEP_TITLES[state.step - 1]}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx-muted)' }}>
              Step {state.step} of 4
            </div>
          </div>

          <div className="wiz-body">

            {state.step === 1 && (
              <StepResources
                selResources={state.selResources}
                act={act}
              />
            )}

            {state.step === 2 && (
              <StepTools
                selectedResources={state.selResources}
                allResources={state.resources}
                currentResourceId={state.currentResourceId}
                setCurrentResourceId={id =>
                  act('SET_CURRENT_RESOURCE', { id })
                }
                toolConfig={state.toolConfig}
                expandedTools={state.expandedTools}
                act={act}
                state={state}
              />
            )}

            {/* ✅ ✅ ONLY FIX HERE */}
            {state.step === 3 && (
              <StepDashboards
                selectedResources={state.selResources}
                currentResourceId={state.currentResourceId}
                setCurrentResourceId={id =>
                  act('SET_CURRENT_RESOURCE', { id })
                }
                dashboardConfig={state.dashboardConfig}
                grafanaConfig={state.grafanaConfig} // ✅ FIX
                allResources={state.resources}
                act={act}
              />
            )}

            {state.step === 4 && (
              <StepReview state={state} />
            )}

          </div>

          {launchError && (
            <div style={{
              margin: '0 20px 12px',
              padding: '12px 14px',
              fontSize: 12,
              color: 'var(--status-crit)',
              border: '1px solid var(--status-crit)',
              borderRadius: 4,
              backgroundColor: 'rgba(210, 25, 25, 0.05)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
            }}>
              Provisioning failed:
              <br />
              {launchError}
            </div>
          )}

          <div className="wiz-footer">
            <MBtn
              onClick={handleBack}
              style={{ visibility: state.step === 1 ? 'hidden' : 'visible' }}
              disabled={launching}
            >
              ← Back
            </MBtn>

            <MBtn
              action
              onClick={handleNext}
              disabled={!canNext(state) || launching}
            >
              {launching
                ? 'Running Morpheus tasks…'
                : state.step === 4
                  ? 'Launch Portal →'
                  : 'Continue →'}
            </MBtn>
          </div>

        </div>
      </div>
    </div>
  )
}

