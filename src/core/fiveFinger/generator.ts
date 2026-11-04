/**
 * Bộ tạo chuỗi 8 nốt tự động cho "5 ngón – 8 nốt liên tục".
 *
 *  - Hàm thuần theo (tham số, seed): cùng seed → cùng chuỗi (lưu seed để tái tạo / luyện lại bài tập).
 *  - Chỉ dùng 5 phím của vị trí bàn tay (chuỗi lưu theo chỉ số phím 0–4, đổi sang MIDI theo vị trí đang chọn).
 *  - Cho phép lặp nốt, có giới hạn số lần lặp liền nhau.
 *  - Độ khó quyết định bước nhảy: Dễ ưu tiên liền bậc (tối đa một lần cách 1 phím), Trung bình có nhảy cách 1 phím
 *    + nốt lặp, Khó nhảy bất kỳ hai phím trong nhóm 5 phím + trường độ thay đổi.
 *  - Cấu trúc: bắt đầu và kết thúc ở phím "vững" (bậc 1, 3, 5 của thế tay), đủ số phím khác nhau.
 *  - `focus`: chuyển động còn yếu (từ phím → phím) được ưu tiên sinh nhiều hơn (cá nhân hoá).
 *  - `nextChain` tránh lặp lại nguyên chuỗi vừa hoàn thành (đổi seed có quy tắc → vẫn tái tạo được).
 */

import { seeded, type Random } from '../games/random';
import type { Duration, Hand, Lesson } from '../lessons/types';
import { parseAccompaniment, parseNotes } from '../lessons/notation';
import { fingerFor, placementKeys, placementPitch, positionDef, type HandPlacement, type PositionId } from './positions';

export type FiveFingerDifficulty = 'easy' | 'medium' | 'hard';
/** Tay phải / tay trái / luân phiên (mỗi nốt đổi tay) / hai tay đồng thời. */
export type HandMode = 'right' | 'left' | 'alternate' | 'together';

export const CHAIN_LENGTH = 8;

export const DIFFICULTY_LABEL: Record<FiveFingerDifficulty, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };
export const HAND_MODE_LABEL: Record<HandMode, string> = {
  right: 'Tay phải',
  left: 'Tay trái',
  alternate: 'Luân phiên',
  together: 'Hai tay cùng lúc',
};

/** Một chuyển động từ phím `from` sang phím `to` (chỉ số 0–4 trong vị trí) của một tay. */
export interface Movement {
  hand: Hand;
  from: number;
  to: number;
}

export interface ChainParams {
  handMode: HandMode;
  difficulty: FiveFingerDifficulty;
  /** Chuyển động cần luyện thêm (sinh từ thống kê lỗi). */
  focus?: readonly Movement[];
}

export interface GeneratedChain {
  /** Seed thực sự đã dùng (sau khi tránh trùng). */
  seed: number;
  params: ChainParams;
  /** Chỉ số phím tay phải theo thứ tự đánh (null nếu tay phải không chơi). */
  right: number[] | null;
  left: number[] | null;
  /** Tay của từng sự kiện nốt (luân phiên: R L R L…; cùng lúc: 'right' = bước có cả hai tay). */
  order: Hand[];
  /** Trường độ từng sự kiện (cùng lúc: hai tay chung trường độ). */
  durations: Duration[];
}

interface Rules {
  /** Trọng số theo khoảng cách |bước nhảy| 0–4 (0 = lặp nốt). */
  weights: readonly [number, number, number, number, number];
  /** Số lần nhảy cách 1 phím trở lên tối đa (Infinity = không giới hạn). */
  maxSkips: number;
  maxRepeatRun: number;
  minDistinct: number;
  starts: readonly number[];
  ends: readonly number[];
  requireRepeat: boolean;
  requireSkip: boolean;
  requireLeap: boolean;
}

const STABLE = [0, 2, 4] as const;

export const RULES: Record<FiveFingerDifficulty, Rules> = {
  easy: { weights: [0.6, 6, 0.8, 0, 0], maxSkips: 1, maxRepeatRun: 2, minDistinct: 3, starts: STABLE, ends: STABLE, requireRepeat: false, requireSkip: false, requireLeap: false },
  medium: { weights: [1.2, 4, 3, 0, 0], maxSkips: Infinity, maxRepeatRun: 2, minDistinct: 3, starts: STABLE, ends: STABLE, requireRepeat: true, requireSkip: true, requireLeap: false },
  hard: { weights: [0.8, 2.5, 2.5, 2, 1.5], maxSkips: Infinity, maxRepeatRun: 3, minDistinct: 4, starts: [0, 1, 2, 3, 4], ends: STABLE, requireRepeat: false, requireSkip: false, requireLeap: true },
};

/** Mẫu tiết tấu một ô 4/4 (cho mức Khó), nhóm theo số nốt trong ô. */
const BAR_PATTERNS: Record<3 | 4 | 5, readonly Duration[][]> = {
  3: [
    ['h', 'q', 'q'],
    ['q', 'q', 'h'],
    ['q', 'h', 'q'],
  ],
  4: [
    ['q', 'q', 'q', 'q'],
    ['h', '8', '8', 'q'],
    ['q', '8', '8', 'h'],
    ['qd', '8', 'q', 'q'],
    ['q', 'q', 'qd', '8'],
    ['8', '8', 'q', 'h'],
    ['h', 'q', '8', '8'],
  ],
  5: [
    ['8', '8', 'q', 'q', 'q'],
    ['q', 'q', '8', '8', 'q'],
    ['8', '8', '8', '8', 'h'],
  ],
};
const BAR_SPLITS: readonly [3 | 4 | 5, 3 | 4 | 5][] = [
  [4, 4],
  [4, 4],
  [3, 5],
  [5, 3],
];

function pick<T>(items: readonly T[], rng: Random): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function pickWeighted(candidates: readonly { value: number; weight: number }[], rng: Random): number | null {
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r < 0) return c.value;
  }
  return candidates[candidates.length - 1].value;
}

/** Chuỗi có thoả các yêu cầu cấu trúc của độ khó không. */
export function satisfiesRules(seq: readonly number[], difficulty: FiveFingerDifficulty): boolean {
  const rules = RULES[difficulty];
  if (seq.some((x) => !Number.isInteger(x) || x < 0 || x > 4)) return false;
  if (!rules.starts.includes(seq[0]) || !rules.ends.includes(seq[seq.length - 1])) return false;
  let skips = 0;
  let repeats = 0;
  let leaps = 0;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    const d = Math.abs(seq[i] - seq[i - 1]);
    if (rules.weights[d] === 0) return false;
    if (d >= 2) skips++;
    if (d >= 3) leaps++;
    if (d === 0) {
      repeats++;
      run++;
      if (run > rules.maxRepeatRun) return false;
    } else run = 1;
  }
  if (skips > rules.maxSkips) return false;
  const long = seq.length >= CHAIN_LENGTH;
  if (new Set(seq).size < Math.min(rules.minDistinct, long ? 5 : 3)) return false;
  if (long && rules.requireRepeat && repeats === 0) return false;
  if (rules.requireSkip && !seq.some((x, i) => i > 0 && Math.abs(x - seq[i - 1]) === 2)) return false;
  if (long && rules.requireLeap && leaps === 0) return false;
  return true;
}

/** Bước đi ngẫu nhiên theo luật độ khó; trả về null nếu lần thử này thất bại. */
function tryWalk(rng: Random, length: number, difficulty: FiveFingerDifficulty, focus: readonly Movement[]): number[] | null {
  const rules = RULES[difficulty];
  const seq = [pick(rules.starts, rng)];
  let skips = 0;
  let run = 1;
  for (let i = 1; i < length; i++) {
    const prev = seq[i - 1];
    const last = i === length - 1;
    const candidates: { value: number; weight: number }[] = [];
    for (let c = 0; c <= 4; c++) {
      const d = Math.abs(c - prev);
      let weight = rules.weights[d];
      if (weight === 0) continue;
      if (d === 0 && run >= rules.maxRepeatRun) continue;
      if (d >= 2 && skips >= rules.maxSkips) continue;
      if (last && !rules.ends.includes(c)) continue;
      if (focus.some((m) => m.from === prev && m.to === c)) weight *= 5;
      candidates.push({ value: c, weight });
    }
    const next = pickWeighted(candidates, rng);
    if (next === null) return null;
    if (Math.abs(next - prev) >= 2) skips++;
    run = next === prev ? run + 1 : 1;
    seq.push(next);
  }
  return seq;
}

const MAX_ATTEMPTS = 300;

/** Chuỗi chỉ số phím cho một tay. Luôn trả về chuỗi hợp lệ (có phương án dự phòng cố định). */
export function generateWalk(rng: Random, length: number, difficulty: FiveFingerDifficulty, focus: readonly Movement[] = []): number[] {
  const wantFocus = focus.filter((m) => RULES[difficulty].weights[Math.abs(m.to - m.from)] > 0);
  const hasFocus = (seq: number[]) => wantFocus.some((m) => seq.some((x, i) => i > 0 && seq[i - 1] === m.from && x === m.to));
  let fallback: number[] | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seq = tryWalk(rng, length, difficulty, wantFocus);
    if (!seq) continue;
    // Chuỗi ngắn (luân phiên: 4 nốt mỗi tay) được miễn một số yêu cầu chỉ có nghĩa với chuỗi dài.
    if (!satisfiesRules(seq, difficulty)) continue;
    if (wantFocus.length === 0 || hasFocus(seq)) return seq;
    fallback ??= seq;
  }
  return fallback ?? FALLBACK[difficulty].slice(0, length);
}

const FALLBACK: Record<FiveFingerDifficulty, number[]> = {
  easy: [0, 1, 2, 3, 4, 3, 1, 0],
  medium: [0, 2, 2, 1, 3, 4, 3, 2],
  hard: [0, 4, 2, 2, 3, 1, 4, 0],
};

function durationsFor(difficulty: FiveFingerDifficulty, rng: Random): Duration[] {
  if (difficulty !== 'hard') return Array.from({ length: CHAIN_LENGTH }, () => 'q');
  const [a, b] = pick(BAR_SPLITS, rng);
  return [...pick(BAR_PATTERNS[a], rng), ...pick(BAR_PATTERNS[b], rng)];
}

/** Sinh một chuỗi theo tham số + seed (hàm thuần). */
export function generateChain(params: ChainParams, seed: number): GeneratedChain {
  const rng = seeded(seed);
  const { handMode, difficulty } = params;
  const focus = params.focus ?? [];
  const forHand = (hand: Hand) => focus.filter((m) => m.hand === hand);
  const durations = durationsFor(difficulty, rng);
  let right: number[] | null = null;
  let left: number[] | null = null;
  let order: Hand[];
  if (handMode === 'right' || handMode === 'left') {
    const seq = generateWalk(rng, CHAIN_LENGTH, difficulty, forHand(handMode));
    if (handMode === 'right') right = seq;
    else left = seq;
    order = Array.from({ length: CHAIN_LENGTH }, () => handMode);
  } else if (handMode === 'alternate') {
    right = generateWalk(rng, CHAIN_LENGTH / 2, difficulty, forHand('right'));
    left = generateWalk(rng, CHAIN_LENGTH / 2, difficulty, forHand('left'));
    order = Array.from({ length: CHAIN_LENGTH }, (_, i) => (i % 2 === 0 ? 'right' : 'left'));
  } else {
    right = generateWalk(rng, CHAIN_LENGTH, difficulty, forHand('right'));
    // Dễ: cùng số ngón hai tay (chuyển động ngược chiều — dễ nhất cho người mới); Trung bình: song song cùng bậc;
    // Khó: mỗi tay một chuỗi độc lập.
    left =
      difficulty === 'easy'
        ? right.map((i) => 4 - i)
        : difficulty === 'medium'
          ? right.slice()
          : generateWalk(rng, CHAIN_LENGTH, difficulty, forHand('left'));
    order = Array.from({ length: CHAIN_LENGTH }, () => 'right');
  }
  return { seed: seed >>> 0, params: { handMode, difficulty, ...(focus.length ? { focus: [...focus] } : {}) }, right, left, order, durations };
}

/** Khoá so sánh hai chuỗi (cùng nốt, cùng tay, cùng trường độ). */
export function chainKey(chain: Pick<GeneratedChain, 'right' | 'left' | 'order' | 'durations'>): string {
  return [chain.order.join(''), chain.right?.join('') ?? '-', chain.left?.join('') ?? '-', chain.durations.join(',')].join('|');
}

/** Trộn hai số thành seed 32-bit (để seed chuỗi thứ n của buổi tập vẫn tái tạo được). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Seed mới ngẫu nhiên cho một buổi tập. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Chuỗi kế tiếp: thử seed `seed`, nếu trùng chuỗi trong `avoid` (chuỗi vừa hoàn thành) thì đổi seed theo quy tắc.
 * Kết quả mang `seed` thực sự đã dùng → `generateChain(params, chain.seed)` tái tạo đúng chuỗi.
 */
export function nextChain(params: ChainParams, seed: number, avoid: readonly string[] = []): GeneratedChain {
  let chain = generateChain(params, seed);
  for (let k = 1; k < 64 && avoid.includes(chainKey(chain)); k++) chain = generateChain(params, mixSeed(seed, k));
  return chain;
}

export interface StepNote {
  midi: number;
  hand: Hand;
  /** Chỉ số phím trong vị trí bàn tay (0–4). */
  index: number;
  /** Ngón được hướng dẫn (MIDI / micro không biết người học dùng ngón nào). */
  finger: number;
  pitch: string;
}

/** Một bước của chuỗi: một nốt (một tay / luân phiên) hoặc hai nốt đánh cùng lúc (hai tay). */
export interface ChainStep {
  notes: StepNote[];
  duration: Duration;
}

export interface Placements {
  position: PositionId;
  rightOctave: number;
  leftOctave: number;
}

export function placementOf(p: Placements, hand: Hand): HandPlacement {
  return { position: p.position, octave: hand === 'right' ? p.rightOctave : p.leftOctave };
}

function stepNote(p: Placements, hand: Hand, index: number): StepNote {
  const placement = placementOf(p, hand);
  return { midi: placementKeys(placement)[index], hand, index, finger: fingerFor(hand, index), pitch: placementPitch(placement, index) };
}

/** Các bước cần đánh của chuỗi theo vị trí bàn tay đang chọn. */
export function chainSteps(chain: GeneratedChain, p: Placements): ChainStep[] {
  const { handMode } = chain.params;
  if (handMode === 'together') {
    return chain.right!.map((r, i) => ({ notes: [stepNote(p, 'right', r), stepNote(p, 'left', chain.left![i])], duration: chain.durations[i] }));
  }
  const pos: Record<Hand, number> = { right: 0, left: 0 };
  return chain.order.map((hand, i) => {
    const seq = hand === 'right' ? chain.right! : chain.left!;
    return { notes: [stepNote(p, hand, seq[pos[hand]++])], duration: chain.durations[i] };
  });
}

/** Một tay đơn lẻ của chuỗi hai tay (luyện từng tay trước khi chơi hai tay cùng lúc). */
export function singleHandSteps(steps: readonly ChainStep[], hand: Hand): ChainStep[] {
  return steps.map((s) => ({ ...s, notes: s.notes.filter((n) => n.hand === hand) })).filter((s) => s.notes.length > 0);
}

/**
 * Bài học (Lesson) để vẽ bằng ScoreView: tay phải → khoá Sol, tay trái → khoá Fa,
 * luân phiên / hai tay → khuông đôi (hai tay cùng lúc: tay trái là phần đệm cùng thời điểm).
 */
export function stepsToLesson(steps: readonly ChainStep[], p: Placements, opts: { id: string; title: string; fingers: boolean }): Lesson {
  const tok = (n: StepNote, d: Duration) => `${n.pitch}/${d}${opts.fingers ? `:${n.finger}` : ''}`;
  const hands = new Set(steps.flatMap((s) => s.notes.map((n) => n.hand)));
  const together = steps.some((s) => s.notes.length > 1);
  const base = {
    id: opts.id,
    title: opts.title,
    description: 'Chuỗi 8 nốt sinh tự động trong vị trí 5 ngón.',
    category: 'both-hands' as const,
    timeSignature: [4, 4] as [number, 4],
    keySignature: positionDef(p.position).keySignature,
    difficulty: 1 as const,
    source: 'Sinh tự động bởi VietPiano',
  };
  if (together) {
    const right = steps.map((s) => tok(s.notes.find((n) => n.hand === 'right')!, s.duration)).join(' ');
    const left = steps.map((s) => tok(s.notes.find((n) => n.hand === 'left')!, s.duration)).join(' ');
    return { ...base, clef: 'grand', hand: 'both', notes: parseNotes(right), accompaniment: parseAccompaniment(left) };
  }
  if (hands.size > 1) {
    let current: Hand | null = null;
    const parts: string[] = [];
    for (const s of steps) {
      const n = s.notes[0];
      if (n.hand !== current) parts.push(n.hand === 'right' ? 'RH' : 'LH');
      current = n.hand;
      parts.push(tok(n, s.duration));
    }
    return { ...base, clef: 'grand', hand: 'both', notes: parseNotes(parts.join(' ')) };
  }
  const hand = [...hands][0] ?? 'right';
  return { ...base, clef: hand === 'right' ? 'treble' : 'bass', hand, notes: parseNotes(steps.map((s) => tok(s.notes[0], s.duration)).join(' ')) };
}
