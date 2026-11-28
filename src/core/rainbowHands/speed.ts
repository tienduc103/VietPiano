/**
 * Chế độ "Nhanh – chậm" của Cầu vồng hai bàn tay: máy đưa ra tốc độ (thật chậm / chậm / nhanh / thật nhanh) cho từng
 * chặng, bé đánh đúng nốt với KHOẢNG CÁCH giữa hai lần bấm nằm trong dải của tốc độ đó. KHÔNG theo nhịp nhạc
 * (không metronome, không phách) — mục đích là tay linh hoạt đổi nhanh / chậm.
 *
 *  - Nốt đúng / sai vẫn do `RainbowEngine` (chế độ chờ) chấm; `SpeedJudge` chỉ đo khoảng giữa hai bước liên tiếp
 *    (mốc bước = lần bấm SỚM NHẤT của bước — hai tay: tay bấm trước).
 *  - Chậm quá (chờ quá giới hạn trên) → cá sấu đến gần, báo NGAY lúc đang chờ (một lần mỗi bước); nhanh quá (dưới giới
 *    hạn dưới) → sét / khúc củi. Đủ `strikesToCatch` lần → "bị bắt" (hoạt hình), đồng hồ nguy hiểm về 0, chơi tiếp —
 *    không bắt chơi lại vòng, không trừ sticker. `okToHeal` lần đúng tốc độ liền nhau → bớt một nấc nguy hiểm.
 *  - Bước đầu của vòng và bước đầu của chặng tốc độ mới KHÔNG chấm (bé vừa đọc tốc độ mới).
 *  - Tạm dừng: thời gian dừng không tính vào khoảng chờ.
 */
import { seeded } from '../games/random';

export type SpeedId = 'very-slow' | 'slow' | 'fast' | 'very-fast';
export const SPEED_IDS: readonly SpeedId[] = ['very-slow', 'slow', 'fast', 'very-fast'];
export type SpeedEase = 'easy' | 'normal';

export const SPEED_INFO: Record<SpeedId, { label: string; icon: string; band: readonly [number, number]; cue: string }> = {
  'very-slow': { label: 'Thật chậm', icon: '🐌', band: [1500, 3000], cue: 'Thật chậm như ốc sên — đếm thầm "một… hai…" rồi mới bấm' },
  slow: { label: 'Chậm', icon: '🐢', band: [800, 1500], cue: 'Chậm như rùa — bấm, đợi một chút, bấm' },
  fast: { label: 'Nhanh', icon: '🐇', band: [350, 800], cue: 'Nhanh như thỏ — bấm liền tay' },
  'very-fast': { label: 'Thật nhanh', icon: '🐆', band: [150, 350], cue: 'Thật nhanh như báo — lướt ngón thật gọn' },
};

/** Dải (ms giữa hai lần bấm) của tốc độ theo mức dễ: "Dễ" nới mỗi đầu (bé nhỏ). */
export function speedBand(id: SpeedId, ease: SpeedEase): [number, number] {
  const [lo, hi] = SPEED_INFO[id].band;
  return ease === 'easy' ? [Math.round(lo * 0.8), Math.round(hi * 1.25)] : [lo, hi];
}

/** Khoảng mẫu (giữa dải, trung bình nhân) — phát mẫu đúng tốc độ. */
export function sampleInterval(id: SpeedId): number {
  const [lo, hi] = SPEED_INFO[id].band;
  return Math.round(Math.sqrt(lo * hi));
}

/**
 * Kế hoạch tốc độ: mỗi `segment` bước một tốc độ, đổi khác chặng trước (nếu có hơn một tốc độ được chọn).
 * Theo seed → lặp lại được. Trả về [vòng][bước].
 */
export function speedPlan(stepsPerRound: number, rounds: number, enabled: readonly SpeedId[], segment: number, seed: number): SpeedId[][] {
  const pool = enabled.length ? enabled : (['slow', 'fast'] as SpeedId[]);
  const rnd = seeded(seed);
  const seg = Math.max(1, Math.floor(segment));
  let prev: SpeedId | null = null;
  const out: SpeedId[][] = [];
  for (let r = 0; r < rounds; r++) {
    const row: SpeedId[] = [];
    for (let i = 0; i < stepsPerRound; i++) {
      if (i % seg === 0) {
        const choices: SpeedId[] = pool.length > 1 ? pool.filter((s) => s !== prev) : [...pool];
        prev = choices[Math.floor(rnd() * choices.length)];
      }
      row.push(prev!);
    }
    out.push(row);
  }
  return out;
}

export type SpeedKind = 'ok' | 'slow' | 'fast' | 'free';
export type Hazard = 'crocodile' | 'lightning' | 'log';

export interface SpeedVerdict {
  round: number;
  index: number;
  speed: SpeedId;
  kind: SpeedKind;
  /** Khoảng từ bước trước (ms); null với bước không chấm. */
  intervalMs: number | null;
}

export interface SpeedEvent {
  kind: 'ok' | 'slow' | 'fast' | 'free' | 'slow-live';
  speed: SpeedId;
  intervalMs: number | null;
  /** Nguy hiểm sau sự kiện (0…strikesToCatch−1). */
  danger: number;
  /** Lần này bị bắt (đủ số lần cảnh báo). */
  caught: Hazard | null;
  /** Hoạt hình cảnh báo của lần chậm / nhanh này. */
  hazard: Hazard | null;
}

export interface SpeedJudgeConfig {
  ease: SpeedEase;
  strikesToCatch: number;
  okToHeal: number;
}

export const DEFAULT_SPEED_JUDGE: SpeedJudgeConfig = { ease: 'normal', strikesToCatch: 3, okToHeal: 3 };

export class SpeedJudge {
  private readonly config: SpeedJudgeConfig;
  private last: { round: number; index: number; time: number } | null = null;
  private liveFlagged = false;
  private pausedAt: number | null = null;
  private danger = 0;
  private okStreak = 0;
  private fastHits = 0;
  private readonly verdicts: SpeedVerdict[] = [];
  private caught: Hazard[] = [];

  constructor(
    private readonly plan: SpeedId[][],
    private readonly segment: number,
    config: Partial<SpeedJudgeConfig> = {},
  ) {
    this.config = { ...DEFAULT_SPEED_JUDGE, ...config };
  }

  /** Tốc độ của bước (vòng 1…; vòng vượt kế hoạch — chơi thêm — lặp lại kế hoạch). */
  target(round: number, index: number): SpeedId {
    const row = this.plan[(Math.max(1, round) - 1) % this.plan.length];
    return row[Math.min(index, row.length - 1)];
  }

  /** Bước đầu của một chặng (đổi tốc độ) — không chấm khoảng vào bước này. */
  isSegmentStart(index: number): boolean {
    return index % Math.max(1, this.segment) === 0;
  }

  band(round: number, index: number): [number, number] {
    return speedBand(this.target(round, index), this.config.ease);
  }

  getDanger(): number {
    return this.danger;
  }

  /** Đã chờ bao lâu kể từ bước trước (ms, trừ thời gian dừng) — kim đồng hồ tốc độ; null khi chưa có bước. */
  elapsed(now: number): number | null {
    if (!this.last) return null;
    return (this.pausedAt ?? now) - this.last.time;
  }

  getVerdicts(): readonly SpeedVerdict[] {
    return this.verdicts;
  }

  getCaught(): readonly Hazard[] {
    return this.caught;
  }

  /** Bước `index` của vòng `round` vừa xong, mốc `time` (lần bấm sớm nhất của bước). */
  onStep(round: number, index: number, time: number): SpeedEvent {
    const speed = this.target(round, index);
    const prev = this.last;
    const flagged = this.liveFlagged;
    this.last = { round, index, time };
    this.liveFlagged = false;
    if (!prev || prev.round !== round || index !== prev.index + 1 || this.isSegmentStart(index)) {
      this.verdicts.push({ round, index, speed, kind: 'free', intervalMs: null });
      return { kind: 'free', speed, intervalMs: null, danger: this.danger, caught: null, hazard: null };
    }
    const intervalMs = time - prev.time;
    const [lo, hi] = speedBand(speed, this.config.ease);
    const kind: SpeedKind = intervalMs > hi ? 'slow' : intervalMs < lo ? 'fast' : 'ok';
    this.verdicts.push({ round, index, speed, kind, intervalMs });
    if (kind === 'ok') {
      this.okStreak++;
      if (this.okStreak >= this.config.okToHeal) {
        this.okStreak = 0;
        this.danger = Math.max(0, this.danger - 1);
      }
      return { kind, speed, intervalMs, danger: this.danger, caught: null, hazard: null };
    }
    // Chậm quá mà đã bị cá sấu nhắc lúc đang chờ → không tính thêm lần nữa.
    if (kind === 'slow' && flagged) return { kind, speed, intervalMs, danger: this.danger, caught: null, hazard: null };
    return { kind, speed, intervalMs, ...this.strike(kind) };
  }

  /** Gọi mỗi khung khi đang chờ bước `index`: chờ quá giới hạn trên → cá sấu đến (một lần mỗi bước). */
  tick(round: number, index: number, now: number): SpeedEvent | null {
    if (this.pausedAt !== null || this.liveFlagged || !this.last || this.last.round !== round || index !== this.last.index + 1 || this.isSegmentStart(index)) return null;
    const [, hi] = speedBand(this.target(round, index), this.config.ease);
    if (now - this.last.time <= hi) return null;
    this.liveFlagged = true;
    return { kind: 'slow-live', speed: this.target(round, index), intervalMs: now - this.last.time, ...this.strike('slow') };
  }

  pause(time: number): void {
    if (this.pausedAt === null) this.pausedAt = time;
  }

  resume(time: number): void {
    if (this.pausedAt === null) return;
    if (this.last) this.last = { ...this.last, time: this.last.time + Math.max(0, time - this.pausedAt) };
    this.pausedAt = null;
  }

  private strike(kind: 'slow' | 'fast'): { danger: number; caught: Hazard | null; hazard: Hazard } {
    this.okStreak = 0;
    const hazard: Hazard = kind === 'slow' ? 'crocodile' : this.fastHits++ % 2 === 0 ? 'lightning' : 'log';
    this.danger++;
    if (this.danger >= this.config.strikesToCatch) {
      this.danger = 0;
      this.caught.push(hazard);
      return { danger: 0, caught: hazard, hazard };
    }
    return { danger: this.danger, caught: null, hazard };
  }
}

export interface SpeedStats {
  graded: number;
  ok: number;
  slow: number;
  fast: number;
  bySpeed: Record<SpeedId, { graded: number; ok: number; slow: number; fast: number }>;
}

export function speedStats(verdicts: readonly SpeedVerdict[]): SpeedStats {
  const empty = () => ({ graded: 0, ok: 0, slow: 0, fast: 0 });
  const bySpeed = { 'very-slow': empty(), slow: empty(), fast: empty(), 'very-fast': empty() } as SpeedStats['bySpeed'];
  const all = empty();
  for (const v of verdicts) {
    if (v.kind === 'free') continue;
    for (const s of [all, bySpeed[v.speed]]) {
      s.graded++;
      s[v.kind]++;
    }
  }
  return { ...all, bySpeed };
}

/** Lời nhận xét tốc độ: chỉ dựa trên khoảng đã đo. */
export function speedFeedback(stats: SpeedStats): string {
  if (stats.graded === 0) return '';
  const parts = [`Con giữ đúng tốc độ ${stats.ok}/${stats.graded} lần.`];
  let weakest: { id: SpeedId; rate: number; s: SpeedStats['bySpeed'][SpeedId] } | null = null;
  for (const id of SPEED_IDS) {
    const s = stats.bySpeed[id];
    if (s.graded < 2) continue;
    const rate = s.ok / s.graded;
    if (rate < 0.7 && (!weakest || rate < weakest.rate)) weakest = { id, rate, s };
  }
  if (weakest) {
    const tooFast = weakest.s.fast > weakest.s.slow;
    parts.push(`${SPEED_INFO[weakest.id].label}: con hay ${tooFast ? 'bấm nhanh quá' : 'chậm quá'} — tập thêm nhé.`);
  } else if (stats.ok / stats.graded >= 0.8) parts.push('Tay đổi nhanh – chậm rất linh hoạt!');
  return parts.join(' ');
}
