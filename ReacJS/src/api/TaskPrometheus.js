/**
 * Executes a Prometheus task via POST request.
 * @param {number} taskId - The ID of the task to execute.
 * @param {object} payload - The payload for the task execution.
 * @returns {Promise<object>} The JSON response from the API.
 * @throws {Error} If the network request fails or the API returns an error status.
 */

const IP_BASE = import.meta.env.VITE_GLOBAL_VM_ADRESS || ''

export const TaskPrometheus = async (taskId, payload) => {
  const apiUrl = `${IP_BASE}:8000/api/v1/tasks/${taskId}/execute`;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add other headers like Authorization if required by your API
        // 'Authorization': 'Bearer YOUR_TOKEN'
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorData.message || res.statusText}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error executing Prometheus task:', err);
    throw err;
  }
};