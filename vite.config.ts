/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// GitHub Pages phục vụ dưới /<tên-repo>/ → workflow deploy đặt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
// `npm run dev:https`: chứng chỉ tự ký để iPad trong mạng LAN dùng được micro (Safari yêu cầu HTTPS).
const https = process.env.HTTPS === '1';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    ...(https ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'VietPiano — Học piano',
        short_name: 'VietPiano',
        description: 'Học piano qua microphone, nhận diện nốt và tự chuyển khuông nhạc.',
        lang: 'vi',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Font Bravura của VexFlow được nhúng trong bundle JS nên chunk khá lớn.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  build: {
    // Font Bravura nhúng base64 (~330 KB) làm chunk VexFlow lớn; tách riêng để cache lâu dài.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vexflow', test: /node_modules[\\/]vexflow/ }],
        },
      },
    },
  },
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
