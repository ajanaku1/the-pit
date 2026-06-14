import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served under /play/ on the combined site (landing lives at /).
  base: '/play/',
  plugins: [react()],
})
