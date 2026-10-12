import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/organizations': 'http://127.0.0.1:8000',
      '/forms': 'http://127.0.0.1:8000',
      '/submissions': 'http://127.0.0.1:8000',
      '/transcribe': 'http://127.0.0.1:8000',
      '/format-application': 'http://127.0.0.1:8000',
      '/extract-document': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
