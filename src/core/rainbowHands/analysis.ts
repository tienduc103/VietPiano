/**
 * Tổng kết "Cầu vồng hai bàn tay": số liệu từng tay, đồng bộ hai tay, vòng đạt tiêu chí, đoạn nên tập lại,
 * lời nhận xét, gợi ý tăng tốc và phần thưởng. Thuần, chỉ đọc bản ghi của `RainbowEngine`.
 *
 *  - Độ chính xác chỉ dùng dữ liệu CHẮC CHẮN: nốt đúng + nốt sai đã xác định; lần micro nghe không chắc tách riêng.
 *  - "Đủ hai nốt" (bước đã xong) khác "cùng lúc" (≤ ngưỡng đồng bộ) — báo riêng.
 *  - Không có tiêu chí tốc độ trong phần thưởng; không có gì bị trừ khi chơi sai.
 */
import type { Hand } from '../lessons/types';
import type { HandMark, RoundInfo, StepRecord, TimingMode } from './RainbowEngine';
import { degreeAt, degreeName } from './route';

export interface PassCriteria {
  /** Độ chính xác tối thiểu MỖI tay. */
  accuracy: number;
  /** Giữ nhịp: tỉ lệ nốt đúng nhịp tối thiểu mỗi tay. */
  onTime: number;
}

export const DEFAULT_PASS: PassCriteria = { accuracy: 0.8, onTime: 0.7 };

export interface HandStats {
  notes: number;
  hits: number;
  wrong: number;
  uncertain: number;
  /** hits / (hits + wrong); null khi chưa có lần đánh. */
  accuracy: number | null;
  /** Bước đúng ngay lần đầu (không sai). */
  firstTry: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
}

export interface SyncStats {
  /** Bước hai tay đã đủ hai nốt. */
  complete: number;
  /** Trong đó hai tay cùng lúc. */
  together: number;
  avgSpreadMs: number | null;
}

export interface Summary {
  hands: Partial<Record<Hand, HandStats>>;
  sync: SyncStats | null;
}

export interface RoundSummary extends Summary {
  round: number;
  complete: boolean;
  passed: boolean;
}

function emptyHand(): HandStats {
  return { notes: 0, hits: 0, wrong: 0, uncertain: 0, accuracy: null, firstTry: 0, onTime: 0, early: 0, late: 0, missed: 0 };
}

export function summarize(records: readonly StepRecord[]): Summary {
  const hands: Partial<Record<Hand, HandStats>> = {};
  let two = 0;
  let together = 0;
  const spreads: number[] = [];
  for (const r of records) {
    const entries = Object.entries(r.hands) as [Hand, HandMark][];
    for (const [h, m] of entries) {
      const s = (hands[h] ??= emptyHand());
      s.notes++;
      if (m.hitTime !== null) s.hits++;
      s.wrong += m.wrong;
      s.uncertain += m.uncertain;
      if (m.hitTime !== null && m.wrong === 0) s.firstTry++;
      if (m.timing === 'on-time') s.onTime++;
      else if (m.timing === 'early') s.early++;
      else if (m.timing === 'late') s.late++;
      else if (m.timing === 'missed') s.missed++;
    }
    if (entries.length > 1) {
      if (r.spreadMs !== null) {
        two++;
        spreads.push(r.spreadMs);
        if (r.together) together++;
      }
    }
  }
  for (const s of Object.values(hands)) if (s && s.hits + s.wrong > 0) s.accuracy = s.hits / (s.hits + s.wrong);
  const hasTwo = records.some((r) => Object.keys(r.hands).length > 1);
  return {
    hands,
    sync: hasTwo ? { complete: two, together, avgSpreadMs: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null } : null,
  };
}

export function roundPassed(summary: Summary, complete: boolean, timing: TimingMode, criteria: PassCriteria = DEFAULT_PASS): boolean {
  if (!complete) return false;
  return Object.values(summary.hands).every((s) => {
    if (!s) return true;
    if ((s.accuracy ?? 0) < criteria.accuracy) return false;
    return timing !== 'tempo' || s.onTime / Math.max(1, s.notes) >= criteria.onTime;
  });
}

export function summarizeRounds(records: readonly StepRecord[], rounds: readonly RoundInfo[], timing: TimingMode, criteria: PassCriteria = DEFAULT_PASS): RoundSummary[] {
  return rounds.map((info) => {
    const s = summarize(records.filter((r) => r.round === info.round));
    return { ...s, round: info.round, complete: info.complete, passed: roundPassed(s, info.complete, timing, criteria) };
  });
}

export interface WeakSegment {
  hand: Hand;
  /** Cặp vị trí (nốt trước → nốt hay sai) trong vòng 0–14. */
  fromPos: number;
  toPos: number;
  /** Khoảng luyện (vị trí 0–14, gồm cả nốt đệm hai đầu). */
  practiceFrom: number;
  practiceTo: number;
  /** "Mi–Fa". */
  label: string;
  errors: number;
}

/**
 * Đoạn nên tập lại: vị trí có nhiều lỗi CHẮC CHẮN nhất (nốt sai đã xác định + giữ nhịp: thiếu nốt) của một tay,
 * tối thiểu `minErrors`. Lần micro nghe không chắc KHÔNG tính.
 */
export function weakSegment(records: readonly StepRecord[], minErrors = 2): WeakSegment | null {
  const counts = new Map<string, { hand: Hand; pos: number; errors: number }>();
  for (const r of records) {
    for (const [h, m] of Object.entries(r.hands) as [Hand, HandMark][]) {
      const e = m.wrong + (m.timing === 'missed' ? 1 : 0);
      if (e === 0) continue;
      const key = `${h}:${r.pos}`;
      const c = counts.get(key) ?? { hand: h, pos: r.pos, errors: 0 };
      c.errors += e;
      counts.set(key, c);
    }
  }
  let best: { hand: Hand; pos: number; errors: number } | null = null;
  for (const c of counts.values()) if (!best || c.errors > best.errors) best = c;
  if (!best || best.errors < minErrors) return null;
  const fromPos = best.pos === 0 ? 0 : best.pos - 1;
  const toPos = best.pos === 0 ? 1 : best.pos;
  return {
    hand: best.hand,
    fromPos,
    toPos,
    practiceFrom: Math.max(0, fromPos - 1),
    practiceTo: Math.min(14, toPos + 1),
    label: `${degreeName(degreeAt(fromPos))}–${degreeName(degreeAt(toPos))}`,
    errors: best.errors,
  };
}

const NUMBER_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
export const HAND_LABEL: Record<Hand, string> = { left: 'tay trái', right: 'tay phải' };

/** Lời nhận xét ngắn theo quy tắc — chỉ nói điều dữ liệu cho phép. */
export function feedbackText(opts: { roundsComplete: number; weak: WeakSegment | null; sync: SyncStats | null; timing: TimingMode }): string {
  const parts: string[] = [];
  parts.push(opts.roundsComplete > 0 ? `Con hoàn thành ${numberWord(opts.roundsComplete)} vòng.` : 'Con đã cố gắng — mình thử lại chậm hơn nhé.');
  if (opts.weak) parts.push(`Đoạn ${opts.weak.label} của ${HAND_LABEL[opts.weak.hand]} cần tập thêm.`);
  else if (opts.roundsComplete > 0) parts.push('Các nốt đều chắc tay rồi!');
  if (opts.sync && opts.sync.complete > 0) {
    const rate = opts.sync.together / opts.sync.complete;
    if (rate >= 0.8) parts.push('Hai tay bấm cùng lúc rất đều.');
    else if (opts.timing === 'wait') parts.push('Lần sau thử bấm hai tay cùng một lúc nhé.');
  }
  return parts.join(' ');
}

/** Một vòng giữ nhịp đã chơi (lưu để gợi ý tăng tốc). */
export interface TempoRoundEntry {
  bpm: number;
  passed: boolean;
  at: number;
}

export interface TempoCriteria {
  /** Số vòng LIÊN TIẾP gần nhất ở nhịp này phải đạt. */
  rounds: number;
  step: number;
  maxBpm: number;
}

export const DEFAULT_TEMPO_CRITERIA: TempoCriteria = { rounds: 3, step: 6, maxBpm: 96 };

/** Gợi ý nhịp nhanh hơn CHỈ khi `rounds` vòng gần nhất ở đúng nhịp này đều đạt tiêu chí; null = giữ nguyên. */
export function adviseTempo(history: readonly TempoRoundEntry[], bpm: number, criteria: TempoCriteria = DEFAULT_TEMPO_CRITERIA): number | null {
  const recent = history.filter((h) => h.bpm === bpm).slice(-criteria.rounds);
  if (recent.length < criteria.rounds || !recent.every((h) => h.passed)) return null;
  const next = Math.min(criteria.maxBpm, bpm + criteria.step);
  return next > bpm ? next : null;
}

export type StickerKind = 'mission' | 'accuracy' | 'together' | 'progress';

export const STICKERS: Record<StickerKind, { icon: string; label: string; why: string }> = {
  mission: { icon: '🌈', label: 'Cầu vồng rực rỡ', why: 'Hoàn thành nhiệm vụ' },
  accuracy: { icon: '⭐', label: 'Ngôi sao chính xác', why: 'Mọi vòng đều đạt tiêu chí' },
  together: { icon: '🤝', label: 'Đôi tay ăn ý', why: 'Hai tay bấm cùng lúc ≥ 80% bước' },
  progress: { icon: '🌱', label: 'Mầm tiến bộ', why: 'Chính xác hơn lần trước' },
};

/**
 * Phần thưởng của nhiệm vụ: hoàn thành (mọi vòng chơi hết), chính xác, phối hợp, tiến bộ so với lần trước cùng chế độ.
 * Không xét tốc độ.
 */
export function missionRewards(opts: { roundsTarget: number; rounds: readonly RoundSummary[]; sync: SyncStats | null; accuracy: number | null; previousAccuracy: number | null }): StickerKind[] {
  const out: StickerKind[] = [];
  const complete = opts.rounds.filter((r) => r.complete).length;
  if (complete < opts.roundsTarget) return out;
  out.push('mission');
  if (opts.rounds.length > 0 && opts.rounds.every((r) => r.passed)) out.push('accuracy');
  if (opts.sync && opts.sync.complete > 0 && opts.sync.together / opts.sync.complete >= 0.8) out.push('together');
  if (opts.accuracy !== null && opts.previousAccuracy !== null && opts.accuracy > opts.previousAccuracy + 0.02) out.push('progress');
  return out;
}

/** Độ chính xác chung (mọi tay) của một tổng kết. */
export function overallAccuracy(summary: Summary): number | null {
  let hits = 0;
  let wrong = 0;
  for (const s of Object.values(summary.hands)) if (s) (hits += s.hits), (wrong += s.wrong);
  return hits + wrong ? hits / (hits + wrong) : null;
}

/** Bạn thú được đưa về nhà theo vòng (đổi nhân vật giữa các vòng cho đỡ nhàm). */
export const ANIMALS = ['🐥', '🐿️', '🦔', '🐢', '🐞', '🦆', '🐸'] as const;
export function animalFor(round: number): string {
  return ANIMALS[(Math.max(1, round) - 1) % ANIMALS.length];
}

/** Một chặng của "Tập lại đoạn này": tay đang gặp khó tập riêng trước, rồi ghép hai tay. */
export interface RetryPhase {
  hands: 'left' | 'right' | 'both';
  from: number;
  to: number;
  rounds: number;
  label: string;
}

export function retryPlan(weak: WeakSegment, twoHands: boolean, rounds = 3): RetryPhase[] {
  const solo: RetryPhase = { hands: weak.hand, from: weak.practiceFrom, to: weak.practiceTo, rounds, label: `${weak.hand === 'left' ? 'Tay trái' : 'Tay phải'} tập riêng đoạn ${weak.label}` };
  if (!twoHands) return [solo];
  return [solo, { hands: 'both', from: weak.practiceFrom, to: weak.practiceTo, rounds, label: `Ghép hai tay đoạn ${weak.label}` }];
}
