import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // important for routing
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // The backend engine (backend/dlt_app.py) runs on port 5001. Proxying
      // '/api/dlt/...' here lets the frontend use relative URLs in both dev and
      // prod, with no CORS and no hardcoded host/port to keep in sync.
      '/api/dlt': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
    historyApiFallback: true,
  },
}) 

