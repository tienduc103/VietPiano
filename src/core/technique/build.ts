/**
 * Dựng bài kỹ thuật từ mẫu SỐ NGÓN: "1 2 3 4 | 5/w" + thế tay (ngón → phím) → ký hiệu gọn "C4:1 D4:2 …" → `Lesson`.
 * Suy chỗ chuyển ngón từ số ngón và kiểm tra "không ép giãn" (dùng trong test của thư viện).
 */
import { lessonTimeline } from '../curriculum/piece';
import { parseAccompaniment, parseNotes } from '../lessons/notation';
import { noteHand, type Finger, type Hand, type Lesson, type LessonCategory, type LessonClef } from '../lessons/types';
import type { KeySignature } from '../music/keySignature';
import type { DynamicMark } from '../music/dynamics';
import type { FingerExercise, HandMode, ScoringConfig, SkillId, TechniqueGroup, TechniqueLevel } from './types';

/** Thế tay: phím của ngón 1…5. */
export type Position = Record<Finger, string>;

/** Thế Đô: tay phải C4–G4 (ngón 1 = C4), tay trái C3–G3 (ngón 1 = G3, ngón 5 = C3). */
export const RH_C: Position = { 1: 'C4', 2: 'D4', 3: 'E4', 4: 'F4', 5: 'G4' };
export const LH_C: Position = { 1: 'G3', 2: 'F3', 3: 'E3', 4: 'D3', 5: 'C3' };
/** Thế Sol tay phải G4–D5; thế Rê trưởng D4–A4 (Fa thăng ngón 3). */
export const RH_G: Position = { 1: 'G4', 2: 'A4', 3: 'B4', 4: 'C5', 5: 'D5' };
export const RH_D: Position = { 1: 'D4', 2: 'E4', 3: 'F#4', 4: 'G4', 5: 'A4' };
export const LH_D: Position = { 1: 'A3', 2: 'G3', 3: 'F#3', 4: 'E3', 5: 'D3' };

/**
 * Mẫu số ngón → ký hiệu gọn. Mỗi mục "ngón[/trường độ]" (vd "3/h"), "R[/trường độ]" = dấu lặng, "|" giữ nguyên để dễ đọc.
 * Ngón vẽ khoanh tròn khi phím là phím đen và ngón 3 (như bản in) — không đổi cách chấm.
 */
export function pattern(pos: Position, src: string): string {
  return src
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (tok === '|') return tok;
      const [head, dur] = tok.split('/');
      if (head === 'R') return dur ? `R/${dur}` : 'R';
      const f = Number(head);
      if (!(f >= 1 && f <= 5) || String(f) !== head) throw new Error(`Mẫu ngón không hợp lệ: "${tok}"`);
      const pitch = pos[f as Finger];
      return `${pitch}${dur ? `/${dur}` : ''}:${pitch.includes('#') || pitch.includes('b') ? `(${f})` : f}`;
    })
    .join(' ');
}

export interface ExerciseDef {
  id: string;
  title: string;
  description: string;
  level: TechniqueLevel;
  group: TechniqueGroup;
  skills: SkillId[];
  handMode: HandMode;
  /** Ký hiệu gọn tay phải (hoặc cả bài với RH / LH khi `alternate`; tay trái khi `left`). */
  notation: string;
  /** Tay trái cùng lúc (`together`). */
  left?: string;
  timeSignature?: [number, 4 | 8];
  keySignature?: KeySignature;
  tempo: number;
  tempoRange: [number, number];
  minutes: number;
  prerequisites?: string[];
  scoring?: Partial<ScoringConfig>;
  tips: string;
  measureNote?: string;
  dynamics?: { index: number; mark: DynamicMark }[];
  hairpins?: { from: number; to: number; type: 'cresc' | 'dim' }[];
}

const DIFFICULTY: Record<TechniqueLevel, 1 | 2 | 3> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

function categoryOf(hand: HandMode, group: TechniqueGroup): LessonCategory {
  if (group === 'scale' || group === 'eight-note') return 'scale';
  return hand === 'right' ? 'right-hand' : hand === 'left' ? 'left-hand' : 'both-hands';
}

function clefOf(hand: HandMode): LessonClef {
  return hand === 'right' ? 'treble' : hand === 'left' ? 'bass' : 'grand';
}

export function buildExercise(d: ExerciseDef): FingerExercise {
  const lesson: Lesson = {
    id: d.id,
    title: d.title,
    description: d.description,
    category: categoryOf(d.handMode, d.group),
    clef: clefOf(d.handMode),
    timeSignature: d.timeSignature ?? [4, 4],
    difficulty: DIFFICULTY[d.level],
    hand: d.handMode === 'right' ? 'right' : d.handMode === 'left' ? 'left' : 'both',
    notes: parseNotes(d.notation),
    tempo: d.tempo,
    tempoRange: d.tempoRange,
    source: 'Bài tập kỹ thuật VietPiano (tự biên soạn)',
  };
  if (d.keySignature) lesson.keySignature = d.keySignature;
  if (d.left) lesson.accompaniment = parseAccompaniment(d.left);
  if (d.dynamics) lesson.dynamics = d.dynamics;
  if (d.hairpins) lesson.hairpins = d.hairpins;
  return {
    id: d.id,
    title: d.title,
    level: d.level,
    group: d.group,
    targetSkills: d.skills,
    lesson,
    handMode: d.handMode,
    tempoRange: d.tempoRange,
    estimatedMinutes: d.minutes,
    prerequisites: d.prerequisites ?? [],
    scoringConfig: { passScore: 80, ...d.scoring },
    tips: d.tips,
    ...(d.measureNote ? { measureNote: d.measureNote } : {}),
    transitionNotes: transitionRefIds(lesson),
  };
}

/** Bài áp dụng vào bản nhạc: dùng nguyên bài Thư viện, chỉ thêm thông tin sư phạm. */
export function libraryExercise(
  lesson: Lesson,
  d: Omit<ExerciseDef, 'notation' | 'left' | 'tempo' | 'description' | 'title' | 'handMode' | 'id'> & { id: string; title: string },
): FingerExercise {
  return {
    id: d.id,
    title: d.title,
    level: d.level,
    group: d.group,
    targetSkills: d.skills,
    lesson,
    handMode: lesson.accompaniment?.length || lesson.hand === 'both' ? 'together' : lesson.hand === 'left' ? 'left' : 'right',
    tempoRange: d.tempoRange,
    estimatedMinutes: d.minutes,
    prerequisites: d.prerequisites ?? [],
    scoringConfig: { passScore: 80, ...d.scoring },
    tips: d.tips,
    ...(d.measureNote ? { measureNote: d.measureNote } : {}),
    transitionNotes: transitionRefIds(lesson),
    libraryLessonId: lesson.id,
  };
}

/** Một nốt của một tay theo thứ tự thời gian (để xét số ngón liền nhau). */
export interface HandNote {
  refId: string;
  midi: number;
  finger: Finger | undefined;
  hand: Hand;
  beat: number;
}

/** Dãy nốt từng tay (bỏ dấu lặng; hợp âm tay trái lấy nốt thấp nhất — bài kỹ thuật không có hợp âm). */
export function handSequences(lesson: Lesson): Record<Hand, HandNote[]> {
  const out: Record<Hand, HandNote[]> = { right: [], left: [] };
  const timeline = lessonTimeline(lesson);
  lesson.notes.forEach((n, i) => {
    if (n.rest) return;
    const hand = noteHand(lesson, n);
    out[hand].push({ refId: `m:${i}`, midi: n.midi, finger: n.finger, hand, beat: timeline[i].startBeat });
  });
  let beat = 0;
  (lesson.accompaniment ?? []).forEach((a, i) => {
    if (a.midis.length) out.left.push({ refId: `a:${i}:0`, midi: a.midis[0], finger: a.fingers[0], hand: 'left', beat });
    beat += { w: 4, hd: 3, h: 2, qd: 1.5, q: 1, '8d': 0.75, '8': 0.5, '16': 0.25 }[a.duration];
  });
  out.left.sort((a, b) => a.beat - b.beat);
  return out;
}

export type MoveKind = 'normal' | 'crossing' | 'shift' | 'substitution';

/** Loại chuyển động giữa hai nốt liền nhau cùng tay theo số ngón gợi ý. */
export function moveKind(a: HandNote, b: HandNote): MoveKind {
  if (a.finger === undefined || b.finger === undefined) return 'normal';
  if (a.midi === b.midi) return a.finger === b.finger ? 'normal' : 'substitution';
  if (a.finger === b.finger) return 'shift';
  const up = b.midi > a.midi;
  const fingerUp = b.finger > a.finger;
  // Tay phải: đi lên cao độ = số ngón tăng; tay trái ngược lại. Trái quy luật = luồn ngón cái / vắt ngón.
  const natural = a.hand === 'right' ? up === fingerUp : up !== fingerUp;
  return natural ? 'normal' : 'crossing';
}

/** Id nốt ở chỗ chuyển ngón (luồn ngón cái, vắt ngón, đổi vị trí tay, đổi ngón trên cùng phím). */
export function transitionRefIds(lesson: Lesson): string[] {
  const seqs = handSequences(lesson);
  const ids: string[] = [];
  for (const seq of [seqs.right, seqs.left])
    for (let k = 1; k < seq.length; k++) if (moveKind(seq[k - 1], seq[k]) !== 'normal') ids.push(seq[k].refId);
  return ids;
}

/**
 * Kiểm tra "không ép giãn ngón" (§8, §29): khoảng cách hai phím liền nhau cùng tay so với số ngón.
 * Thường: ≤ 2 × chênh số ngón + 3 nửa cung; luồn / vắt ngón ≤ 5; đổi vị trí cùng ngón ≤ 7. Trả về mô tả từng chỗ vượt.
 */
export function stretchProblems(lesson: Lesson): string[] {
  const out: string[] = [];
  const seqs = handSequences(lesson);
  for (const seq of [seqs.right, seqs.left])
    for (let k = 1; k < seq.length; k++) {
      const a = seq[k - 1];
      const b = seq[k];
      if (a.finger === undefined || b.finger === undefined) continue;
      const span = Math.abs(b.midi - a.midi);
      const kind = moveKind(a, b);
      const limit = kind === 'crossing' ? 5 : kind === 'shift' ? 7 : kind === 'substitution' ? 0 : 2 * Math.abs(b.finger - a.finger) + 3;
      if (span > limit) out.push(`${lesson.id} ${b.refId}: ${kind} ${span} nửa cung > ${limit}`);
    }
  return out;
}
