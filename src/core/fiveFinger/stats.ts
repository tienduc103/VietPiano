/**
 * Cá nhân hoá "5 ngón – 8 nốt": thống kê theo hồ sơ (hàm thuần, lưu ở storage.ts).
 *
 * Theo dõi: tỉ lệ nốt đúng theo từng tay, nốt hay sai (+ nốt bị nhầm sang), ngón ĐƯỢC HƯỚNG DẪN cho từng nốt,
 * thời gian phản ứng, độ chính xác nhịp (khi bật chấm nhịp), độ đồng thời hai tay, chuyển động (phím → phím) hay sai.
 *
 * Lưu ý: micro / đàn MIDI thông thường không biết người học dùng ngón nào — số ngón ở đây chỉ là ngón được hướng
 * dẫn, KHÔNG kết luận người học dùng sai ngón.
 */

import type { Hand } from '../lessons/types';
import type { DrillAttempt, DrillSummary, StepRecord } from './FiveFingerDrill';
import type { ChainStep, FiveFingerDifficulty, HandMode, Movement } from './generator';
import type { PositionId } from './positions';

export interface HandStats {
  /** Số nốt đúng (mỗi nốt của chuỗi tính một lần). */
  correct: number;
  /** Số lần đánh sai khi đang chờ nốt của tay này. */
  wrong: number;
  reactionSumMs: number;
  reactionCount: number;
  /** Số chuỗi có tay này tham gia / không sai nốt nào. */
  chains: number;
  perfectChains: number;
}

export interface NoteStat {
  hand: Hand;
  midi: number;
  pitch: string;
  /** Ngón được hướng dẫn cho nốt này (không phải ngón người học thực sự dùng). */
  finger: number;
  /** Số lần nốt này là nốt cần đánh. */
  attempts: number;
  /** Số bước có đánh sai trước khi đánh đúng nốt này. */
  missed: number;
  wrong: number;
  /** Nốt bị đánh nhầm sang: MIDI → số lần. */
  confusions: Record<string, number>;
}

export interface MovementStat extends Movement {
  attempts: number;
  /** Số lần bước tới phím `to` có đánh sai. */
  errors: number;
}

export interface ChainHistoryEntry {
  at: number;
  seed: number;
  handMode: HandMode;
  difficulty: FiveFingerDifficulty;
  position: PositionId;
  /** Giai đoạn luyện từng tay (trước khi chơi hai tay cùng lúc); không có = chuỗi chính. */
  phase?: Hand;
  steps: number;
  accuracy: number;
  firstTry: number;
  avgReactionMs: number | null;
  lateSync: number;
  rhythmOnTime?: number;
  rhythmIntervals?: number;
  focus?: Movement[];
}

export interface FiveFingerStats {
  hands: Record<Hand, HandStats>;
  notes: Record<string, NoteStat>;
  movements: Record<string, MovementStat>;
  rhythm: { intervals: number; onTime: number };
  sync: { steps: number; together: number; lateSync: number };
  history: ChainHistoryEntry[];
}

export const MAX_HISTORY = 300;

const emptyHand = (): HandStats => ({ correct: 0, wrong: 0, reactionSumMs: 0, reactionCount: 0, chains: 0, perfectChains: 0 });

export function emptyStats(): FiveFingerStats {
  return { hands: { right: emptyHand(), left: emptyHand() }, notes: {}, movements: {}, rhythm: { intervals: 0, onTime: 0 }, sync: { steps: 0, together: 0, lateSync: 0 }, history: [] };
}

export const noteKey = (hand: Hand, midi: number) => `${hand}:${midi}`;
export const movementKey = (m: Movement) => `${m.hand}:${m.from}>${m.to}`;

export interface ChainResultInput {
  at: number;
  seed: number;
  handMode: HandMode;
  difficulty: FiveFingerDifficulty;
  position: PositionId;
  phase?: Hand;
  steps: readonly ChainStep[];
  records: readonly StepRecord[];
  attempts: readonly DrillAttempt[];
  summary: DrillSummary;
  focus?: readonly Movement[];
}

/** Cộng kết quả một chuỗi vào thống kê (trả về bản mới, không sửa bản cũ). */
export function applyChainResult(prev: FiveFingerStats, r: ChainResultInput): FiveFingerStats {
  const s: FiveFingerStats = structuredClone(prev);
  const handsInChain = new Set(r.steps.flatMap((st) => st.notes.map((n) => n.hand)));
  const wrongByHand: Record<Hand, number> = { right: 0, left: 0 };
  for (const a of r.attempts) if (!a.ok) wrongByHand[a.expected.hand]++;

  // Nốt + chuyển động.
  const lastIndex: Partial<Record<Hand, number>> = {};
  r.steps.forEach((step, i) => {
    const wrongs = r.attempts.filter((a) => a.step === i && !a.ok);
    for (const n of step.notes) {
      const key = noteKey(n.hand, n.midi);
      const ns = (s.notes[key] ??= { hand: n.hand, midi: n.midi, pitch: n.pitch, finger: n.finger, attempts: 0, missed: 0, wrong: 0, confusions: {} });
      ns.finger = n.finger;
      ns.pitch = n.pitch;
      ns.attempts++;
      const mine = wrongs.filter((a) => a.expected.hand === n.hand && (step.notes.length === 1 || a.expected.midi === n.midi));
      if (mine.length) ns.missed++;
      ns.wrong += mine.length;
      for (const a of mine) ns.confusions[a.played] = (ns.confusions[a.played] ?? 0) + 1;
      const from = lastIndex[n.hand];
      if (from !== undefined) {
        const m: Movement = { hand: n.hand, from, to: n.index };
        const ms = (s.movements[movementKey(m)] ??= { ...m, attempts: 0, errors: 0 });
        ms.attempts++;
        if (mine.length) ms.errors++;
      }
      lastIndex[n.hand] = n.index;
    }
    if (step.notes.length > 1) {
      s.sync.steps++;
      const rec = r.records[i];
      if (rec && rec.lateSync === 0) s.sync.together++;
      s.sync.lateSync += rec?.lateSync ?? 0;
    }
  });

  // Theo tay.
  for (const hand of handsInChain) {
    const hs = s.hands[hand];
    hs.correct += r.steps.reduce((sum, st) => sum + st.notes.filter((n) => n.hand === hand).length, 0);
    hs.wrong += wrongByHand[hand];
    hs.chains++;
    if (wrongByHand[hand] === 0) hs.perfectChains++;
    r.steps.forEach((st, i) => {
      const rt = r.records[i]?.reactionMs;
      if (st.notes.length === 1 && st.notes[0].hand === hand && rt !== null && rt !== undefined) {
        hs.reactionSumMs += rt;
        hs.reactionCount++;
      }
    });
  }

  if (r.summary.rhythm) {
    s.rhythm.intervals += r.summary.rhythm.intervals;
    s.rhythm.onTime += r.summary.rhythm.onTime;
  }

  s.history.push({
    at: r.at,
    seed: r.seed,
    handMode: r.handMode,
    difficulty: r.difficulty,
    position: r.position,
    ...(r.phase ? { phase: r.phase } : {}),
    steps: r.summary.steps,
    accuracy: r.summary.accuracy,
    firstTry: r.summary.firstTry,
    avgReactionMs: r.summary.avgReactionMs,
    lateSync: r.summary.lateSync,
    ...(r.summary.rhythm ? { rhythmOnTime: r.summary.rhythm.onTime, rhythmIntervals: r.summary.rhythm.intervals } : {}),
    ...(r.focus?.length ? { focus: [...r.focus] } : {}),
  });
  if (s.history.length > MAX_HISTORY) s.history = s.history.slice(-MAX_HISTORY);
  return s;
}

export function handAccuracy(h: HandStats): number | null {
  const total = h.correct + h.wrong;
  return total === 0 ? null : h.correct / total;
}

export function handReactionMs(h: HandStats): number | null {
  return h.reactionCount === 0 ? null : h.reactionSumMs / h.reactionCount;
}

/** Chuyển động còn yếu (đủ dữ liệu, sai ≥ 2 lần và ≥ 25%), yếu nhất trước. */
export function weakMovements(stats: FiveFingerStats, hands: readonly Hand[] = ['right', 'left'], limit = 3): Movement[] {
  return Object.values(stats.movements)
    .filter((m) => hands.includes(m.hand) && m.attempts >= 3 && m.errors >= 2 && m.errors / m.attempts >= 0.25)
    .sort((a, b) => b.errors / b.attempts - a.errors / a.attempts || b.errors - a.errors)
    .slice(0, limit)
    .map(({ hand, from, to }) => ({ hand, from, to }));
}

/** Nốt hay sai nhất (sai ≥ 2 lần), kèm nốt bị nhầm nhiều nhất. */
export function troubleNotes(stats: FiveFingerStats, limit = 3): (NoteStat & { topConfusion: number | null })[] {
  return Object.values(stats.notes)
    .filter((n) => n.wrong >= 2)
    .sort((a, b) => b.missed / b.attempts - a.missed / a.attempts || b.wrong - a.wrong)
    .slice(0, limit)
    .map((n) => {
      const top = Object.entries(n.confusions).sort((a, b) => b[1] - a[1])[0];
      return { ...n, topConfusion: top ? Number(top[0]) : null };
    });
}

export type DifficultyAdvice = 'harder' | 'easier' | 'stay';

const NEXT: Record<FiveFingerDifficulty, FiveFingerDifficulty | null> = { easy: 'medium', medium: 'hard', hard: null };
const PREV: Record<FiveFingerDifficulty, FiveFingerDifficulty | null> = { easy: null, medium: 'easy', hard: 'medium' };

/** Số chuỗi gần nhất (cùng cách tay + độ khó) dùng để đề xuất. */
export const ADVICE_WINDOW = 3;

/**
 * Đề xuất độ khó: 3 chuỗi chính gần nhất cùng cách tay + độ khó đều chính xác ≥ 90% và ≥ 75% bước đúng ngay → tăng;
 * trung bình < 65% → giảm (và bộ sinh tự ưu tiên chuyển động yếu).
 */
export function adviseDifficulty(stats: FiveFingerStats, handMode: HandMode, difficulty: FiveFingerDifficulty): { advice: DifficultyAdvice; target: FiveFingerDifficulty } {
  const recent = stats.history.filter((h) => !h.phase && h.handMode === handMode && h.difficulty === difficulty).slice(-ADVICE_WINDOW);
  if (recent.length < ADVICE_WINDOW) return { advice: 'stay', target: difficulty };
  const good = recent.every((h) => h.accuracy >= 0.9 && h.firstTry / Math.max(1, h.steps) >= 0.75);
  if (good && NEXT[difficulty]) return { advice: 'harder', target: NEXT[difficulty]! };
  const mean = recent.reduce((s, h) => s + h.accuracy, 0) / recent.length;
  if (mean < 0.65 && PREV[difficulty]) return { advice: 'easier', target: PREV[difficulty]! };
  return { advice: 'stay', target: difficulty };
}

/** Chuẩn hoá dữ liệu đọc từ localStorage (bỏ phần hỏng, giữ phần đọc được). */
export function sanitizeStats(raw: unknown): FiveFingerStats {
  const out = emptyStats();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<FiveFingerStats>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const hand of ['right', 'left'] as const) {
    const h = r.hands?.[hand];
    if (h && typeof h === 'object') {
      out.hands[hand] = {
        correct: num(h.correct),
        wrong: num(h.wrong),
        reactionSumMs: num(h.reactionSumMs),
        reactionCount: num(h.reactionCount),
        chains: num(h.chains),
        perfectChains: num(h.perfectChains),
      };
    }
  }
  const isHand = (v: unknown): v is Hand => v === 'right' || v === 'left';
  if (r.notes && typeof r.notes === 'object') {
    for (const [k, n] of Object.entries(r.notes)) {
      if (!n || !isHand(n.hand) || typeof n.midi !== 'number') continue;
      out.notes[k] = {
        hand: n.hand,
        midi: n.midi,
        pitch: typeof n.pitch === 'string' ? n.pitch : '',
        finger: num(n.finger),
        attempts: num(n.attempts),
        missed: num(n.missed),
        wrong: num(n.wrong),
        confusions: n.confusions && typeof n.confusions === 'object' ? { ...n.confusions } : {},
      };
    }
  }
  if (r.movements && typeof r.movements === 'object') {
    for (const [k, m] of Object.entries(r.movements)) {
      if (!m || !isHand(m.hand) || typeof m.from !== 'number' || typeof m.to !== 'number') continue;
      out.movements[k] = { hand: m.hand, from: m.from, to: m.to, attempts: num(m.attempts), errors: num(m.errors) };
    }
  }
  if (r.rhythm) out.rhythm = { intervals: num(r.rhythm.intervals), onTime: num(r.rhythm.onTime) };
  if (r.sync) out.sync = { steps: num(r.sync.steps), together: num(r.sync.together), lateSync: num(r.sync.lateSync) };
  if (Array.isArray(r.history)) {
    out.history = r.history
      .filter((h): h is ChainHistoryEntry => !!h && typeof h === 'object' && typeof h.seed === 'number' && typeof h.accuracy === 'number' && typeof h.handMode === 'string')
      .slice(-MAX_HISTORY);
  }
  return out;
}
