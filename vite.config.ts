import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-icon.png', 'splash-logo.png'],
      manifest: {
        name: 'Remote rebooter app',
        short_name: 'Remote Rebooter',
        description: 'Manage and reset your MQTT router devices remotely.',
        theme_color: '#1f2937',
        background_color: '#1f2937',
        display: 'standalone',
        scope: '.',
        start_url: '.',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
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