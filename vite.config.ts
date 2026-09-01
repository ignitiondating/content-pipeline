import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/files': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
