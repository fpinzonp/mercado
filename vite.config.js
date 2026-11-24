import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages con cualquier nombre de repositorio.
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Mercado',
        short_name: 'Mercado',
        description: 'Lista de mercado y comparador de precios',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#eef2ef',
        theme_color: '#eef2ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La app completa queda guardada para abrir sin señal.
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        globIgnores: ['tesseract/**'],
        navigateFallback: 'index.html',
        // Tesseract (≈6 MB) se guarda la primera vez que se usa con señal: de mejor esfuerzo en iPhone.
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
          handler: 'CacheFirst',
          options: { cacheName: 'tesseract', expiration: { maxEntries: 20 } },
        }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
