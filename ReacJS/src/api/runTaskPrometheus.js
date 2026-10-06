
/**
 * runTaskPrometheus.js
 * --------------------
 * Execute Prometheus-related tasks via Morpheus API.
 * 
 * Handles:
 * - Task 1: Install Prometheus
 * - Task 12: Configure Prometheus Service
 * - Task 16: Install Node Exporter
 * - Task 8: Configure Prometheus targets
 * 
 * Route: POST /api/tasks/{task_id}/execute
 */

import { PROMETHEUS_TASK_TEMPLATES, PROMETHEUS_VARS } from '../config/prometheus.variables'
import { fetchTaskExecute } from './taskApi'

function toNumericInstanceId(id) {
  const n = Number(id)
  if (!Number.isFinite(n)) {
    throw new PrometheusTaskError(
      400,
      'Bad Request',
      `Invalid Morpheus instance id "${id}" — expected a numeric instance id (e.g. 37)`,
      ''
    )
  }
  return n
}

function normalizeJobInstances(payload) {
  if (!payload?.job?.instances) return payload
  return {
    ...payload,
    job: {
      ...payload.job,
      instances: payload.job.instances.map(toNumericInstanceId),
    },
  }
}

/**
 * Execute task API call for a given task id.
 * @param {number|string} taskId
 * @param {object} options - Fetch options (method, body, …)
 */
async function prometheusApiFetch(taskId, options = {}) {
  const { res, text, url } = await fetchTaskExecute(taskId, options)

  if (!res.ok) {
    throw new PrometheusTaskError(res.status, res.statusText, text, url)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Custom error class for Prometheus task execution errors
 */
export class PrometheusTaskError extends Error {
  constructor(status, statusText, body, path) {
    super(`Task API ${status} ${statusText} — ${path}`)
    this.status = status
    this.body = body
    this.path = path
  }
}

/**
 * Helper to merge payload overrides
 */
function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base
  if (!base || typeof base !== 'object') return override
  if (Array.isArray(base) || Array.isArray(override)) return override

  const out = { ...base }
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out ? deepMerge(out[k], v) : v
  }
  return out
}

/**
 * Execute a Prometheus task
 * 
 * @param {number} taskId - Task ID (1, 12, 16, or 8)
 * @param {object} overrides - Override payload values (instances, customOptions, etc)
 * @param {boolean} noProxy - Set true to bypass proxy
 * @returns {Promise} Task execution result
 * 
 * @example
 * // Task 1: Install Prometheus on instance 37
 * await executePrometheusTask(1, { job: { instances: [37] } })
 * 
 * // Task 16: Install Node Exporter with custom options
 * await executePrometheusTask(16, {
 *   job: {
 *     instances: [37],
 *     customOptions: { EXPORTER_NAME: 'node_exporter', FILE_ID: '220', EXEC_START: '/opt/node_exporter/node_exporter' }
 *   }
 * }, true)
 */
export async function executePrometheusTask(taskId, overrides = {}, noProxy = false) {
  const templateFn = PROMETHEUS_TASK_TEMPLATES[String(taskId)] || PROMETHEUS_TASK_TEMPLATES[taskId]
  
  if (!templateFn) {
    throw new PrometheusTaskError(
      400,
      'Bad Request',
      `No template configured for taskId=${taskId}`,
      `task ${taskId}`
    )
  }

  // Build final payload from template + overrides
  const basePayload = templateFn(PROMETHEUS_VARS)
  const payload = normalizeJobInstances(deepMerge(basePayload, overrides))

  console.log(`[runTaskPrometheus] Executing task ${taskId}:`, payload)

  try {
    const result = await prometheusApiFetch(taskId, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    console.log(`[runTaskPrometheus] Task ${taskId} completed:`, result)
    return result
  } catch (err) {
    console.error(`[runTaskPrometheus] Task ${taskId} failed:`, err)
    throw err
  }
}

/**
 * Execute Prometheus installation tasks (1 & 12)
 * 
 * @param {number|number[]} instanceIds - Instance ID(s) to install on
 * @param {boolean} noProxy - Bypass proxy if true
 * @returns {Promise} Array of task results
 */
export async function installPrometheus(instanceIds) {
  const ids = Array.isArray(instanceIds) ? instanceIds : [instanceIds]
  const results = []

  console.log(`[runTaskPrometheus] Installing Prometheus on instances:`, ids)

  for (const id of ids) {
    try {
      // Task 1: Install Prometheus
      const task1 = await executePrometheusTask(1, { job: { instances: [id] } })
      results.push({ taskId: 1, instanceId: id, ok: true, result: task1 })

      // Task 12: Make Prometheus Service
      const task12 = await executePrometheusTask(12, { job: { instances: [id] } })
      results.push({ taskId: 12, instanceId: id, ok: true, result: task12 })
    } catch (err) {
      console.error(`[runTaskPrometheus] Prometheus install failed for instance ${id}:`, err)
      results.push({ taskId: 'install', instanceId: id, ok: false, error: err.message })
    }
  }

  return results
}

/**
 * Execute Node Exporter installation tasks (16 & 8)
 * 
 * @param {number|number[]} instanceIds - Instance ID(s) to install on
 * @param {object} exporterConfig - Exporter configuration overrides
 * @param {boolean} noProxy - Bypass proxy if true
 * @returns {Promise} Array of task results
 */
export async function installNodeExporter(instanceIds, exporterConfig = {}, noProxy = false) {
  const ids = Array.isArray(instanceIds) ? instanceIds : [instanceIds]
  const results = []

  console.log(`[runTaskPrometheus] Installing Node Exporter on instances:`, ids)

  for (const id of ids) {
    try {
      // Task 16: Install Exporter
      const task16 = await executePrometheusTask(16, {
        job: {
          instances: [id],
          customOptions: {
            EXPORTER_NAME: exporterConfig.EXPORTER_NAME || PROMETHEUS_VARS.exporterName,
            FILE_ID: exporterConfig.FILE_ID || PROMETHEUS_VARS.exporterFileId,
            EXEC_START: exporterConfig.EXEC_START || PROMETHEUS_VARS.exporterExecStart
          }
        }
      }, noProxy)
      results.push({ taskId: 16, instanceId: id, ok: true, result: task16 })

      // Task 8: Configure Prometheus targets
      const task8 = await executePrometheusTask(8, {
        job: {
          instances: [id],
          customOptions: {
            TARGET: exporterConfig.TARGET || PROMETHEUS_VARS.target,
            JOB_NAME: exporterConfig.JOB_NAME || PROMETHEUS_VARS.jobName
          }
        }
      }, noProxy)
      results.push({ taskId: 8, instanceId: id, ok: true, result: task8 })
    } catch (err) {
      console.error(`[runTaskPrometheus] Node Exporter install failed for instance ${id}:`, err)
      results.push({ taskId: 'exporter', instanceId: id, ok: false, error: err.message })
    }
  }

  return results
}

/**
 * Execute complete Prometheus stack (both Prometheus and Node Exporter)
 * 
 * @param {number|number[]} instanceIds - Instance ID(s)
 * @param {object} config - Configuration options
 * @param {boolean} config.noProxy - Bypass proxy if true
 * @returns {Promise} All task results
 */
export async function installPrometheusStack(instanceIds, config = {}) {
  const { noProxy = false, exporterConfig = {} } = config
  const results = []

  console.log(`[runTaskPrometheus] Installing complete Prometheus stack...`)

  try {
    const promResults = await installPrometheus(instanceIds, noProxy)
    results.push(...promResults)

    const exporterResults = await installNodeExporter(instanceIds, exporterConfig, noProxy)
    results.push(...exporterResults)

    console.log(`[runTaskPrometheus] Stack installation complete:`, results)
    return results
  } catch (err) {
    console.error(`[runTaskPrometheus] Stack installation failed:`, err)
    throw err
  }
}



