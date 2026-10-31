// Tạo sẵn file giọng cô giáo (mp3, giọng nữ miền Bắc vi-VN-HoaiMyNeural) cho mọi câu trong `voiceLines`
// → public/voice/vi/<băm>.mp3 + public/voice/index.json (câu → file). App phát file này thay vì đọc bằng
// giọng của máy, nên Chrome trên Windows (không có giọng tiếng Việt) vẫn nghe được.
//
// Cần Python + gói edge-tts (`pip install edge-tts`). Chỉ CÂU HƯỚNG DẪN được gửi tới dịch vụ đọc chữ của
// Microsoft lúc chạy lệnh này; app khi học không gọi mạng. Chỉ tạo câu còn thiếu (chạy lại sau khi sửa nội dung).
//   npm run voice                  → tạo file còn thiếu, ghi index
//   npm run voice -- --dry-run     → chỉ đếm câu / file còn thiếu
//   npm run voice -- --prune       → xoá thêm file không còn dùng
//   npm run voice -- --limit 20    → chỉ tạo tối đa 20 file (thử)
// Biến môi trường: PYTHON (mặc định "python").
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const VOICE = 'vi-VN-HoaiMyNeural';
// Chậm hơn 10% cho bé. Máy chủ hiện từ chối tham số pitch → không đổi cao độ.
const RATE = '-10%';
// Dịch vụ hay trả rỗng ngẫu nhiên khi gọi dồn → ít luồng + thử lại có chờ.
const CONCURRENCY = 2;
const ATTEMPTS = 6;
// Dịch vụ đôi khi trả về file cụt mà không báo lỗi; câu ngắn nhất ("Hay quá!") đã ~11 KB.
const MIN_BYTES = 8000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'voice');
const audioDir = join(outDir, 'vi');
const python = process.env.PYTHON ?? 'python';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const prune = args.includes('--prune');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

type Catalog = typeof import('../src/core/voice/catalog');
type Content = typeof import('../src/core/curriculum/content/curriculum');
const config = { configFile: false as const, logLevel: 'error' as const };
const { module: catalog } = await runnerImport<Catalog>(join(root, 'src/core/voice/catalog.ts'), config);
const { module: content } = await runnerImport<Content>(join(root, 'src/core/curriculum/content/curriculum.ts'), config);

type Supplement = typeof import('../src/core/curriculum/content/supplement');
const { module: supplement } = await runnerImport<Supplement>(join(root, 'src/core/curriculum/content/supplement.ts'), config);

// Giáo trình chính + giáo trình bổ sung "Làm quen từng nốt".
const lines = [...new Set([...catalog.voiceLines(content.CURRICULUM), ...catalog.voiceLines(supplement.SUPPLEMENT)])];
const fileOf = (line: string) => `${createHash('sha1').update(`${VOICE}|${RATE}|${line}`).digest('hex').slice(0, 12)}.mp3`;
const exists = (f: string) => existsSync(join(audioDir, f)) && statSync(join(audioDir, f)).size >= MIN_BYTES;
const missing = lines.filter((l) => !exists(fileOf(l)));
console.log(`${lines.length} câu, còn thiếu ${missing.length} file.`);
if (dryRun) process.exit(0);

mkdirSync(audioDir, { recursive: true });

function synth(line: string, file: string, report: boolean): Promise<boolean> {
  const tmp = join(audioDir, `${file}.tmp`);
  return new Promise((resolve) => {
    const p = spawn(python, ['-m', 'edge_tts', '--voice', VOICE, `--rate=${RATE}`, '--text', line, '--write-media', tmp], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      err += e.message;
      resolve(false);
    });
    p.on('close', (code) => {
      const ok = code === 0 && existsSync(tmp) && statSync(tmp).size >= MIN_BYTES;
      if (ok) renameSync(tmp, join(audioDir, file));
      else {
        rmSync(tmp, { force: true });
        if (report) console.error(`  lỗi "${line}": ${err.trim().split('\n').at(-1) ?? code}`);
      }
      resolve(ok);
    });
  });
}

const queue = missing.slice(0, limit);
let done = 0;
let failed = 0;
async function worker() {
  for (let line = queue.shift(); line !== undefined; line = queue.shift()) {
    const file = fileOf(line);
    let ok = false;
    for (let i = 0; i < ATTEMPTS && !ok; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000 * i));
      ok = await synth(line, file, i === ATTEMPTS - 1);
    }
    if (ok) done++;
    else failed++;
    if ((done + failed) % 25 === 0) console.log(`  ${done + failed}/${Math.min(missing.length, limit)}…`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Chỉ ghi câu đã có file — câu thiếu app đọc bằng giọng của máy.
const index: Record<string, string> = {};
for (const l of [...lines].sort()) if (exists(fileOf(l))) index[l] = fileOf(l);
writeFileSync(join(outDir, 'index.json'), `${JSON.stringify({ voice: VOICE, rate: RATE, lines: index }, null, 1)}\n`);

if (prune) {
  const used = new Set(Object.values(index));
  const extra = readdirSync(audioDir).filter((f) => !used.has(f));
  for (const f of extra) rmSync(join(audioDir, f));
  console.log(`Đã xoá ${extra.length} file không dùng.`);
}
console.log(`Xong: tạo ${done} file, lỗi ${failed}. Index: ${Object.keys(index).length}/${lines.length} câu.`);
if (failed > 0) process.exitCode = 1;
