/**
 * Đo độ trễ bằng cách gõ theo tiếng click của app (M1-T7). Thuần, có test.
 *
 * App phát `LEAD_IN` tiếng click để bắt nhịp rồi `MEASURED_CLICKS` tiếng được đo; người chơi gõ một phím (đàn MIDI, bàn phím
 * máy tính / màn hình, hoặc một nốt trên đàn khi dùng micro) đúng lúc NGHE tiếng click. Độ lệch "lần gõ − tiếng click" gồm:
 * độ trễ loa / tai nghe + đàn / micro + trình duyệt + thói quen gõ của người chơi — đúng thứ cần trừ khi so nốt với metronome.
 *
 * Ước lượng bền: mỗi lần gõ ghép tiếng click gần nhất (trong ± 45% phách), mỗi tiếng click giữ một lần gõ (gần trung vị nhất),
 * bỏ lần gõ lệch xa (> max(60 ms, 3,5σ)); kết quả = trung vị, độ dao động = 1,4826 × MAD.
 */

export const CALIBRATION_BPM = 90;
/** Tiếng click bắt nhịp (không đo). */
export const CALIBRATION_LEAD_IN = 4;
/** Tiếng click được đo. */
export const CALIBRATION_CLICKS = 16;
/** Số lần gõ hợp lệ tối thiểu. */
export const MIN_VALID_TAPS = 8;
/** Dao động lớn hơn → "không ổn định", không lưu. */
export const MAX_JITTER_MS = 35;
/** Dao động ≤ mức này → "tốt". */
export const GOOD_JITTER_MS = 15;
/** Độ lệch lớn hơn → không tin (thường do gõ lệch phách). */
export const MAX_ABS_OFFSET_MS = 350;
/** Cửa sổ ghép lần gõ với tiếng click (tỉ lệ phách). */
const MATCH_WINDOW = 0.45;
/** Ngưỡng bỏ lần gõ lệch xa: max(OUTLIER_MIN_MS, OUTLIER_SIGMAS × σ). */
const OUTLIER_MIN_MS = 60;
const OUTLIER_SIGMAS = 3.5;
const MAD_TO_SIGMA = 1.4826;

export type TapStatus = 'ok' | 'too-few' | 'unstable' | 'implausible';

export interface TapMatch {
  /** Mốc tiếng click (ms). */
  click: number;
  /** Mốc lần gõ ghép được (ms) — null = bỏ lỡ tiếng click này. */
  tap: number | null;
  offsetMs: number | null;
  /** Lần gõ lệch xa, không tính. */
  outlier: boolean;
}

export interface TapAnalysis {
  status: TapStatus;
  /** Trung vị (ms, làm tròn) — null khi không đủ dữ liệu. */
  offsetMs: number | null;
  jitterMs: number | null;
  /** Lần gõ được tính / tiếng click bỏ lỡ / lần gõ thừa (gõ đúp, ngoài cửa sổ) / lần gõ lệch xa. */
  used: number;
  missed: number;
  extra: number;
  outliers: number;
  matches: TapMatch[];
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function robustSigma(xs: readonly number[], center: number): number {
  return MAD_TO_SIGMA * median(xs.map((x) => Math.abs(x - center)));
}

/**
 * Ghép lần gõ với tiếng click và ước lượng độ trễ.
 * @param clicks mốc các tiếng click ĐƯỢC ĐO (tăng dần, ms)
 * @param taps mốc các lần gõ (ms, cùng đồng hồ) — lần gõ ngoài mọi cửa sổ bị coi là thừa
 */
export function analyzeTaps(clicks: readonly number[], taps: readonly number[], beatMs: number): TapAnalysis {
  const window = beatMs * MATCH_WINDOW;
  // 1. Mỗi lần gõ → tiếng click gần nhất trong cửa sổ.
  const byClick: number[][] = clicks.map(() => []);
  let extra = 0;
  for (const tap of taps) {
    let best = -1;
    let bestD = Infinity;
    clicks.forEach((c, i) => {
      const d = Math.abs(tap - c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0 || bestD > window) extra++;
    else byClick[best].push(tap);
  }
  // 2. Tiếng click có nhiều lần gõ (gõ đúp) → giữ lần gần trung vị độ lệch của các tiếng click chỉ có một lần gõ.
  const single = byClick.flatMap((ts, i) => (ts.length === 1 ? [ts[0] - clicks[i]] : []));
  const allFirst = byClick.flatMap((ts, i) => ts.map((t) => t - clicks[i]));
  const center0 = single.length ? median(single) : allFirst.length ? median(allFirst) : 0;
  const chosen = byClick.map((ts, i) => {
    if (!ts.length) return null;
    if (ts.length > 1) extra += ts.length - 1;
    return ts.reduce((a, b) => (Math.abs(b - clicks[i] - center0) < Math.abs(a - clicks[i] - center0) ? b : a));
  });
  const offsets = chosen.flatMap((t, i) => (t === null ? [] : [t - clicks[i]]));
  const missed = chosen.filter((t) => t === null).length;
  if (!offsets.length) {
    return { status: 'too-few', offsetMs: null, jitterMs: null, used: 0, missed, extra, outliers: 0, matches: clicks.map((c) => ({ click: c, tap: null, offsetMs: null, outlier: false })) };
  }
  // 3. Bỏ lần gõ lệch xa so với trung vị.
  const m0 = median(offsets);
  const limit = Math.max(OUTLIER_MIN_MS, OUTLIER_SIGMAS * robustSigma(offsets, m0));
  const matches: TapMatch[] = clicks.map((c, i) => {
    const t = chosen[i];
    if (t === null) return { click: c, tap: null, offsetMs: null, outlier: false };
    const d = t - c;
    return { click: c, tap: t, offsetMs: d, outlier: Math.abs(d - m0) > limit };
  });
  const inliers = matches.filter((x) => x.offsetMs !== null && !x.outlier).map((x) => x.offsetMs!);
  const outliers = matches.filter((x) => x.outlier).length;
  const center = median(inliers);
  const sigma = inliers.length >= 2 ? robustSigma(inliers, center) : 0;
  const base = { used: inliers.length, missed, extra, outliers, matches };
  const offsetMs = Math.round(center);
  const jitterMs = Math.round(sigma);
  if (inliers.length < MIN_VALID_TAPS) return { status: 'too-few', offsetMs, jitterMs, ...base };
  if (Math.abs(center) > MAX_ABS_OFFSET_MS || Math.abs(center) > beatMs * 0.4) return { status: 'implausible', offsetMs, jitterMs, ...base };
  if (sigma > MAX_JITTER_MS) return { status: 'unstable', offsetMs, jitterMs, ...base };
  return { status: 'ok', offsetMs, jitterMs, ...base };
}

/** Nhãn chất lượng của số đo. */
export function calibrationQuality(jitterMs: number): 'good' | 'fair' {
  return jitterMs <= GOOD_JITTER_MS ? 'good' : 'fair';
}

/** Câu giải thích khi số đo không dùng được. */
export function tapStatusMessage(a: Pick<TapAnalysis, 'status' | 'used' | 'jitterMs' | 'offsetMs'>): string {
  switch (a.status) {
    case 'ok':
      return 'Đo được.';
    case 'too-few':
      return `Chỉ có ${a.used} lần gõ khớp tiếng click (cần ít nhất ${MIN_VALID_TAPS}). Gõ đều mỗi tiếng click một lần rồi đo lại.`;
    case 'unstable':
      return `Các lần gõ dao động quá nhiều (±${a.jitterMs} ms). Nghe tiếng click (đừng nhìn màn hình), gõ đều tay rồi đo lại.`;
    case 'implausible':
      return `Độ lệch ${a.offsetMs} ms quá lớn — có thể đã gõ lệch phách. Gõ đúng lúc nghe tiếng click rồi đo lại.`;
  }
}
