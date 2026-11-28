/**
 * "Cầu vồng hai bàn tay" — lộ trình tám nốt Đô trưởng (docs/rainbow-hands.md).
 *
 *  - Một vòng mặc định = đi lên Đô Rê Mi Fa Sol La Si Đô cao (8 nốt) + đi xuống Si La Sol Fa Mi Rê Đô (7 nốt):
 *    15 vị trí mỗi tay, Đô cao chỉ đánh MỘT lần ở điểm quay đầu. Vòng sau bắt đầu bằng một lần nhấn Đô mới.
 *  - "Chỉ đi lên" = 8 vị trí 0–7, "chỉ đi xuống" = Đô cao → Đô (8 vị trí 7–14).
 *  - Ngược chiều (`motion: 'contrary'`): tay phải như trên, tay trái chạy NGƯỢC — bắt đầu ở Đô cao của vùng, đi xuống
 *    Si La … Đô rồi lên lại (vị trí 0–14 vẫn chung cho hai tay: bước k = cặp nốt thứ k của bài mẫu).
 *  - Vị trí `pos` 0–14 là chỉ số trong vòng đầy đủ — dùng chung cho số ngón, cảnh cầu vồng và thống kê đoạn hay sai.
 *  - Số ngón KHÔNG tự đặt: lấy từ bài kỹ thuật đã soạn sẵn ("Gam Đô trưởng hai tay cùng chiều" `tech-l3-scale-c-hands`,
 *    "… ngược chiều" `tech-l3-scale-c-contrary`; đúng 15 nốt mỗi tay, Coach đã dùng). Test kiểm tra từng nốt khớp bài mẫu.
 */
import type { Finger, Hand } from '../lessons/types';
import { exerciseById } from '../technique/catalog';
import { LETTER_TO_SOLFEGE, midiToName } from '../music/notes';
import { beatsOf, durationAt, type KidDuration, type RhythmPatternId } from './durations';

export type RainbowPath = 'up' | 'down' | 'round';
export type HandSet = 'left' | 'right' | 'both';
/** Hướng chạy của hai tay: cùng chiều (mặc định) / ngược chiều (tay phải lên khi tay trái xuống). */
export type Motion = 'parallel' | 'contrary';

/** Số vị trí của một vòng đầy đủ. */
export const ROUND_POSITIONS = 15;
/** Vị trí Đô cao (điểm quay đầu). */
export const TURN_POS = 7;

/** Bậc trong gam (0 = Đô, 7 = Đô cao) của vị trí `pos` 0–14 (theo tay chạy xuôi). */
export function degreeAt(pos: number): number {
  return pos <= TURN_POS ? pos : ROUND_POSITIONS - 1 - pos;
}

/** Khoảng cách nửa cung từ Đô của từng bậc gam Đô trưởng (0–7). */
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const;

/** Nốt Đô thấp của vùng phím có thể chọn cho từng tay (MIDI): tay trái Đô2 / Đô3, tay phải Đô4 (Đô giữa) / Đô5. */
export const START_CHOICES: Record<Hand, readonly number[]> = { left: [36, 48], right: [60, 72] };
export const DEFAULT_STARTS: Record<Hand, number> = { left: 48, right: 60 };

export function isValidStart(hand: Hand, midi: number): boolean {
  return START_CHOICES[hand].includes(midi);
}

export interface RouteNote {
  hand: Hand;
  midi: number;
  /** Số ngón theo mẫu bài đã kiểm chứng (null nếu không có mẫu). */
  finger: Finger | null;
  /** Bậc gam 0–7 của nốt (7 = Đô cao của vùng). */
  degree: number;
  /** Tên cho bé ("Mi", "Đô cao"; tay trái ngược chiều: bắt đầu "Đô", xuống tới "Đô thấp"). */
  name: string;
  /** Nốt Đô thấp của vùng tay (vùng phím của tay = [start, start + 12]). */
  start: number;
}

export interface RouteStep {
  /** Vị trí trong vòng đầy đủ 0–14. */
  pos: number;
  /** Tay phải đi lên / quay đầu / đi xuống (ngược chiều: tay trái chạy ngược lại). */
  direction: 'up' | 'turn' | 'down';
  motion: Motion;
  /** Một nốt (một tay) hoặc hai nốt (tay trái trước, tay phải sau). */
  notes: RouteNote[];
  /** Chế độ Trường độ: trường độ của bước (không có = nốt đen, không chấm giữ phím). */
  duration?: KidDuration;
  /** Số phách của bước (giữ nhịp: khoảng tới bước sau). */
  beats: number;
}

export interface RouteOptions {
  hands: HandSet;
  path: RainbowPath;
  starts: Record<Hand, number>;
  motion?: Motion;
  /** Mẫu tiết tấu (chế độ Trường độ). */
  rhythm?: RhythmPatternId;
}

/** Các vị trí của một lượt theo kiểu đường đi. */
export function pathPositions(path: RainbowPath): number[] {
  if (path === 'up') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (path === 'down') return [7, 8, 9, 10, 11, 12, 13, 14];
  return Array.from({ length: ROUND_POSITIONS }, (_, i) => i);
}

export function handsOf(hands: HandSet): Hand[] {
  return hands === 'both' ? ['left', 'right'] : [hands];
}

/** Bài nguồn của lộ trình + số ngón theo kiểu chạy (hiện trong cài đặt để phụ huynh biết lấy từ đâu). */
export const FINGERING_SOURCE: Record<Motion, { id: string; title: string }> = {
  parallel: { id: 'tech-l3-scale-c-hands', title: 'Gam Đô trưởng hai tay cùng chiều' },
  contrary: { id: 'tech-l3-scale-c-contrary', title: 'Gam Đô trưởng hai tay ngược chiều' },
};
/** Bài nguồn của chế độ cùng chiều (tên cũ). */
export const FINGERING_SOURCE_ID = FINGERING_SOURCE.parallel.id;

const cachedFingers: Partial<Record<Motion, Record<Hand, (Finger | null)[]>>> = {};

/**
 * Số ngón theo vị trí 0–14 cho từng tay, đọc từ bài nguồn của kiểu chạy.
 * Bài không còn / không đủ 15 nốt → không có số ngón (null), KHÔNG tự suy diễn.
 */
export function verifiedFingers(motion: Motion = 'parallel'): Record<Hand, (Finger | null)[]> {
  const hit = cachedFingers[motion];
  if (hit) return hit;
  const none = Array.from({ length: ROUND_POSITIONS }, () => null);
  const lesson = exerciseById(FINGERING_SOURCE[motion].id)?.lesson;
  const right = lesson?.notes.map((n) => n.finger ?? null) ?? [];
  const left = lesson?.accompaniment?.map((a) => a.fingers[0] ?? null) ?? [];
  const out = {
    right: right.length === ROUND_POSITIONS ? right : none,
    left: left.length === ROUND_POSITIONS ? left : none,
  };
  cachedFingers[motion] = out;
  return out;
}

/** Tay này chạy NGƯỢC thứ tự bậc (tay trái ở chế độ ngược chiều: bắt đầu từ Đô cao của vùng, đi xuống trước). */
export function isMirrored(hand: Hand, motion: Motion = 'parallel'): boolean {
  return motion === 'contrary' && hand === 'left';
}

/**
 * Vùng phím thật dùng cho kiểu chạy. Ngược chiều: Đô cao vùng tay trái (start + 12) phải THẤP HƠN Đô của tay phải,
 * không thì bước đầu hai tay cùng một phím → vùng mặc định (Đô3 / Đô4) tự lùi tay trái xuống Đô2, đúng như bài mẫu.
 */
export function effectiveStarts(starts: Record<Hand, number>, motion: Motion = 'parallel'): Record<Hand, number> {
  if (motion !== 'contrary' || starts.left + 12 < starts.right) return starts;
  return { left: starts.right - 24, right: starts.right };
}

export function noteAt(hand: Hand, pos: number, start: number, motion: Motion = 'parallel'): RouteNote {
  const d = degreeAt(pos);
  const degree = isMirrored(hand, motion) ? 7 - d : d;
  return { hand, degree, name: noteNameAt(hand, pos, motion), start, midi: start + MAJOR_OFFSETS[degree], finger: verifiedFingers(motion)[hand][pos] };
}

export function stepAt(pos: number, opts: Pick<RouteOptions, 'hands' | 'starts' | 'motion'>, duration?: KidDuration): RouteStep {
  return {
    pos,
    ...(duration ? { duration } : {}),
    beats: beatsOf(duration),
    direction: pos < TURN_POS ? 'up' : pos === TURN_POS ? 'turn' : 'down',
    motion: opts.motion ?? 'parallel',
    notes: handsOf(opts.hands).map((h) => noteAt(h, pos, opts.starts[h], opts.motion)),
  };
}

/** Các bước của MỘT lượt (một vòng / lên / xuống). */
export function buildRoute(opts: RouteOptions): RouteStep[] {
  return pathPositions(opts.path).map((pos, i) => stepAt(pos, opts, opts.rhythm ? durationAt(opts.rhythm, i) : undefined));
}

/** Các bước của một đoạn ngắn [from, to] (vị trí 0–14) — "Tập lại đoạn này". */
export function buildSegment(from: number, to: number, opts: Pick<RouteOptions, 'hands' | 'starts' | 'motion' | 'rhythm'>): RouteStep[] {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(ROUND_POSITIONS - 1, Math.max(from, to));
  const out: RouteStep[] = [];
  for (let p = a; p <= b; p++) out.push(stepAt(p, opts, opts.rhythm ? durationAt(opts.rhythm, p - a) : undefined));
  return out;
}

/**
 * Tên nốt của tay ở vị trí `pos` cho bé. Tay chạy xuôi: Đô … Đô cao. Tay trái ngược chiều bắt đầu ở Đô của nó (Đô cao vùng)
 * và đi XUỐNG → gọi "Đô" … "Đô thấp" (không gọi phím thấp hơn tay phải là "Đô cao").
 */
export function noteNameAt(hand: Hand, pos: number, motion: Motion = 'parallel'): string {
  const d = degreeAt(pos);
  if (!isMirrored(hand, motion)) return degreeName(d);
  return d === 0 ? 'Đô' : d === 7 ? 'Đô thấp' : degreeName(7 - d);
}

/** Tên Đô Rê Mi của bậc gam (Đô cao = "Đô cao"). */
export function degreeName(degree: number): string {
  if (degree === 7) return 'Đô cao';
  return LETTER_TO_SOLFEGE['CDEFGAB'[degree]];
}

/** Tên nốt kèm quãng tám kiểu app ("Đô4"). */
export function noteLabel(midi: number): string {
  const name = midiToName(midi);
  return `${LETTER_TO_SOLFEGE[name[0]] ?? name[0]}${name.slice(1)}`;
}

/**
 * Hướng dẫn đặt tay trên đàn thật (dựa vào Đô giữa — phím trắng ngay bên trái nhóm 2 phím đen ở giữa đàn).
 * `start` = Đô thấp của vùng tay; nốt đặt tay = nốt đầu tiên của tay đó (ngược chiều: tay trái đặt ở Đô cao của vùng).
 * Ngón lấy từ mẫu số ngón của kiểu chạy.
 */
export function placementGuide(hand: Hand, start: number, motion: Motion = 'parallel'): string {
  const first = isMirrored(hand, motion) ? start + 12 : start;
  const diff = (first - 60) / 12;
  const where =
    diff === 0
      ? 'Đô giữa — phím trắng ngay bên trái nhóm 2 phím đen ở giữa đàn (thường ngay dưới tên hãng đàn)'
      : diff < 0
        ? `nốt Đô thấp hơn Đô giữa ${-diff === 1 ? 'một' : 'hai'} quãng tám (từ Đô giữa đếm sang TRÁI ${-diff * 7} phím trắng)`
        : `nốt Đô cao hơn Đô giữa ${diff === 1 ? 'một' : 'hai'} quãng tám (từ Đô giữa đếm sang PHẢI ${diff * 7} phím trắng)`;
  const finger = verifiedFingers(motion)[hand][0];
  const fingerText = finger ? `ngón ${finger}${finger === 1 ? ' (ngón cái)' : finger === 5 ? ' (ngón út)' : ''}` : 'một ngón';
  const way = motion === 'contrary' ? (hand === 'left' ? ' Tay trái đi XUỐNG trước (sang trái).' : ' Tay phải đi LÊN trước (sang phải).') : '';
  return `${hand === 'left' ? 'Tay trái' : 'Tay phải'}: đặt ${fingerText} lên ${noteLabel(first)} — ${where}.${way}`;
}
