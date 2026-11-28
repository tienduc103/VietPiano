/**
 * "Cầu vồng hai bàn tay" — lộ trình tám nốt Đô trưởng (docs/rainbow-hands.md).
 *
 *  - Một vòng mặc định = đi lên Đô Rê Mi Fa Sol La Si Đô cao (8 nốt) + đi xuống Si La Sol Fa Mi Rê Đô (7 nốt):
 *    15 vị trí mỗi tay, Đô cao chỉ đánh MỘT lần ở điểm quay đầu. Vòng sau bắt đầu bằng một lần nhấn Đô mới.
 *  - "Chỉ đi lên" = 8 vị trí 0–7, "chỉ đi xuống" = Đô cao → Đô (8 vị trí 7–14).
 *  - Vị trí `pos` 0–14 là chỉ số trong vòng đầy đủ — dùng chung cho số ngón, cảnh cầu vồng và thống kê đoạn hay sai.
 *  - Số ngón KHÔNG tự đặt: lấy từ bài kỹ thuật đã soạn sẵn "Gam Đô trưởng hai tay cùng chiều"
 *    (`tech-l3-scale-c-hands`, đúng 15 nốt mỗi tay, Coach đã dùng). Test kiểm tra hai bên khớp nhau.
 */
import type { Finger, Hand } from '../lessons/types';
import { exerciseById } from '../technique/catalog';
import { LETTER_TO_SOLFEGE, midiToName } from '../music/notes';

export type RainbowPath = 'up' | 'down' | 'round';
export type HandSet = 'left' | 'right' | 'both';

/** Số vị trí của một vòng đầy đủ. */
export const ROUND_POSITIONS = 15;
/** Vị trí Đô cao (điểm quay đầu). */
export const TURN_POS = 7;

/** Bậc trong gam (0 = Đô, 7 = Đô cao) của vị trí `pos` 0–14. */
export function degreeAt(pos: number): number {
  return pos <= TURN_POS ? pos : ROUND_POSITIONS - 1 - pos;
}

/** Khoảng cách nửa cung từ Đô của từng bậc gam Đô trưởng (0–7). */
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const;

/** Nốt Đô bắt đầu có thể chọn cho từng tay (MIDI): tay trái Đô2 / Đô3, tay phải Đô4 (Đô giữa) / Đô5. */
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
  /** Bậc gam 0–7. */
  degree: number;
  /** Nốt Đô bắt đầu của tay (vùng phím của tay = [start, start + 12]). */
  start: number;
}

export interface RouteStep {
  /** Vị trí trong vòng đầy đủ 0–14. */
  pos: number;
  /** Đi lên / quay đầu (Đô cao) / đi xuống. */
  direction: 'up' | 'turn' | 'down';
  /** Một nốt (một tay) hoặc hai nốt (tay trái trước, tay phải sau). */
  notes: RouteNote[];
}

export interface RouteOptions {
  hands: HandSet;
  path: RainbowPath;
  starts: Record<Hand, number>;
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

let cachedFingers: Record<Hand, (Finger | null)[]> | null = null;

/**
 * Số ngón theo vị trí 0–14 cho từng tay, đọc từ bài `tech-l3-scale-c-hands`.
 * Bài không còn / không đủ 15 nốt → không có số ngón (null), KHÔNG tự suy diễn.
 */
export function verifiedFingers(): Record<Hand, (Finger | null)[]> {
  if (cachedFingers) return cachedFingers;
  const none = Array.from({ length: ROUND_POSITIONS }, () => null);
  const lesson = exerciseById(FINGERING_SOURCE_ID)?.lesson;
  const right = lesson?.notes.map((n) => n.finger ?? null) ?? [];
  const left = lesson?.accompaniment?.map((a) => a.fingers[0] ?? null) ?? [];
  cachedFingers = {
    right: right.length === ROUND_POSITIONS ? right : none,
    left: left.length === ROUND_POSITIONS ? left : none,
  };
  return cachedFingers;
}

/** Id bài nguồn của số ngón (hiện trong cài đặt để phụ huynh biết lấy từ đâu). */
export const FINGERING_SOURCE_ID = 'tech-l3-scale-c-hands';

export function noteAt(hand: Hand, pos: number, start: number): RouteNote {
  const degree = degreeAt(pos);
  return { hand, degree, start, midi: start + MAJOR_OFFSETS[degree], finger: verifiedFingers()[hand][pos] };
}

export function stepAt(pos: number, opts: Pick<RouteOptions, 'hands' | 'starts'>): RouteStep {
  return {
    pos,
    direction: pos < TURN_POS ? 'up' : pos === TURN_POS ? 'turn' : 'down',
    notes: handsOf(opts.hands).map((h) => noteAt(h, pos, opts.starts[h])),
  };
}

/** Các bước của MỘT lượt (một vòng / lên / xuống). */
export function buildRoute(opts: RouteOptions): RouteStep[] {
  return pathPositions(opts.path).map((pos) => stepAt(pos, opts));
}

/** Các bước của một đoạn ngắn [from, to] (vị trí 0–14) — "Tập lại đoạn này". */
export function buildSegment(from: number, to: number, opts: Pick<RouteOptions, 'hands' | 'starts'>): RouteStep[] {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(ROUND_POSITIONS - 1, Math.max(from, to));
  const out: RouteStep[] = [];
  for (let p = a; p <= b; p++) out.push(stepAt(p, opts));
  return out;
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
 * Ngón đặt lên nốt Đô bắt đầu lấy từ mẫu số ngón (tay phải ngón cái 1, tay trái ngón út 5).
 */
export function placementGuide(hand: Hand, start: number): string {
  const diff = (start - 60) / 12;
  const where =
    diff === 0
      ? 'Đô giữa — phím trắng ngay bên trái nhóm 2 phím đen ở giữa đàn (thường ngay dưới tên hãng đàn)'
      : diff < 0
        ? `nốt Đô thấp hơn Đô giữa ${-diff === 1 ? 'một' : 'hai'} quãng tám (từ Đô giữa đếm sang TRÁI ${-diff * 7} phím trắng)`
        : `nốt Đô cao hơn Đô giữa ${diff === 1 ? 'một' : 'hai'} quãng tám (từ Đô giữa đếm sang PHẢI ${diff * 7} phím trắng)`;
  const finger = verifiedFingers()[hand][0];
  const fingerText = finger ? `ngón ${finger}${finger === 1 ? ' (ngón cái)' : finger === 5 ? ' (ngón út)' : ''}` : 'một ngón';
  return `${hand === 'left' ? 'Tay trái' : 'Tay phải'}: đặt ${fingerText} lên ${noteLabel(start)} — ${where}.`;
}
