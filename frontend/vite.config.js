import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Serve media files from the project-root pics/ folder at the static root URL
  publicDir: '../pics',
})
