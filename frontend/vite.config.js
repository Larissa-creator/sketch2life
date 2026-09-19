import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev proxies: phones reach backend and print service through port 5173.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const printApiTarget = env.VITE_PRINT_API_URL || 'http://127.0.0.1:3005'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        // 3D generation backend (port 8000)
        '/ki-api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          timeout: 300_000,
          rewrite: (path) => path.replace(/^\/ki-api/, ''),
        },
        // Print service (print-service, port 3005)
        '/print-api': {
          target: printApiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/print-api/, ''),
        },
      },
    },
  }
})
