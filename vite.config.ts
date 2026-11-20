import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // elke subpagina een eigen ingang: landingspagina, de React-app, en losse subprojecten
      input: {
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
        dierNadoen: path.resolve(__dirname, 'dier-nadoen/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'lib'),
    },
  },
})
