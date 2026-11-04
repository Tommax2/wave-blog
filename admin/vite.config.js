import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname),
  base: '/admin/',
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, '..', 'public', 'admin'), emptyOutDir: true },
  server: { port: 5174, proxy: { '/api': 'http://localhost:4000' } },
})
