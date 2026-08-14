import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 is taken by another local project (Supernova); fail loudly rather
    // than silently drifting to a neighbouring port.
    port: 5177,
    strictPort: true,
  },
})
