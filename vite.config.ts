import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // These are the biggest single contributors to the pre-split
        // 2.4MB bundle — each is only ever touched by one feature
        // (PDF export, the Analytics charts, Firebase sync, or the
        // Google/Microsoft/Zoho Settings sections), so giving them
        // their own chunk means a person who never opens Analytics or
        // never connects Google never downloads Recharts or GIS at
        // all, instead of it riding along in the main bundle.
        manualChunks: {
          pdf: ['jspdf', 'jspdf-autotable'],
          charts: ['recharts'],
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        },
      },
    },
  },
})
