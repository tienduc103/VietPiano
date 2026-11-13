/**
 * `npm run perflog` — máy ghi "Nhật ký Biểu diễn" chạy riêng (TẠM THỜI, docs/perform-log.md).
 * Dùng khi người chơi mở app từ GitHub Pages: trên máy đó vào Cài đặt → Nhật ký Biểu diễn → "Gửi tới" =
 * `http://<IP máy này>:8790` (Chrome hỏi quyền truy cập mạng cục bộ một lần). Khi mở app từ `npm run dev` /
 * `serve:lan` thì không cần lệnh này (server của app đã có máy ghi, "auto").
 * Biến môi trường: PERFLOG_PORT (8790), PERFLOG_DIR (logs/perform-log), PERFLOG_ORIGINS (thêm trang được gửi, '*' = mọi trang).
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createPerformLogHandler, DEFAULT_LOG_DIR, splitList } from './performLog/collector.ts';

const port = Number(process.env.PERFLOG_PORT ?? 8790);
const dir = process.env.PERFLOG_DIR ?? DEFAULT_LOG_DIR;
const handler = createPerformLogHandler({ dir, origins: splitList(process.env.PERFLOG_ORIGINS), log: (line) => console.log(line) });

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/__vplog') return handler(req, res);
  if (path === '/' && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`VietPiano — máy ghi Nhật ký Biểu diễn đang chạy.\nGhi vào: ${dir}\nApp gửi tới: http://<IP máy này>:${port}\n`);
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
  console.log(`Máy ghi Nhật ký Biểu diễn: ghi vào ${dir}`);
  console.log(`  Máy này:        http://localhost:${port}`);
  for (const ip of ips) console.log(`  Máy khác (LAN): http://${ip}:${port}`);
  console.log('Trên máy chơi: Cài đặt → Nhật ký Biểu diễn → "Gửi tới" = một địa chỉ ở trên. Ctrl+C để dừng.');
});
