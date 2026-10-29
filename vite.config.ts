/// <reference types="vitest/config" />
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { existsSync, readFileSync } from 'node:fs';
import { parseVersion } from './scripts/version.ts';

// GitHub Pages phục vụ dưới /<tên-repo>/ → workflow deploy đặt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';
// `npm run dev:https`: chứng chỉ tự ký để iPad trong mạng LAN dùng được micro (Safari yêu cầu HTTPS).
const https = process.env.HTTPS === '1';
// Phiên bản chỉ lấy từ file VERSION (tạo bởi `npm run release`); chưa có file → "dev". Không tự sinh khi build.
const versionFile = new URL('./VERSION', import.meta.url);
let appVersion = 'dev';
if (existsSync(versionFile)) {
  appVersion = readFileSync(versionFile, 'utf8').trim();
  parseVersion(appVersion); // VERSION sai định dạng → dừng build
}

// AI cục bộ dùng chung cho cả mạng LAN: server của app (dev và preview) chuyển tiếp `<base>ollama/api/{tags,chat}`
// tới Ollama trên máy này → iPad mở app qua https gọi cùng origin (không mixed content, không CORS).
// Chỉ mở 2 API đó (không pull/xoá model). Bỏ header Origin vì Ollama từ chối origin lạ (IP LAN).
// OLLAMA_PROXY_TARGET đổi đích; OLLAMA_PROXY=0 tắt.
const ollamaTarget = process.env.OLLAMA_PROXY_TARGET ?? 'http://127.0.0.1:11434';
const ollamaPrefix = `${base.replace(/\/*$/, '/')}ollama`;
const ollamaProxy: Record<string, ProxyOptions> =
  process.env.OLLAMA_PROXY === '0'
    ? {}
    : {
        [`^${ollamaPrefix}/api/(tags|chat)$`]: {
          target: ollamaTarget,
          changeOrigin: true,
          rewrite: (path) => path.slice(ollamaPrefix.length),
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              req.removeHeader('origin');
              req.removeHeader('referer');
            });
          },
        },
      };

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
        theme_color: '#7c3aed',
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
    proxy: ollamaProxy,
  },
  preview: {
    host: true,
    proxy: ollamaProxy,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
