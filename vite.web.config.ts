// Browser-only preview of the UI (data is kept in localStorage). Used for quick UI checks.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
