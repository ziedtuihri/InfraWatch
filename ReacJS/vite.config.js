import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const taskApiTarget =
    env.VITE_TASK_API_FLASK || ''
  const morpheusTarget =
    env.VITE_MORPHEUS_URL || 'https://projet1-virtual-machine'
  const authTarget = env.VITE_AUTH_TARGET || env.VITE_TASK_API_FLASK || 'http://localhost:8080'

  return {
    plugins: [react()],

    server: {
      proxy: {
        // Task API — separate prefix so Morpheus /api proxy does not steal the request
        // /task-api/tasks/1/execute → http://10.202.52.82:8000/api/tasks/1/execute
        '/task-api': {
          target: taskApiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/task-api/, '/api'),
        },

        // Morpheus (instances, zones, …) — do not use for /api/tasks/*
        '/api': {
          target: morpheusTarget,
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api/, ''),
          bypass(req) {
            if (req.url?.startsWith('/api/tasks')) {
              return req.url
            }
          },
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              // IMPORTANT: keep secrets OUT of Vite client env.
              // Use MORPHEUS_TOKEN (no VITE_ prefix) so it never ships to the browser bundle.
              const token = env.MORPHEUS_TOKEN
              if (token) {
                proxyReq.setHeader('Authorization', `Bearer ${token}`)
                proxyReq.setHeader('Content-Type', 'application/json')
              }
            })
          },
        },

        // Auth backend for /auth/*
        '/auth': {
          target: authTarget,
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/auth/, '/auth'),
        },
      },
    },
  }
})
