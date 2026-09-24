import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB Limit
      },
      manifest: {
        name: 'Empire Tasks System',
        short_name: 'EmpireTasks',
        description: 'Gamified Task Management System for the Imperium',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    include: ['antd', 'dayjs', '@ant-design/icons', 'framer-motion', 'lucide-react'],
  },
  build: {
    rollupOptions: {
      // The battle report is a second page: without this entry it is left out of
      // the build and the report tab falls through to the SPA's index.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        battle: resolve(__dirname, 'battle-test.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/icons'],
          motion: ['framer-motion']
        }
      }
    }
  }
})
