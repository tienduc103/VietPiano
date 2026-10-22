// Sinh icon PNG cho PWA từ public/favicon.svg bằng Chromium của Playwright.
// Chạy: npm run icons
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'public/favicon.svg'), 'utf8');

const targets = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  // Apple touch icon: iOS tự bo góc, nên dùng nền vuông đầy đủ.
  { file: 'apple-touch-icon.png', size: 180, square: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const body = t.square ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${body.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: path.join(root, 'public', t.file), omitBackground: true });
  console.log('✓', t.file);
}
await browser.close();
