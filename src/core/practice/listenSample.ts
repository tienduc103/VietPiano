/**
 * Nghe mẫu ở màn Luyện tập: phát bài từ đầu ô nhịp chứa nốt đang tập tới hết bài — giai điệu + phần đệm tay trái,
 * nốt ngân theo pedal — và tính nốt giai điệu đang vang để con trỏ khuông nhạc chạy theo.
 */
import { accompanimentTimeline, lessonTimeline, pedalRanges } from '../curriculum/piece';
import { sustainUnderPedal } from '../music/pedal';
import type { Lesson } from '../lessons/types';

const EPS = 1e-9;

export interface ListenNote {
  midiNote: number;
  /** Phách (nốt đen) tính từ đầu đoạn phát. */
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface ListenPlan {
  /** Chỉ số nốt giai điệu đầu tiên được phát (nốt đầu ô nhịp). */
  fromIndex: number;
  /** Phách (tính từ đầu bài) bắt đầu đoạn phát. */
  fromBeat: number;
  notes: ListenNote[];
  /** Phách bắt đầu của từng nốt giai điệu từ `fromIndex` (tính từ đầu đoạn phát). */
  melodyStarts: number[];
}

/** Kế hoạch phát mẫu từ đầu ô nhịp chứa nốt `index` (ngoài bài → từ đầu bài). */
export function listenPlan(lesson: Lesson, index: number): ListenPlan {
  const timeline = lessonTimeline(lesson);
  return planFrom(lesson, timeline, timeline[index] ?? timeline[0]);
}

/** Kế hoạch phát mẫu từ đầu ô nhịp chứa phách `beat` (tính từ đầu bài) — tập tay trái: phách của nốt đệm đang tập. */
export function listenPlanAtBeat(lesson: Lesson, beat: number): ListenPlan {
  const timeline = lessonTimeline(lesson);
  const at = timeline.filter((n) => n.startBeat <= beat + EPS).pop() ?? timeline[0];
  return planFrom(lesson, timeline, at);
}

function planFrom(lesson: Lesson, timeline: ReturnType<typeof lessonTimeline>, at: ReturnType<typeof lessonTimeline>[number] | undefined): ListenPlan {
  const fromIndex = at ? timeline.findIndex((n) => n.measureIndex === at.measureIndex) : 0;
  const fromBeat = timeline[fromIndex]?.startBeat ?? 0;
  const all = sustainUnderPedal([...timeline, ...accompanimentTimeline(lesson)], pedalRanges(lesson));
  const notes = all
    .filter((n): n is typeof n & { midiNote: number } => n.midiNote !== null && n.startBeat >= fromBeat - EPS)
    .map((n) => ({ midiNote: n.midiNote, startBeat: n.startBeat - fromBeat, durationBeats: n.durationBeats, velocity: n.velocity }))
    .sort((a, b) => a.startBeat - b.startBeat);
  return { fromIndex, fromBeat, notes, melodyStarts: timeline.slice(fromIndex).map((n) => n.startBeat - fromBeat) };
}

/** Nốt giai điệu đang vang ở phách `beat` của đoạn phát → chỉ số trong bài. */
export function listenIndexAt(plan: ListenPlan, beat: number): number {
  let i = 0;
  while (i + 1 < plan.melodyStarts.length && plan.melodyStarts[i + 1] <= beat + EPS) i++;
  return plan.fromIndex + i;
}
