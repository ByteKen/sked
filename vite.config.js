import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Suppress chunk size warning (Firebase SDK is large but necessary)
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor': ['react', 'react-dom', 'zustand'],
        }
      }
    }
  }
})
