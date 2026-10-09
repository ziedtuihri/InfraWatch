import { authHeaders } from './auth'

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''

// auth is set once after login via setTaskAuth()
let _auth = null
export function setTaskAuth(auth) { _auth = auth }

/**
 * Inspect a Morpheus task-execute response body to decide if the task
 * ACTUALLY succeeded. Morpheus returns HTTP 200 even when the underlying
 * script failed (non-zero exit, error output) — so res.ok alone is not
 * enough, which is why failed tasks were showing as ✅. We look at the
 * fields Morpheus populates for task results and treat explicit failure
 * signals as a thrown error.
 *
 * Returns the parsed body if it looks successful; throws otherwise.
 */
function assertMorpheusSuccess(body, taskId) {
  if (!body || typeof body !== 'object') return body

  // Log the raw response once so we can confirm the exact shape Morpheus
  // returns (helps verify failures are detected). Visible in the browser
  // console during a launch.
  try { console.debug(`[InfraWatch] task ${taskId} raw response:`, JSON.stringify(body).slice(0, 1000)) } catch {}

  // Collect every object that might carry a per-instance/script result.
  const candidates = [
    body,
    body.taskResult,
    body.result,
    body.data,
    body.processConfig,
    body.process,
  ].filter(v => v && typeof v === 'object')

  // Morpheus often returns results keyed by instance/server id, or as an
  // array — flatten those in too.
  const addCollection = coll => {
    if (!coll) return
    if (Array.isArray(coll)) {
      for (const v of coll) if (v && typeof v === 'object') candidates.push(v)
    } else if (typeof coll === 'object') {
      for (const v of Object.values(coll)) if (v && typeof v === 'object') candidates.push(v)
    }
  }
  addCollection(body.results)
  addCollection(body.taskResults)
  addCollection(body.data?.results)
  addCollection(body.taskResult?.results)

  for (const c of candidates) {
    if (c.success === false) throw new Error(taskFailMsg(taskId, c))

    const status = String(c.status || c.processStatus || c.taskStatus || '').toLowerCase()
    if (['failed', 'error', 'errored', 'denied', 'cancelled', 'fail'].includes(status)) {
      throw new Error(taskFailMsg(taskId, c))
    }

    const exit = c.exitCode != null ? c.exitCode : c.exit_code
    if (exit != null && Number(exit) !== 0) throw new Error(taskFailMsg(taskId, c))
  }

  // Scan all stdout/stderr-ish text for hard error markers the script printed.
  const out = [
    body.output, body.error, body.stderr,
    body.data?.output, body.result?.output, body.taskResult?.output,
    typeof body === 'string' ? body : null,
    JSON.stringify(body.results || ''),
    JSON.stringify(body.taskResults || ''),
  ].filter(Boolean).join('\n')
  if (out) {
    if (/(^|\s)ERROR:|\bFAILED\b|command not found|No such file|readonly variable|syntax error|Permission denied/im.test(out)) {
      throw new Error(`Task ${taskId} reported an error in its output: ${firstErrorLine(out)}`)
    }
  }

  return body
}

function firstErrorLine(out) {
  const line = out.split('\n').find(l => /ERROR:|FAILED|not found|No such file/i.test(l))
  return (line || out).trim().slice(0, 200)
}

function taskFailMsg(taskId, c) {
  const detail = c.message || c.error || c.statusMessage || c.output || JSON.stringify(c).slice(0, 200)
  return `Task ${taskId} failed in Morpheus: ${detail}`
}

export const TaskPrometheus = async (taskId, payload) => {
  const apiUrl = `${IP_BASE}:8001/api/v1/tasks/${taskId}/execute`

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: authHeaders(_auth),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorData.detail || errorData.message || res.statusText}`)
  }

  const body = await res.json()
  // HTTP 200 from Morpheus does NOT mean the task succeeded — verify the body.
  return assertMorpheusSuccess(body, taskId)
}
