import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite builds the React app and generates the installable PWA manifest/service worker.
export default defineConfig({
  server: {
    allowedHosts: [".vercel.run"],
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      manifest: {
        name: 'ComfyUI Console',
        short_name: 'ComfyUI',
        description: 'Mobile-first ComfyUI remote console',
        theme_color: '#17181c',
        background_color: '#17181c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: []
      }
    })
  ]
})
