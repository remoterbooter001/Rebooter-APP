import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', 
  plugins: [react()],
  define: {
    // Necessary polyfill for MQTT.js in browser
    'process.env': {},
    'global': 'window',
  },
  resolve: {
    alias: {
        'buffer': 'buffer',
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})