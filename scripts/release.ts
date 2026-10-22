// Lệnh phát hành: tăng phiên bản trong file VERSION, commit riêng file đó và gắn tag.
//   npm run release                 → ghi VERSION + git commit + git tag
//   npm run release -- --dry-run    → chỉ in phiên bản kế tiếp
//   npm run release -- --no-git     → chỉ ghi file VERSION
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextVersion } from './version.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = join(root, 'VERSION');

function fail(message: string): never {
  console.error(`Lỗi: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--dry-run' && a !== '--no-git');
if (unknown.length > 0) fail(`tham số không hợp lệ: ${unknown.join(' ')} (chỉ có --dry-run, --no-git)`);
const dryRun = args.includes('--dry-run');
const noGit = args.includes('--no-git');

const current = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : null;

let next: string;
try {
  next = nextVersion(current, new Date());
} catch (e) {
  fail(`${(e as Error).message} (file ${versionFile})`);
}

if (dryRun) {
  console.log(`Phiên bản hiện tại: ${current ?? '(chưa có)'}`);
  console.log(`Phiên bản kế tiếp:  ${next}`);
  process.exit(0);
}

const tag = `v${next}`;
const git = (...gitArgs: string[]) => execFileSync('git', gitArgs, { cwd: root, stdio: 'inherit' });

if (!noGit && spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { cwd: root }).status === 0) {
  fail(`tag ${tag} đã tồn tại`);
}

writeFileSync(versionFile, `${next}\n`);
console.log(`Đã ghi VERSION: ${current ?? '(chưa có)'} → ${next}`);

if (noGit) process.exit(0);

try {
  git('add', 'VERSION');
  // `-- VERSION`: chỉ commit file VERSION, không kéo theo thay đổi khác đang stage.
  git('commit', '-m', `Phát hành ${tag}`, '--', 'VERSION');
  git('tag', tag);
} catch {
  fail('lệnh git thất bại (xem thông báo ở trên). File VERSION đã được ghi.');
}

console.log(`\nĐã commit và gắn tag ${tag}. Đẩy lên bằng:\n  git push && git push origin ${tag}`);
