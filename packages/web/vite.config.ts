import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Must mirror tsconfig.app.json paths — Vite resolves modules independently of TypeScript
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Forward all /api/* requests to the Express server so auth cookies are set on
    // the same origin (localhost) as the Vite dev server. This eliminates cross-origin
    // cookie issues in development and means the better-auth client needs no explicit baseURL.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Forward socket.io traffic (HTTP polling + WS upgrade) to the backend.
      // ws: true is required for the WebSocket upgrade to be proxied correctly.
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "web-production-d2a95.up.railway.app"
    ],
  },
})
