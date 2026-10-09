import React, { useEffect, useState } from 'react'
import Topbar from '../ui/Topbar'
import StepBar from './StepBar'
import StepMorpheus from './StepMorpheus'
import StepResources from './StepResources'
import StepTools from './StepTools'
import StepDashboards from './StepDashboards'
import StepReview from './StepReview'
import { MBtn } from '../ui/Primitives'

import { TaskPrometheus } from '../../api/TaskPrometheus'
import { saveSession } from '../../api/morpheusConfig'
import { resolveServerId } from '../../api/morpheus'
import { newRunId, createTaskRun, updateTaskRun } from '../../api/taskRuns'

const TOTAL_STEPS = 5

const DEMO_MODE = true

// Backend API base — same env var the rest of the app uses.
const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`

// Resolve a grafana.com template id to its imported dashboard UID via the
// backend. Used as a fallback when task 18's stdout didn't echo the UID.
async function resolveGrafanaUid(entry) {
  const str = String(entry || '').trim()
  if (!str) return null
  if (!/^\d+$/.test(str)) return { uid: str, title: str }  // already a uid
  try {
    const res = await fetch(`${API_BASE}/grafana/dashboard/${str}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.found) return { uid: data.uid, title: data.title || str }
  } catch { /* ignore */ }
  return null
}

const STEP_TITLES = [
  'Morpheus Connection',
  'Select Morpheus Resources',
  'Select Collection Tools',
  'Choose Dashboards',
  'Review & Launch',
]

/**
 * Build the Prometheus/Node-exporter/Grafana provisioning pipeline for one
 * specific resource. Replaces the old hardcoded instance/server ids.
 */
/**
 * Try to pull a Grafana dashboard UID out of a Morpheus task-execute response.
 * Morpheus typically echoes the underlying script's stdout in a field like
 * `output` / `data.output` / `result.output`; we scan whatever text fields
 * exist for a UID-looking token (9 alphanumeric chars, Grafana's UID format)
 * or an explicit JSON line like {"uid":"abc123xyz"}.
 * Returns null if nothing matches — caller falls back to manual entry.
 */
function extractGrafanaUid(taskResponse) {
  if (!taskResponse) return null

  const textFields = [
    taskResponse.output,
    taskResponse.data?.output,
    taskResponse.result?.output,
    taskResponse.data?.result,
    typeof taskResponse === 'string' ? taskResponse : null,
  ].filter(Boolean)

  for (const text of textFields) {
    // Prefer an explicit {"uid":"..."} if the script printed Grafana's import response
    const jsonUidMatch = text.match(/"uid"\s*:\s*"([a-zA-Z0-9_-]{6,40})"/)
    if (jsonUidMatch) return jsonUidMatch[1]

    // Fall back to a line like "Dashboard UID: abc123xyz" or "UID=abc123xyz"
    const labelMatch = text.match(/uid[:=]\s*([a-zA-Z0-9_-]{6,40})/i)
    if (labelMatch) return labelMatch[1]
  }

  return null
}

// Grafana is installed on the LOCAL machine only (Morpheus server id = 4).
// Datasource tasks (17 for Prometheus, 22 for VM) + 18 must ALWAYS target this fixed server — never the target VMs.
const GRAFANA_SERVER_ID = 4

// ── VictoriaMetrics: task 6 installs the binary on the target instance ────────
// FILE_ID 229 is the VictoriaMetrics package in Morpheus virtual images.
// The bash script is made dynamic: MORPH_URL and AUTH_TOKEN are injected by
// Morpheus at runtime from the task's custom options, so we never hardcode them.
const VM_FILE_ID = '229'
const LOKI_FILE_ID = '234'      // Loki package in Morpheus virtual images
const LOKI_TASK_ID = 9          // "Install Loki" Morpheus task (runs on the central server)
const PROMTAIL_FILE_ID = '260'  // Promtail package in Morpheus virtual images
const PROMTAIL_TASK_ID = 20     // "Install Promtail" Morpheus task (runs per resource)
// Central log store lives on the InfraWatch/Grafana server (like Grafana
// itself). Promtail on each resource pushes to it. Derive the bare IP from
// VITE_GLOBAL_VM_ADRESS (e.g. "http://10.202.52.94" -> "10.202.52.94").
const SERVER_IP = (import.meta.env.VITE_GLOBAL_VM_ADRESS || '')
  .replace(/^https?:\/\//, '')
  .replace(/:\d+$/, '')
  || '10.202.52.94'

// VictoriaMetrics listens on :8428 (PromQL-compatible endpoint)
const VM_PORT = '8428'

/**
 * Build the full provisioning pipeline for one resource.
 *
 * The pipeline branches depending on which metric tool the user selected:
 *   prometheus  → tasks 1, 12, 16, 8,  17 (prom datasource), 18…
 *   victoria    → task  6,     16, 23, 22 (vm  datasource),  18…
 *
 * @param {object}   resource         - Normalised Morpheus resource
 * @param {string[]} grafanaTemplateIds - Grafana dashboard ids/uids to import
 * @param {object}   metricTools      - toolConfig.metrics for this resource
 *                                      e.g. { prometheus: [], victoria: [] }
 */
async function buildTaskPipeline(resource, grafanaTemplateIds = [], metricTools = {}, logsTools = {}) {
  const instanceId = Number(resource.id)
  const ip         = resource.ip || resource.name   // Prometheus/VM scrape target

  const templateIds    = grafanaTemplateIds
  const useVictoria    = 'victoria'   in metricTools
  const usePrometheus  = 'prometheus' in metricTools

  // Which exporters did the user select for the active engine? metricTools
  // values are arrays of exporter ids, e.g. { victoria: ['node','blackbox'] }.
  const selectedExporters = [
    ...(Array.isArray(metricTools.prometheus) ? metricTools.prometheus : []),
    ...(Array.isArray(metricTools.victoria)   ? metricTools.victoria   : []),
  ]
  const useBlackbox = selectedExporters.includes('blackbox')

  // ── Grafana server tasks (always run on local server id=4) ───────────────
  // Datasource tasks — one PER selected engine, so when the user picks both
  // Prometheus AND VictoriaMetrics, BOTH datasources get registered (and the
  // dashboard then offers a button for each). Task 17 = Prometheus (:9090),
  // task 22 = VictoriaMetrics (:8428).
  const datasourceTasks = []
  if (usePrometheus) {
    datasourceTasks.push({
      id: 17,
      name: 'Configure Grafana Datasource (Prometheus)',
      payload: {
        job: {
          targetType: 'server',
          servers: [GRAFANA_SERVER_ID],
          customOptions: { MYIP: ip, DATASOURCE_URL: `http://${ip}:9090` },
        },
      },
    })
  }
  if (useVictoria) {
    datasourceTasks.push({
      id: 22,
      name: 'Configure Grafana Datasource (VictoriaMetrics)',
      payload: {
        job: {
          targetType: 'server',
          servers: [GRAFANA_SERVER_ID],
          customOptions: { MYIP: ip, DATASOURCE_URL: `http://${ip}:${VM_PORT}` },
        },
      },
    })
  }

  // Dashboard import (task 18) runs once per template — shared across engines.
  // Datasource is URL-driven in the dashboard, so DS_NAME just needs to be a
  // valid datasource to satisfy the importer; the iframe picks the actual one
  // per-engine at view time. Prefer Prometheus name when present.
  const dsNameForImport = usePrometheus ? `Prometheus-${ip}` : `VictoriaMetrics-${ip}`

  const serverTasks = [
    ...datasourceTasks,
    ...templateIds.map(templateId => ({
      id: 18,
      name: `Add Grafana Template ${templateId}`,
      payload: {
        job: {
          targetType: 'server',
          servers: [GRAFANA_SERVER_ID],
          customOptions: {
            TEMPLATE_ID: String(templateId),
            DS_NAME: dsNameForImport,
            // naming: "VictoriaMetrics-<ip>" or "Prometheus-<ip>".
            DS_NAME: dsNameForImport,
          },
        },
      },
    })),
  ]

  // ── Node Exporter install (shared by both Prometheus and VictoriaMetrics) ──
  const nodeExporterInstall = {
    id: 16,
    name: 'Install Node Exporter',
    payload: {
      job: {
        targetType: 'instance',
        instances: [instanceId],
        customOptions: {
          EXPORTER_NAME: 'node_exporter',
          FILE_ID: '220',
          EXEC_START: '/opt/node_exporter/node_exporter',
        },
      },
    },
  }

  // Prometheus scrape-target injector (task 8). This writes to
  // /opt/prometheus/prometheus.yml and restarts the prometheus service —
  // it is PROMETHEUS-SPECIFIC and must NOT run in the VictoriaMetrics
  // pipeline (a VM-only host has no prometheus.yml / prometheus service).
  // VictoriaMetrics gets its scrape target from the install script's
  // -promscrape.config instead.
  const prometheusScrapeTask = {
    id: 8,
    name: 'Configure Scrape Target',
    payload: {
      job: {
        targetType: 'instance',
        instances: [instanceId],
        customOptions: {
          TARGET:   `${ip}:9100`,
          JOB_NAME: 'node_exporter',
        },
      },
    },
  }

  // VictoriaMetrics scrape-target injector (task 23) — the VM equivalent of
  // the Prometheus "Direct Scrape" task 8. Appends the node_exporter target
  // to VM's scrape config (/opt/victoria_metrics/scrape.yml) and restarts
  // VM. Same TARGET/JOB_NAME contract as task 8, just pointed at VM's config
  // and service. This is what makes node_exporter actually get scraped —
  // the install task (6) only sets up an empty base config.
  const vmScrapeTask = {
    id: 23,
    name: 'Configure VM Scrape Target',
    payload: {
      job: {
        targetType: 'instance',
        instances: [instanceId],
        customOptions: {
          TARGET:   `${ip}:9100`,
          JOB_NAME: 'node_exporter',
        },
      },
    },
  }

  // ── Blackbox exporter (optional, when 'blackbox' is selected) ────────────
  // Install goes through the UNIFIED installer (task 16) — the same task
  // node_exporter uses — with NEEDS_CONFIG=true so it drops the blackbox
  // module config and auto-attaches it to ExecStart. No separate install
  // script needed. The scrape-inject (task 24) then appends the canonical
  // blackbox /probe jobs to whichever scraper config applies (Prometheus
  // or VM). ENGINE tells the injector which config to edit.
  //
  // Blackbox config: http_2xx + icmp modules (icmp needs root, which the
  // installer's service runs as). The installer writes this to
  // /opt/blackbox_exporter/blackbox_exporter.yml and appends
  // --config.file=<that> to ExecStart automatically.
  const blackboxConfig = [
    'modules:',
    '  http_2xx:',
    '    prober: http',
    '    timeout: 5s',
    '    http:',
    '      method: GET',
    '      preferred_ip_protocol: ip4',
    '      fail_if_not_ssl: false',
    '      tls_config:',
    '        insecure_skip_verify: true',   // Morpheus appliance uses a self-signed cert
    '  icmp:',
    '    prober: icmp',
    '    timeout: 5s',
    '    icmp:',
    '      preferred_ip_protocol: ip4',
  ].join('\n')

  // Which engines was blackbox selected for? metricTools.<engine> is the
  // array of exporter ids chosen for that engine.
  const blackboxOnProm = Array.isArray(metricTools.prometheus) && metricTools.prometheus.includes('blackbox')
  const blackboxOnVm   = Array.isArray(metricTools.victoria)   && metricTools.victoria.includes('blackbox')

  const blackboxInstall = {
    id: 16,
    name: 'Install Blackbox Exporter',
    payload: {
      job: {
        targetType: 'instance',
        instances: [instanceId],
        customOptions: {
          EXPORTER_NAME:  'blackbox_exporter',
          FILE_ID:        '225',
          // No .yml here → installer auto-appends --config.file. Listen on 9115.
          EXEC_START:     '/opt/blackbox_exporter/blackbox_exporter --web.listen-address=:9115',
          NEEDS_CONFIG:   'true',
          CONFIG_CONTENT: blackboxConfig,
        },
      },
    },
  }
  // One scrape-inject task per engine blackbox is configured for, so a
  // blackbox-on-both setup registers blackbox probes in BOTH scrapers.
  const blackboxScrapeFor = engine => ({
    id: 24,
    name: `Configure Blackbox Scrape (${engine === 'victoria' ? 'VictoriaMetrics' : 'Prometheus'})`,
    payload: {
      job: {
        targetType: 'instance',
        instances: [instanceId],
        customOptions: {
          TARGET:      ip,
          BB_ADDRESS:  `${ip}:9115`,
          ENGINE:      engine,
          HTTP_TARGET: 'https://projet1-virtual-machine',
        },
      },
    },
  })
  const blackboxScrapeTasks = []
  if (blackboxOnProm) blackboxScrapeTasks.push(blackboxScrapeFor('prometheus'))
  if (blackboxOnVm)   blackboxScrapeTasks.push(blackboxScrapeFor('victoria'))
  const blackboxTasks = useBlackbox ? [blackboxInstall, ...blackboxScrapeTasks] : []

  // ── Compose the pipeline from per-engine blocks ──────────────────────────
  // Previously this was an either/or branch (useVictoria ? VM : Prometheus),
  // so selecting BOTH engines silently ran only VictoriaMetrics. Now each
  // engine contributes its own install + scrape tasks, so picking both gives
  // both datasources (and the dashboard shows a button per datasource).
  // node_exporter install (task 16) is shared — installed once.
  const pipeline = []

  // Prometheus engine: install + configure prometheus, then its node scrape.
  if (usePrometheus) {
    pipeline.push(
      {
        id: 1,
        name: 'Install Prometheus',
        payload: { job: { targetType: 'instance', instances: [instanceId] } },
      },
      {
        id: 12,
        name: 'Configure Prometheus',
        payload: { job: { targetType: 'instance', instances: [instanceId] } },
      },
    )
  }

  // VictoriaMetrics engine: install VM.
  if (useVictoria) {
    pipeline.push({
      id: 6,
      name: 'Install VictoriaMetrics',
      payload: {
        job: {
          targetType: 'instance',
          instances: [instanceId],
          customOptions: { FILE_ID: VM_FILE_ID, MYIP: ip },
        },
      },
    })
  }

  // node_exporter installed once (shared by both engines).
  //pipeline.push(nodeExporterInstall)

  // Each engine scrapes node_exporter into its own config.
  //if (usePrometheus) pipeline.push(prometheusScrapeTask)
  //if (useVictoria)   pipeline.push(vmScrapeTask)

  // Blackbox (optional) — its scrape goes into the configured engine(s).
  // pipeline.push(...blackboxTasks)

  // ── Logs: install Loki when selected ─────────────────────────────────────
  // toolConfig.logs looks like { loki: ['promtail', ...] }. When Loki is
  // chosen, install it on the instance (it listens on :3100 and the Logs Page
  // queries it via the backend). The shipper (Promtail) will be added as a
  // follow-up task once its package/FILE_ID exists, same pattern as the others.
  // ── Logs: centralized Loki + per-resource Promtail ───────────────────────
  // Architecture mirrors Grafana: ONE central Loki on the InfraWatch server
  // (id=4), and each resource runs Promtail that PUSHES its logs to that
  // central Loki. So the Logs Page always queries one place, and logs from
  // every resource are searchable together.
  //   - Loki     : server task (central, :3100). Idempotent install — safe to
  //                re-run; it cleans + reinstalls.
  //   - Promtail : instance task. Config points at http://<server>:3100, runs
  //                as root (to read /var/log), labels streams with this host.
  /*
  const useLoki = 'loki' in (logsTools || {})
  if (useLoki) {
    pipeline.push({
      id: LOKI_TASK_ID,
      name: 'Install Loki (central)',
      payload: {
        job: {
          targetType: 'server',
          servers: [GRAFANA_SERVER_ID],
          customOptions: { FILE_ID: LOKI_FILE_ID, MYIP: SERVER_IP },
        },
      },
    })
    pipeline.push({
      id: PROMTAIL_TASK_ID,
      name: 'Install Promtail',
      payload: {
        job: {
          targetType: 'instance',
          instances: [instanceId],
          customOptions: {
            FILE_ID:   PROMTAIL_FILE_ID,
            MYIP:      ip,            // this resource's IP — used as a stream label
            LOKI_HOST: SERVER_IP,     // where to push logs (central Loki)
            HOSTNAME:  resource.name, // friendly label for the Logs Page filter
          },
        },
      },
    })
  }
*/
  // Grafana datasource(s) + dashboards.
  //pipeline.push(...serverTasks)

  return pipeline
}

function canNext(state, morpheusSaved) {
  const { step, selResources, toolConfig, dashboardConfig, auth } = state
  // superadmin must pass every check admin passes
  const isAdmin = auth?.user?.role === 'admin' || auth?.user?.role === 'superadmin'

  if (step === 1) {
    if (!isAdmin) return true
    return morpheusSaved
  }

  if (step === 2) return selResources.length > 0

  if (step === 3) {
    if (!isAdmin) return true   // viewer never configures tools — always pass through
    return Object.values(toolConfig || {}).some(cfg =>
      Object.keys(cfg.metrics || {}).length > 0 ||
      Object.keys(cfg.logs   || {}).length > 0
    )
  }

  if (step === 4) {
    return Object.values(dashboardConfig || {}).some(list => list.length > 0)
  }

  return true
}

export default function SetupWizard({ state, act }) {
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState(null)
  const [launchProgress, setLaunchProgress] = useState([])  // [{resourceId, resourceName, taskId, taskName, status}]
  const cancelRef = React.useRef(false)

  // Track whether Morpheus config has been saved (for canNext on step 1)
  const [morpheusSaved, setMorpheusSaved] = useState(false)

  useEffect(() => {
    if (state?.auth?.status !== 'authed') {
      act('SET_SCREEN', { screen: 'login' })
    }
  }, [state?.auth?.status])

  useEffect(() => {
    if (state.screen !== 'setup') return
    const parts = window.location.pathname.split('/')
    if (parts[1] === 'setup') {
      const n = parseInt(parts[2], 10)
      if (n >= 1 && n <= 5) act('SET_STEP', { step: n })
    }
  }, [state.screen])

  useEffect(() => {
    function handlePopState() {
      if (state.screen !== 'setup') return
      const parts = window.location.pathname.split('/')
      if (parts[1] === 'setup') {
        const n = parseInt(parts[2], 10)
        if (n >= 1 && n <= 5) act('SET_STEP', { step: n })
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [state.screen])

  function goToStep(step) {
    window.history.pushState({ step }, '', `/setup/${step}`)
    act('SET_STEP', { step })
  }



  async function handleNext() {

if (state.step < TOTAL_STEPS) {
    goToStep(state.step + 1)
    return
  }

  const selectedResources = (state.resources || [])
    .filter(r => state.selResources.includes(r.id))

  if (selectedResources.length === 0) {
    setLaunchError('No resources selected.')
    return
  }

  setLaunchError(null)
  setLaunching(true)

  const demoProgress = selectedResources.flatMap(resource => {
    const metricTools = state.toolConfig?.[resource.id]?.metrics || {}
    const logsTools = state.toolConfig?.[resource.id]?.logs || {}
    const grafana = state.grafanaConfig?.[resource.id] || {}
    const templates = grafana.mode === 'template' ? grafana.uids || [] : []

    return buildTaskPipeline(
      resource,
      templates,
      metricTools,
      logsTools
    ).then
      ? []
      : []
  })

  // Build the selected tasks without executing them.
  const progress = (
    await Promise.all(
      selectedResources.map(async resource => {
        const metricTools = state.toolConfig?.[resource.id]?.metrics || {}
        const logsTools = state.toolConfig?.[resource.id]?.logs || {}
        const grafana = state.grafanaConfig?.[resource.id] || {}
        const templates =
          grafana.mode === 'template' ? grafana.uids || [] : []

        const tasks = await buildTaskPipeline(
          resource,
          templates,
          metricTools,
          logsTools
        )

        return tasks.map(task => ({
          resourceId: resource.id,
          resourceName: resource.name,
          taskId: task.id,
          taskName: task.name,
          status: 'success',
          detail: 'Completed successfully (demo)'
        }))
      })
    )
  ).flat()

  setLaunchProgress(
    progress.map((task, seq) => ({ ...task, seq }))
  )

  setLaunching(false)
    
    /*
    if (state.step < TOTAL_STEPS) {
      goToStep(state.step + 1)
      return
    }

    // ── Step 5: Launch ────────────────────────────────────────────────────
    const selectedResources = (state.resources || []).filter(r => state.selResources.includes(r.id))

    if (selectedResources.length === 0) {
      setLaunchError('No resources selected — go back to step 2.')
      return
    }

    setLaunchError(null)
    setLaunching(true)
    cancelRef.current = false

    const runId = newRunId()
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const allResults = []

    // Resolve each resource's task pipeline upfront (this is where server-id
    // resolution happens) so we can show the full plan before any task runs,
    // and fail fast with a clear message if a resource's Server id can't be found.
    let resourcePipelines
    try {
      resourcePipelines = await Promise.all(
        selectedResources.map(async res => {
          const gCfg = state.grafanaConfig?.[res.id] || {}
          const templateIds = gCfg.mode === 'template' ? (gCfg.uids || []) : []
          // Pass selected metric tools so pipeline knows Prometheus vs VictoriaMetrics
          const metricTools = state.toolConfig?.[res.id]?.metrics || {}
          // Pass selected logs tools so the pipeline adds Loki (+ shipper later)
          const logsTools = state.toolConfig?.[res.id]?.logs || {}
          return { resource: res, tasks: await buildTaskPipeline(res, templateIds, metricTools, logsTools) }
        })
      )
    } catch (resolveErr) {
      setLaunchError(resolveErr?.message || String(resolveErr))
      setLaunching(false)
      return
    }

    // Seed progress UI immediately so the user sees the full plan before tasks start
    let _seq = 0
    const initialProgress = resourcePipelines.flatMap(({ resource: res, tasks }) =>
      tasks.map(task => ({
        seq: _seq++,                 // unique per task occurrence (task 16 is used twice)
        resourceId: res.id,
        resourceName: res.name,
        taskId: task.id,
        taskName: task.name,
        status: 'pending',
      }))
    )
    setLaunchProgress(initialProgress)

    // Key status updates by the unique seq, not (resourceId, taskId) — the
    // latter collides because node_exporter and blackbox both install via
    // task 16, which made one row's icon overwrite the other's.
    function setTaskStatusBySeq(seq, status, detail) {
      setLaunchProgress(prev => prev.map(p =>
        p.seq === seq ? { ...p, status, detail } : p
      ))
    }

    try {
      let seqCounter = 0
      outer:
      for (const { resource, tasks } of resourcePipelines) {
        for (let i = 0; i < tasks.length; i++) {
          if (cancelRef.current) {
            // Mark this and all remaining pending tasks as cancelled, then stop.
            setLaunchProgress(prev => prev.map(p =>
              p.status === 'pending' || p.status === 'running' ? { ...p, status: 'cancelled' } : p
            ))
            break outer
          }

          const task = tasks[i]
          const seq = seqCounter++   // matches initialProgress ordering exactly

          // Register pending row in DB for audit + cross-session progress polling
          const dbRowId = await createTaskRun(state.auth, {
            runId,
            resourceId: resource.id,
            taskId: task.id,
            taskName: `${task.name} — ${resource.name}`,
          })

          setTaskStatusBySeq(seq, 'running')
          await updateTaskRun(dbRowId, 'running')

          try {
            const taskResponse = await TaskPrometheus(task.id, task.payload)
            allResults.push({ resourceId: resource.id, resourceName: resource.name, taskId: task.id, taskName: task.name, status: 'success', response: taskResponse })
            setTaskStatusBySeq(seq, 'success')
            await updateTaskRun(dbRowId, 'success')

            // Task 18 provisions a Grafana dashboard from a marketplace template.
            // Task 18 imports the dashboard template. The UID resolution
            // for the iframe happens at DASHBOARD RENDER time (DashboardPage
            // resolves ids→uids and de-dupes), so we deliberately DON'T
            // rewrite the user's saved uids list here — StepReview should
            // show exactly what the user entered (e.g. "1860"), not a
            // translated uid. We just report the task outcome.
            if (task.id === 18) {
              const tplId = (task.payload?.job?.customOptions?.TEMPLATE_ID) || null
              let uid = extractGrafanaUid(taskResponse)
              if (!uid && tplId) {
                try {
                  const resolved = await resolveGrafanaUid(tplId)
                  if (resolved?.uid) uid = resolved.uid
                } catch { /* ignore — purely cosmetic for the status line */ }
                 /*
              }
              setTaskStatusBySeq(
                seq, 'success',
                uid ? `Dashboard ready (UID ${uid})` : 'Dashboard provisioned.'
              )
            }
          } catch (taskErr) {
            const msg = taskErr?.message || String(taskErr)
            allResults.push({ resourceId: resource.id, resourceName: resource.name, taskId: task.id, taskName: task.name, status: 'failed', error: msg })
            setTaskStatusBySeq(seq, 'failed', msg)
            await updateTaskRun(dbRowId, 'failed', msg)

            // A failed task breaks everything downstream of it for THIS
            // resource — e.g. if VM install (6) fails there's nothing to
            // scrape-configure (23) or point a datasource at (22), so
            // running them just produces a cascade of confusing secondary
            // failures. Mark the rest of this resource's tasks as skipped
            // and move on to the next resource, so the user sees clearly
            // "it broke HERE" instead of a wall of red. Other resources
            // are independent and still get their turn.
            for (let j = i + 1; j < tasks.length; j++) {
              allResults.push({
                resourceId: resource.id, resourceName: resource.name,
                taskId: tasks[j].id, taskName: tasks[j].name,
                status: 'skipped', error: `Skipped — "${task.name}" failed first`,
              })
              // seq for tasks[j] = current seq + (j - i), since seq advances
              // one per task in order.
              setTaskStatusBySeq(seq + (j - i), 'skipped', `Skipped — "${task.name}" failed`)
            }
            // Advance the counter past the skipped tasks so subsequent
            // resources' seqs stay aligned with initialProgress.
            seqCounter += (tasks.length - 1 - i)
            break  // stop this resource's pipeline, continue to next resource
          }

          const isLastTaskOverall =
            resource === resourcePipelines[resourcePipelines.length - 1].resource && i === tasks.length - 1
          if (!isLastTaskOverall) {
            // Most tasks settle quickly (2s). But scrape-config tasks (8 =
            // Prometheus, 23 = VictoriaMetrics) restart the scraper, and the
            // target only transitions DOWN→UP a few seconds later — the task
            // returns before the target is actually being scraped. Give those
            // extra settle time so the dashboard the user lands on has data
            // instead of empty panels needing a manual refresh.
            const SCRAPE_TASK_IDS = [8, 23, 24]
            const settleMs = SCRAPE_TASK_IDS.includes(task.id) ? 6000 : 2000
            const waitStart = Date.now()
            while (Date.now() - waitStart < settleMs) {
              if (cancelRef.current) break
              await delay(200)
            }
          }
        }
      }

      if (cancelRef.current) {
        setLaunchError('Provisioning cancelled by user.')
        return
      }

      const allSuccessful = allResults.every(r => r.status === 'success')
      if (!allSuccessful) {
        const failedTasks = allResults.filter(r => r.status === 'failed')
        const skippedCount = allResults.filter(r => r.status === 'skipped').length
        const failMsg = failedTasks.map(t => `${t.taskName} on ${t.resourceName} (task ${t.taskId})`).join(', ')
        const suffix = skippedCount > 0 ? ` — ${skippedCount} dependent task(s) skipped as a result` : ''
        throw new Error(`${failMsg}${suffix}`)
      }

      // Save wizard config snapshot to DB (non-blocking)
      try {
        await saveSession(state.auth, {
          selResources:    state.selResources,
          toolConfig:      state.toolConfig,
          dashboardConfig: state.dashboardConfig,
          grafanaConfig:   state.grafanaConfig,
          // Only store id+name — full objects are re-fetched from Morpheus on load
          resourcesMeta: (state.resources || [])
            .filter(r => state.selResources.includes(r.id))
            .map(r => ({ id: r.id, name: r.name, type: r.type })),
        })
      } catch (saveErr) {
        console.warn('Could not save session to DB:', saveErr?.message)
      }

      act('LAUNCH')

    } catch (err) {
      setLaunchError(err?.message || String(err))
    } finally {
      setLaunching(false)
    }
    */
  }

  function handleBack() {
    if (state.step > 1) {
      setLaunchProgress([])
      setLaunchError(null)
      goToStep(state.step - 1)
    }
  }

  function handleCancel() {
    cancelRef.current = true
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
              <div className="wiz-step-title">{STEP_TITLES[state.step - 1]}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx-muted)' }}>
              Step {state.step} of {TOTAL_STEPS}
            </div>
          </div>

          <div className="wiz-body">

            {state.step === 1 && (
              <StepMorpheus
                auth={state.auth}
                onSaved={setMorpheusSaved}
              />
            )}

            {state.step === 2 && (
              <StepResources selResources={state.selResources} act={act} />
            )}

            {state.step === 3 && (
              <StepTools
                selectedResources={state.selResources}
                allResources={state.resources}
                currentResourceId={state.currentResourceId}
                setCurrentResourceId={id => act('SET_CURRENT_RESOURCE', { id })}
                toolConfig={state.toolConfig}
                expandedTools={state.expandedTools}
                act={act}
                state={state}
              />
            )}

            {state.step === 4 && (
              <StepDashboards
                selectedResources={state.selResources}
                currentResourceId={state.currentResourceId}
                setCurrentResourceId={id => act('SET_CURRENT_RESOURCE', { id })}
                dashboardConfig={state.dashboardConfig}
                grafanaConfig={state.grafanaConfig}
                allResources={state.resources}
                act={act}
              />
            )}

            {state.step === 5 && (
              <StepReview state={state} />
            )}

          </div>

          {state.step === 5 &&
            launchProgress.length > 0 &&
            (launching || launchError || DEMO_MODE) && (
            <div style={{
              margin: '0 20px 12px',
              padding: '12px 14px',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              background: 'var(--card-bg)',
              maxHeight: 260,
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--tx-primary)' }}>
                Provisioning progress
              </div>
              {launchProgress.map((p) => (
                <div key={p.seq != null ? `seq-${p.seq}` : `${p.resourceId}-${p.taskId}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', fontSize: 12,
                  opacity: p.status === 'pending' ? 0.5 : 1,
                }}>
                  <span style={{ width: 16, textAlign: 'center' }}>
                    {p.status === 'success' ? '✅'
                      : p.status === 'failed' ? '❌'
                      : p.status === 'skipped' ? '⏭️'
                      : p.status === 'cancelled' ? '⊘'
                      : p.status === 'running' ? '⏳'
                      : '·'}
                  </span>
                  <span style={{ color: 'var(--tx-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                    {p.resourceName}
                  </span>
                  <span style={{ color: 'var(--tx-primary)' }}>{p.taskName}</span>
                  {p.detail && (
                    <span style={{
                      color: p.status === 'failed' ? 'var(--status-crit)'
                           : p.status === 'skipped' ? 'var(--status-warn, var(--tx-muted))'
                           : 'var(--tx-muted)',
                      fontSize: 11,
                    }}>
                      — {p.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

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
              Provisioning failed:<br />{launchError}
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

            {launching && (
              <MBtn onClick={handleCancel} style={{ color: 'var(--status-crit)' }}>
                ✕ Cancel
              </MBtn>
            )}

            <MBtn
              action
              onClick={handleNext}
              disabled={!canNext(state, morpheusSaved) || launching}
            >
              {launching
                ? 'Running Morpheus tasks…'
                : state.step === TOTAL_STEPS
                  ? 'Launch Portal →'
                  : 'Continue →'}
            </MBtn>
          </div>

        </div>
      </div>
    </div>
  )
}
