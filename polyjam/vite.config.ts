import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/polyjam/' : '/',
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
})
