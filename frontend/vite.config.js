import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/organizations': 'http://127.0.0.1:8000',
      '/forms': 'http://127.0.0.1:8000',
      '/submissions': 'http://127.0.0.1:8000',
      '/applications': 'http://127.0.0.1:8000',
      '/drafts': 'http://127.0.0.1:8000',
      '/users': 'http://127.0.0.1:8000',
      '/ai': 'http://127.0.0.1:8000',
      '/extract-document': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
