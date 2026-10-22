// Quy tắc số phiên bản phát hành: <major>.<minor>.<yymmdd>.<hhmmss> (vd 1.07.261020.143507).
// Hàm thuần (không đọc file/đồng hồ) để test được; dùng bởi scripts/release.ts và vite.config.ts.

export const VERSION_RE = /^([1-9]\d*)\.(0[1-9]|[1-9]\d)\.(\d{6})\.(\d{6})$/;

export interface ParsedVersion {
  major: number;
  minor: number;
}

/** Kiểm tra định dạng; sai ⇒ ném lỗi. */
export function parseVersion(version: string): ParsedVersion {
  const m = VERSION_RE.exec(version);
  if (!m) {
    throw new Error(`Phiên bản không đúng định dạng <major>.<minor>.<yymmdd>.<hhmmss>: "${version}"`);
  }
  return { major: Number(m[1]), minor: Number(m[2]) };
}

// Việt Nam cố định UTC+7, không có giờ mùa hè → cộng offset rồi đọc theo UTC, không phụ thuộc múi giờ máy.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Thời điểm theo giờ Việt Nam dạng "yymmdd.hhmmss" (24 giờ). */
export function vnTimestamp(now: Date): string {
  const t = new Date(now.getTime() + VN_OFFSET_MS);
  const date = pad2(t.getUTCFullYear() % 100) + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate());
  const time = pad2(t.getUTCHours()) + pad2(t.getUTCMinutes()) + pad2(t.getUTCSeconds());
  return `${date}.${time}`;
}

/** Phiên bản kế tiếp: null → 1.01; minor +1; sau .99 thì major +1, minor về 01. */
export function nextVersion(current: string | null, now: Date): string {
  let major = 1;
  let minor = 1;
  if (current !== null) {
    const v = parseVersion(current);
    major = v.minor === 99 ? v.major + 1 : v.major;
    minor = v.minor === 99 ? 1 : v.minor + 1;
  }
  return `${major}.${pad2(minor)}.${vnTimestamp(now)}`;
}
