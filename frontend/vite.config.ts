import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://app:8375',
      '/ping': 'http://app:8375',
      '/api': {
        target: 'http://app:8375',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('upgrade', (req, socket, head) => {
            console.log('[vite] WebSocket upgrade request:', req.url)
          })
          proxy.on('proxyReqWs', (_proxyReq, _req, socket, _options, _head) => {
            console.log('[vite] Proxying WebSocket connection')
            if (socket && !socket.destroySoon) {
              // @ts-expect-error - Shim for Bun/Vite compatibility
              socket.destroySoon = socket.destroy
            }
          })
          proxy.on('error', (err, _req, res) => {
            console.error('[vite] Proxy error:', err)
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Content-Type': 'application/json',
              })
              res.end(
                JSON.stringify({ error: 'Proxy error', message: err.message })
              )
            }
          })
        },
      },
      '/media': {
        target: 'http://localhost:8375',
        changeOrigin: true,
      },
      '/live': {
        target: 'http://media-server:80',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-avatar',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
          ],
          'query-vendor': ['@tanstack/react-query'],
          'form-vendor': ['@tanstack/react-form', 'zod'],
          'utils-vendor': [
            'date-fns',
            'lucide-react',
            'next-themes',
            'clsx',
            'tailwind-merge',
            'class-variance-authority',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Slightly higher limit since we're chunking
  },
})
