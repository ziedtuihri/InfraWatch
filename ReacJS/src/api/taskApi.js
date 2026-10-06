/**
 * Task execution API — POST /api/tasks/:taskId/execute
 *
 * In dev (Vite), use /task-api/... so requests are not caught by the Morpheus /api proxy.
 * In prod or when VITE_TASK_API_FLASK is set, call the task server directly.
 */

const TASK_API_ORIGIN = (
  import.meta.env.VITE_TASK_API_FLASK || ''
).replace(/\/$/, '')

const TOKEN = import.meta.env.VITE_MORPHEUS_TOKEN || ''

/**
 * @param {number|string} taskId
 * @returns {string} Full URL or dev proxy path
 */
export function buildTaskExecuteUrl(taskId) {
  // Dev: always go through Vite /task-api proxy (avoids CORS + Morpheus /api clash)
  if (import.meta.env.DEV) {
    return `/task-api/tasks/${taskId}/execute`
  }
  return `${TASK_API_ORIGIN}/api/v1/tasks/${taskId}/execute`
}

/**
 * @param {number|string} taskId
 * @param {RequestInit} [options]
 */
export async function fetchTaskExecute(taskId, options = {}) {
  const url = buildTaskExecuteUrl(taskId)
  console.log(`[taskApi] ${options.method || 'POST'} ${url}`)

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...options.headers,
    },
  })

  const text = await res.text()
  return { res, text, url }
}
