/**
 * taskRuns.js
 * -----------
 * Backend-tracked progress for provisioning task runs (used by SetupWizard's
 * Launch step). Each "run" groups a batch of tasks launched together so the
 * UI — and the audit trail — can show live pending/running/success/failed state.
 */

const IP_BASE  = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''
const API_BASE = `${IP_BASE}:8001/api/v1`
const USE_LIVE = import.meta.env.VITE_USE_LIVE_DATA === 'true'

function headers(auth) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const uid = auth?.user?.id ?? (Number(auth?.token) > 0 ? Number(auth.token) : undefined)
  if (uid) h['X-User-Id'] = String(uid)
  return h
}

export function newRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Register a pending task row in the DB. Returns its row id (or null if mock mode / failure). */
export async function createTaskRun(auth, { runId, resourceId, taskId, taskName }) {
  if (!USE_LIVE) return null
  try {
    const res = await fetch(`${API_BASE}/task-runs`, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({ run_id: runId, resource_id: String(resourceId), task_id: taskId, task_name: taskName }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id ?? null
  } catch {
    return null
  }
}

/** Update a task row's status as it progresses. Silently no-ops on failure — never block the UI. */
export async function updateTaskRun(rowId, status, detail = null) {
  if (!USE_LIVE || !rowId) return
  try {
    await fetch(`${API_BASE}/task-runs/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, detail }),
    })
  } catch {
    // best-effort only
  }
}

/** Poll all task rows for a given run — used for a live progress panel. */
export async function fetchTaskRunProgress(runId) {
  if (!USE_LIVE || !runId) return []
  const res = await fetch(`${API_BASE}/task-runs/${encodeURIComponent(runId)}/progress`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).tasks || []
}
