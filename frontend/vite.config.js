import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // VITE_BASE_PATH is set by GitHub Actions to /repo-name/ so that
  // asset paths resolve correctly under the GitHub Pages subdirectory.
  // Locally it is unset, so '/' is used (normal behaviour).
  base: process.env.VITE_BASE_PATH || '/',

  server: {
    port: 5173,
    proxy: {
      '/upload':  { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/analyze': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health':  { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
