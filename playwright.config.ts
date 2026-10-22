import { defineConfig, devices } from '@playwright/test';
import { SCALE_WAV } from './e2e/global-setup';

/**
 * Kiểm thử trình duyệt trên Chromium với kích thước iPad ngang.
 * LƯU Ý: đây KHÔNG phải Safari/iPadOS thật — cần kiểm thử thủ công trên iPad.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${SCALE_WAV}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium-ipad-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
