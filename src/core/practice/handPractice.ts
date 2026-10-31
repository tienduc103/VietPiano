/**
 * Chọn tay ở màn Luyện tập cho bài khuông đôi có phần đệm (`lesson.accompaniment`):
 *  - 'both'  : như trước — giai điệu tay phải + tay trái (chấm hai tay khi có đàn MIDI / bàn phím ảo).
 *  - 'right' : chỉ giai điệu tay phải; khuông Fa làm mờ, nốt tay trái đánh kèm không tính sai.
 *  - 'left'  : chỉ phần đệm tay trái — mỗi nốt / hợp âm đệm là một bước; khuông Sol làm mờ.
 *              Micro chỉ nhận một nốt mỗi lúc → hợp âm (≥ 2 nốt) KHÔNG chấm được, bị bỏ khỏi bài (`skippedChords`);
 *              chế độ Theo nhịp không xét cao độ nên vẫn giữ hợp âm.
 *
 * "Dòng tập" (`PracticeTrack`) là danh sách bước cho PracticeEngine / TempoFollower, kèm chỉ số nốt trên khuông
 * để tô màu và đặt con trỏ đúng nốt đang tập.
 */
import { DURATION_BEATS, type Finger, type Lesson } from '../lessons/types';

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

/** Bài có cho chọn tay không (khuông đôi có phần đệm). */
export function hasHandChoice(lesson: Pick<Lesson, 'accompaniment'>): boolean {
  return !!lesson.accompaniment?.some((c) => c.midis.length > 0);
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
  const end = totalBeats(lesson);
  steps.forEach((s, k) => (s.beats = (k + 1 < steps.length ? steps[k + 1].startBeat : end) - s.startBeat));
  return { steps, skippedChords };
}

/**
 * Dòng tập cho tay `hand`. `singleNotesOnly` = nốt chỉ đến từ micro và đang chấm cao độ (Chờ / Đếm nốt).
 * Tay trái mà không còn bước nào (toàn hợp âm, micro) → `undefined`: không tập được, màn hình báo lý do.
 */
export function practiceTrack(lesson: Lesson, hand: PracticeHand, singleNotesOnly: boolean): PracticeTrack | undefined {
  if (!hasHandChoice(lesson) || hand !== 'left') {
    return { hand: hasHandChoice(lesson) ? hand : 'both', staff: 'melody', steps: melodySteps(lesson), skippedChords: 0 };
  }
  const { steps, skippedChords } = leftHandSteps(lesson, singleNotesOnly);
  return steps.length === 0 ? undefined : { hand: 'left', staff: 'accompaniment', steps, skippedChords };
}

/**
 * Tập tay trái: nốt cao hơn mọi nốt đệm là nốt giai điệu tay phải đánh kèm → bỏ qua, không tính sai
 * (đối xứng với `isAccompanimentMidi` khi tập tay phải).
 */
export function isMelodyMidi(lesson: Pick<Lesson, 'accompaniment'>, midi: number): boolean {
  const all = (lesson.accompaniment ?? []).flatMap((c) => c.midis);
  return all.length > 0 && midi > Math.max(...all);
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
