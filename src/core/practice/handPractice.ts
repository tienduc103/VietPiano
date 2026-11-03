/**
 * Chọn tay ở màn Luyện tập cho mọi bài khuông đôi:
 *  - Bài có phần đệm (`lesson.accompaniment`), hai tay cùng lúc:
 *    - 'both'  : giai điệu tay phải + tay trái (chấm hai tay khi có đàn MIDI / bàn phím ảo).
 *    - 'right' : chỉ giai điệu tay phải; tay trái làm mờ, nốt tay trái đánh kèm không tính sai.
 *    - 'left'  : chỉ phần đệm tay trái — mỗi nốt / hợp âm đệm là một bước; tay phải làm mờ.
 *                Micro chỉ nhận một nốt mỗi lúc → hợp âm (≥ 2 nốt) KHÔNG chấm được, bị bỏ khỏi bài (`skippedChords`);
 *                chế độ Theo nhịp không xét cao độ nên vẫn giữ hợp âm.
 *  - Bài hai tay thay phiên (mỗi nốt ghi tay riêng, `note.hand`): 'both' = mọi nốt theo thứ tự;
 *    'right' / 'left' = chỉ các nốt của tay đó, nốt tay kia làm mờ.
 *
 * "Dòng tập" (`PracticeTrack`) là danh sách bước cho PracticeEngine / TempoFollower, kèm chỉ số nốt trên khuông
 * để tô màu và đặt con trỏ đúng nốt đang tập.
 */
import { DURATION_BEATS, noteHand, type Finger, type Hand, type LeftHandStep, type Lesson } from '../lessons/types';

export type PracticeHand = 'both' | 'right' | 'left';

export const PRACTICE_HAND_LABEL: Record<PracticeHand, string> = { both: 'Hai tay', right: 'Tay phải', left: 'Tay trái' };

export interface TrackStep {
  /** Nốt cần đánh ở bước này, thấp → cao (một nốt hoặc hợp âm). */
  midis: number[];
  pitches: string[];
  fingers: (Finger | undefined)[];
  /** Phách (nốt đen) bắt đầu, tính từ đầu bài. */
  startBeat: number;
  /** Số phách tới bước kế (bước cuối: tới hết bài) — trường độ cho chế độ Theo nhịp. */
  beats: number;
  /** Chỉ số nốt trên khuông: trong `lesson.notes` (dòng giai điệu) hoặc `lesson.accompaniment` (dòng tay trái). */
  scoreIndex: number;
}

export interface PracticeTrack {
  /** Tay thực sự tập (bài không có phần đệm → luôn 'both'). */
  hand: PracticeHand;
  /** `scoreIndex` của các bước trỏ vào nốt giai điệu hay nốt đệm. */
  staff: 'melody' | 'accompaniment';
  steps: TrackStep[];
  /** Tay trái + micro: số hợp âm bị bỏ vì micro không nhận được hợp âm. */
  skippedChords: number;
}

/** Khối "Cần đánh" của một bước trên màn Luyện tập. */
export interface StepGuide {
  midi: number;
  /** Tên nốt như viết trong bài ("Bb4") để hiện đúng dấu giáng. */
  pitch?: string;
  finger?: Finger;
  hand?: Hand;
  /** Bài có phần đệm, tập hai tay: tay trái ở bước này. */
  left?: LeftHandStep;
  /** Tập tay trái, bước là hợp âm. */
  chord?: TrackStep;
}

/** `leftHand` = tay trái theo từng nốt giai điệu (chỉ có khi tập hai tay bài có phần đệm). */
export function stepGuide(lesson: Lesson, track: PracticeTrack, leftHand: readonly LeftHandStep[] | undefined, index: number): StepGuide | undefined {
  const step = track.steps[index];
  if (!step) return undefined;
  const midi = step.midis[0];
  const note = track.staff === 'melody' ? lesson.notes[step.scoreIndex] : undefined;
  if (track.hand === 'left') {
    return { midi, pitch: step.pitches[0], finger: step.fingers[0], hand: 'left', chord: step.midis.length > 1 ? step : undefined };
  }
  return {
    midi,
    pitch: note?.midi === midi ? note.pitch : undefined,
    finger: note?.finger,
    // Bài hai tay luôn nhắc tay nào; bài một tay chỉ nhắc khi có số ngón.
    hand: note && (lesson.hand === 'both' || note.finger) ? noteHand(lesson, note) : undefined,
    left: note && leftHand?.[index],
  };
}

/**
 * Các khối "Cần đánh" khác nhau của cả dòng tập. Màn hình vẽ vô hình tất cả để chừa sẵn chỗ bằng khối rộng nhất:
 * nếu hàng điều khiển đổi bề rộng theo từng nốt, nó xuống dòng rồi lại về một dòng → khuông nhạc phía trên nhảy.
 */
export function distinctStepGuides(lesson: Lesson, track: PracticeTrack, leftHand: readonly LeftHandStep[] | undefined): StepGuide[] {
  const seen = new Map<string, StepGuide>();
  track.steps.forEach((_, i) => {
    const g = stepGuide(lesson, track, leftHand, i);
    if (!g) return;
    const key = JSON.stringify([g.pitch ?? g.midi, g.finger, g.hand, g.left?.pitches, g.left?.fingers, g.left?.held, g.chord?.pitches, g.chord?.fingers]);
    if (!seen.has(key)) seen.set(key, g);
  });
  return [...seen.values()];
}

/** Bài hai tay thay phiên: không có phần đệm, các nốt ghi cả hai tay. */
export function hasAlternatingHands(lesson: Pick<Lesson, 'accompaniment' | 'notes' | 'hand'>): boolean {
  if (lesson.accompaniment?.length) return false;
  return new Set(lesson.notes.map((n) => noteHand(lesson, n))).size === 2;
}

/** Bài có cho chọn tay không (khuông đôi có phần đệm hoặc hai tay thay phiên). */
export function hasHandChoice(lesson: Pick<Lesson, 'accompaniment' | 'notes' | 'hand'>): boolean {
  return !!lesson.accompaniment?.some((c) => c.midis.length > 0) || hasAlternatingHands(lesson);
}

function totalBeats(lesson: Lesson): number {
  const sum = (xs: readonly { duration: keyof typeof DURATION_BEATS }[]) => xs.reduce((t, n) => t + DURATION_BEATS[n.duration], 0);
  return Math.max(sum(lesson.notes), sum(lesson.accompaniment ?? []));
}

function melodySteps(lesson: Lesson): TrackStep[] {
  let beat = 0;
  return lesson.notes.map((n, i) => {
    const step: TrackStep = {
      midis: [n.midi],
      pitches: [n.pitch],
      fingers: [n.finger],
      startBeat: beat,
      beats: DURATION_BEATS[n.duration],
      scoreIndex: i,
    };
    beat += step.beats;
    return step;
  });
}

/** Các bước tay trái: mỗi nốt / hợp âm đệm (bỏ dấu lặng); `singleNotesOnly` → bỏ cả hợp âm. */
export function leftHandSteps(lesson: Lesson, singleNotesOnly: boolean): { steps: TrackStep[]; skippedChords: number } {
  const steps: TrackStep[] = [];
  let skippedChords = 0;
  let beat = 0;
  (lesson.accompaniment ?? []).forEach((c, i) => {
    const start = beat;
    beat += DURATION_BEATS[c.duration];
    if (c.midis.length === 0) return;
    if (singleNotesOnly && c.midis.length > 1) {
      skippedChords++;
      return;
    }
    steps.push({ midis: [...c.midis], pitches: [...c.pitches], fingers: [...c.fingers], startBeat: start, beats: 0, scoreIndex: i });
  });
  spanToNextStep(lesson, steps);
  return { steps, skippedChords };
}

/** Trường độ của bước = tới bước kế trong dòng tập (bước cuối: tới hết bài). */
function spanToNextStep(lesson: Lesson, steps: TrackStep[]): void {
  const end = totalBeats(lesson);
  steps.forEach((s, k) => (s.beats = (k + 1 < steps.length ? steps[k + 1].startBeat : end) - s.startBeat));
}

/** Bài thay phiên, tập một tay: chỉ các nốt của tay đó (giữ nguyên phách và chỉ số nốt trên khuông). */
function alternatingSteps(lesson: Lesson, hand: Hand): TrackStep[] {
  const steps = melodySteps(lesson).filter((s) => noteHand(lesson, lesson.notes[s.scoreIndex]) === hand);
  spanToNextStep(lesson, steps);
  return steps;
}

/**
 * Dòng tập cho tay `hand`. `singleNotesOnly` = nốt chỉ đến từ micro và đang chấm cao độ (Chờ / Đếm nốt).
 * Tay trái mà không còn bước nào (toàn hợp âm, micro) → `undefined`: không tập được, màn hình báo lý do.
 */
export function practiceTrack(lesson: Lesson, hand: PracticeHand, singleNotesOnly: boolean): PracticeTrack | undefined {
  if (!hasHandChoice(lesson)) return { hand: 'both', staff: 'melody', steps: melodySteps(lesson), skippedChords: 0 };
  if (hand !== 'both' && hasAlternatingHands(lesson)) return { hand, staff: 'melody', steps: alternatingSteps(lesson, hand), skippedChords: 0 };
  if (hand !== 'left') return { hand, staff: 'melody', steps: melodySteps(lesson), skippedChords: 0 };
  const { steps, skippedChords } = leftHandSteps(lesson, singleNotesOnly);
  return steps.length === 0 ? undefined : { hand: 'left', staff: 'accompaniment', steps, skippedChords };
}

/**
 * Tập một tay: nốt ngoài tầm của tay đó, về phía tay kia, là nốt tay kia đánh kèm → bỏ qua, không tính sai.
 * Tay trái: cao hơn mọi nốt tay trái; tay phải: thấp hơn mọi nốt tay phải.
 */
export function isOtherHandMidi(lesson: Pick<Lesson, 'accompaniment' | 'notes' | 'hand'>, hand: Hand, midi: number): boolean {
  const played = lesson.notes.filter((n) => !n.rest);
  if (hand === 'right') {
    const right = played.filter((n) => noteHand(lesson, n) === 'right').map((n) => n.midi);
    return right.length > 0 && midi < Math.min(...right);
  }
  const left = [...played.filter((n) => noteHand(lesson, n) === 'left').map((n) => n.midi), ...(lesson.accompaniment ?? []).flatMap((c) => c.midis)];
  return left.length > 0 && midi > Math.max(...left);
}

/** Bước đang vang ở phách `beat` (tính từ đầu bài): bước cuối cùng bắt đầu không muộn hơn `beat`. */
export function stepIndexAtBeat(steps: readonly Pick<TrackStep, 'startBeat'>[], beat: number): number {
  let i = 0;
  while (i + 1 < steps.length && steps[i + 1].startBeat <= beat + 1e-9) i++;
  return i;
}

/** Kết quả theo bước → kết quả theo nốt trên khuông (`size` nốt), nốt không thuộc dòng tập để 'pending'. */
export function resultsOnScore<T>(track: PracticeTrack, results: readonly T[], size: number, empty: T): T[] {
  const out = Array.from({ length: size }, () => empty);
  track.steps.forEach((s, k) => {
    if (k < results.length) out[s.scoreIndex] = results[k];
  });
  return out;
}
