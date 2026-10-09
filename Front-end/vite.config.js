import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_TASK_API_FLASK || 'http://localhost:8001'

  return {
    plugins: [react()],

    server: {
      port: 5175,
      historyApiFallback: true,  // serve index.html for all routes on refresh

      proxy: {
        '/api/v1': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
