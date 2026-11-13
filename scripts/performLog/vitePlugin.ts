/**
 * Máy ghi "Nhật ký Biểu diễn" gắn vào server của app — TẠM THỜI (docs/perform-log.md).
 * `npm run dev` / `dev:https` / `serve:lan`: app trên mọi máy trong LAN gửi log về `<base>__vplog` của chính server này
 * (cùng origin → không CORS, không mixed content), ghi vào `logs/perform-log/` (PERFLOG_DIR đổi chỗ, PERFLOG=0 tắt).
 * Bản build (GitHub Pages) không có máy ghi này.
 */
import type { Plugin } from 'vite';
import { createPerformLogHandler, DEFAULT_LOG_DIR, splitList } from './collector.ts';

export function performLogPlugin(base: string): Plugin {
  const path = `${base.replace(/\/*$/, '/')}__vplog`;
  const handler =
    process.env.PERFLOG === '0'
      ? null
      : createPerformLogHandler({
          dir: process.env.PERFLOG_DIR ?? DEFAULT_LOG_DIR,
          origins: splitList(process.env.PERFLOG_ORIGINS),
          log: (line) => console.log(`[nhật ký Biểu diễn] ${line}`),
        });
  return {
    name: 'vietpiano-perform-log',
    configureServer(server) {
      if (handler) server.middlewares.use(path, handler);
    },
    configurePreviewServer(server) {
      if (handler) server.middlewares.use(path, handler);
    },
  };
}
