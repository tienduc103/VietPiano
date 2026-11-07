/**
 * Phát lại (M5): bản người học (từ log MIDI đã ghi — phát qua nhạc cụ ảo của app, KHÔNG phải âm thanh gốc của đàn), bản chuẩn
 * (cùng nguồn với nghe mẫu: `soundingNotes` + ngân theo pedal), chỉ một đoạn ô, giảm tốc độ, và so sánh A/B (chuẩn rồi tới bạn).
 * Hàm thuần → lịch phát `ScheduledNote` cho `soundOutput.playSequence`; con trỏ / phím sáng tính lại theo thời gian phát.
 */
import type { ScheduledNote } from '../audio/SoundOutput';
import { pedalRanges, soundingNotes } from '../curriculum/piece';
import type { Lesson } from '../lessons/types';
import { sustainUnderPedal } from '../music/pedal';
import { TempoMap } from './scoring/tempoMap';
import type { BuiltPerformance, ScoreReference, ScoringResult } from './types';

export const REPLAY_NOTICE = 'Phát lại MIDI qua nhạc cụ ảo của app — không phải âm thanh gốc của đàn.';
/** Khoảng lặng giữa A (bản chuẩn) và B (bản của bạn) khi so sánh. */
export const AB_GAP_SEC = 0.8;

export interface ReplayRange {
  fromBeat: number;
  toBeat: number;
  fromMs: number;
  toMs: number;
}

/** Bản đồ tempo của lần chấm (phách ↔ ms của bản người học). */
export function resultMap(result: Pick<ScoringResult, 'tempoMap' | 'tempo'>): TempoMap {
  const mpb = 60000 / (result.tempo.actualBpm ?? result.tempo.targetBpm);
  return new TempoMap(result.tempoMap, mpb, result.tempoMap[0] ?? [0, 0]);
}

/** Đoạn ô [a, b] (số in) → phách + thời gian trong bản người học; không có `measures` → cả bài. */
export function replayRange(ref: ScoreReference, result: Pick<ScoringResult, 'tempoMap' | 'tempo'>, measures?: [number, number] | null): ReplayRange {
  const map = resultMap(result);
  const a = measures ? ref.printedMeasures.indexOf(measures[0]) : 0;
  const b = measures ? ref.printedMeasures.indexOf(measures[1]) : ref.printedMeasures.length - 1;
  const fromBeat = ref.measureStarts[Math.max(0, a)];
  const toBeat = ref.measureStarts[Math.max(0, b) + 1] ?? ref.totalBeats;
  // Lùi nhẹ trước đầu đoạn để không cắt mất nốt đánh hơi sớm.
  return { fromBeat, toBeat, fromMs: Math.max(0, map.msAt(fromBeat) - 120), toMs: map.msAt(toBeat) };
}

/** Lịch phát bản người học: tiếng kéo dài tới lúc tắt thật (thả phím / nhả pedal), lực gõ đã ghi (không có → 80). */
export function performanceSchedule(perf: BuiltPerformance, range: Pick<ReplayRange, 'fromMs' | 'toMs'> | null, speed = 1): ScheduledNote[] {
  const from = range?.fromMs ?? (perf.notes[0]?.onMs ?? 0);
  const to = range?.toMs ?? Infinity;
  return perf.notes
    .filter((n) => n.onMs >= from - 1e-6 && n.onMs < to)
    .map((n) => {
      const end = n.soundingEndMs ?? n.offMs ?? (n.heldAtLeastMs !== undefined ? n.onMs + n.heldAtLeastMs : n.onMs + 500);
      return { midi: n.midi, start: (n.onMs - from) / speed / 1000, duration: Math.max(0.05, (Math.min(end, to + 1500) - n.onMs) / speed / 1000), velocity: n.velocity ?? 80 };
    });
}

/** Lịch phát bản chuẩn trong đoạn phách [from, to) ở nhịp `bpm`. */
export function referenceSchedule(lesson: Lesson, range: Pick<ReplayRange, 'fromBeat' | 'toBeat'> | null, bpm: number): ScheduledNote[] {
  const from = range?.fromBeat ?? 0;
  const to = range?.toBeat ?? Infinity;
  const sec = 60 / bpm;
  return sustainUnderPedal(soundingNotes(lesson), pedalRanges(lesson))
    .filter((n) => n.startBeat >= from - 1e-9 && n.startBeat < to - 1e-9)
    .map((n) => ({ midi: n.midiNote, start: (n.startBeat - from) * sec, duration: Math.min(n.durationBeats, to - n.startBeat) * sec, velocity: n.velocity }));
}

/** A/B: bản chuẩn rồi bản người học (cùng đoạn). Trả về lịch + mốc bắt đầu phần B (giây). */
export function abSchedule(a: ScheduledNote[], b: ScheduledNote[]): { notes: ScheduledNote[]; bStart: number } {
  const aEnd = a.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  const bStart = aEnd + AB_GAP_SEC;
  return { notes: [...a, ...b.map((n) => ({ ...n, start: n.start + bStart }))], bStart };
}

/** Các phím đang vang ở giây `t` của lịch phát (tô phím trên bàn phím ảo). */
export function soundingAt(notes: readonly ScheduledNote[], t: number): Set<number> {
  const out = new Set<number>();
  for (const n of notes) if (t >= n.start && t < n.start + Math.min(n.duration, 1.2)) out.add(n.midi);
  return out;
}
