/**
 * Bản nhạc tham chiếu (`ScoreReference`) từ dữ liệu bài có cấu trúc của VietPiano (`Lesson` — ký hiệu gọn, cùng nguồn với
 * khuông nhạc, nghe mẫu, xuất MIDI). Chọn nốt cần chấm theo đúng quy tắc của chế độ Biểu diễn (`performancePlan`):
 *  - tay phải: giai điệu + chùm nốt hoà âm (`harmony`); tay trái: phần đệm (`accompaniment`) hoặc nốt ghi `hand: 'left'`;
 *  - `singleNotesOnly` (micro): chỉ nốt đơn — hai tay → chỉ giai điệu; tay trái → chỉ nốt đệm đơn.
 * Mỗi nốt có id ổn định (`m:i`, `h:i:k`, `a:i:k`) + chỉ số nốt trên khuông (`scoreIndex`) để tô màu đúng chỗ, số ô in
 * (đoạn cắt → số ô của bài gốc) và phách trong ô. Bài không có ký hiệu legato / staccato / dấu nối → không có trường đó.
 */
import { accompanimentTimeline, lessonTimeline, pedalRanges } from '../../curriculum/piece';
import { measureIndexAtBeat, measureStarts, printedMeasure } from '../../lessons/positions';
import { originalMeasure } from '../../lessons/slice';
import { DURATION_BEATS, lessonTempo, type Hand, type Lesson } from '../../lessons/types';
import { dynamicSections } from '../../music/dynamics';
import type { RefGroup, RefNote, ScoreReference } from '../types';

export interface ReferenceOptions {
  /** Tay được chấm. */
  hand?: 'both' | Hand;
  /** Nguồn chỉ nhận nốt đơn (micro). */
  singleNotesOnly?: boolean;
  targetBpm?: number;
}

/** Bè trong của tay phải mềm hơn giai điệu khi nghe mẫu (cùng tỉ lệ `harmonyTimeline`). */
const HARMONY_VELOCITY_RATIO = 0.8;
const EPS = 1e-6;

export function referenceFromLesson(lesson: Lesson, opts: ReferenceOptions = {}): ScoreReference {
  const hand = opts.hand ?? 'both';
  const single = opts.singleNotesOnly ?? false;
  const starts = measureStarts(lesson);
  const measureCount = starts.length - 1;
  const printed = Array.from({ length: measureCount }, (_, i) => originalMeasure(lesson, printedMeasure(lesson, i)));
  const where = (beat: number) => {
    const mi = measureIndexAtBeat(starts, beat);
    return { measureIndex: mi, measure: printed[mi], beatInMeasure: beat - starts[mi] };
  };
  const wanted = (h: Hand) => hand === 'both' || hand === h;

  const notes: Omit<RefNote, 'group'>[] = [];
  const timeline = lessonTimeline(lesson);
  timeline.forEach((t, i) => {
    if (t.midiNote === null || !wanted(t.hand)) return;
    const n = lesson.notes[i];
    const base = { onsetBeat: t.startBeat, durationBeats: t.durationBeats, hand: t.hand, scoreIndex: i, staff: 'melody' as const, ...where(t.startBeat), ...(t.dynamic ? { dynamic: t.dynamic } : {}) };
    notes.push({ ...base, id: `m:${i}`, midi: t.midiNote, pitch: n.pitch, part: 'melody', velocityTarget: t.velocity });
    if (!single)
      (n.harmony ?? []).forEach((h, k) =>
        notes.push({ ...base, id: `h:${i}:${k}`, midi: h.midi, pitch: h.pitch, part: 'harmony', velocityTarget: Math.round(t.velocity * HARMONY_VELOCITY_RATIO) }),
      );
  });

  if (lesson.accompaniment?.length && (hand === 'left' || (hand === 'both' && !single))) {
    const velocities = accompanimentTimeline(lesson);
    let beat = 0;
    let v = 0;
    lesson.accompaniment.forEach((c, i) => {
      const durationBeats = DURATION_BEATS[c.duration];
      if (c.midis.length > 0 && !(single && c.midis.length > 1)) {
        const dynamic = timeline.filter((n) => n.startBeat <= beat + EPS).pop()?.dynamic;
        c.midis.forEach((midi, k) =>
          notes.push({
            id: `a:${i}:${k}`,
            midi,
            pitch: c.pitches[k],
            onsetBeat: beat,
            durationBeats,
            hand: 'left',
            part: 'accompaniment',
            ...where(beat),
            scoreIndex: i,
            staff: 'accompaniment',
            velocityTarget: velocities[v + k]?.velocity ?? 55,
            ...(dynamic ? { dynamic } : {}),
          }),
        );
      }
      v += c.midis.length;
      beat += durationBeats;
    });
  }

  // Cùng phách: tay trái trước, thấp → cao.
  notes.sort((a, b) => a.onsetBeat - b.onsetBeat || (a.hand === b.hand ? 0 : a.hand === 'left' ? -1 : 1) || a.midi - b.midi);
  const groups: RefGroup[] = [];
  const full: RefNote[] = notes.map((n, idx) => {
    let g = groups[groups.length - 1];
    if (!g || Math.abs(g.onsetBeat - n.onsetBeat) > EPS) {
      g = { index: groups.length, onsetBeat: n.onsetBeat, notes: [], measure: n.measure, hands: [] };
      groups.push(g);
    }
    g.notes.push(idx);
    if (!g.hands.includes(n.hand)) g.hands.push(n.hand);
    return { ...n, group: g.index };
  });

  const ranges = pedalRanges(lesson);
  return {
    id: lesson.slice ? `${lesson.id}@${lesson.slice.from}-${lesson.slice.to}` : lesson.id,
    title: lesson.title,
    source: 'lesson',
    timeSignature: lesson.timeSignature,
    pickup: lesson.pickup ?? 0,
    targetBpm: opts.targetBpm ?? lessonTempo(lesson),
    ...(lesson.tempoRange ? { tempoRange: lesson.tempoRange } : {}),
    notes: full,
    groups,
    measureStarts: starts,
    printedMeasures: printed,
    totalBeats: starts[starts.length - 1],
    pedal: { ranges, graded: ranges.length > 0 && !lesson.pedalOptional },
    dynamics: lesson.dynamics ? dynamicSections(lesson.dynamics, lesson.notes.length) : [],
    hairpins: lesson.hairpins ?? [],
    twoHands: full.some((n) => n.hand === 'left') && full.some((n) => n.hand === 'right'),
    ...(lesson.slice ? { slice: lesson.slice } : {}),
  };
}

/** Số ô in chứa phách `beat` của bản nhạc. */
export function measureAtBeat(ref: Pick<ScoreReference, 'measureStarts' | 'printedMeasures'>, beat: number): number {
  return ref.printedMeasures[measureIndexAtBeat(ref.measureStarts, beat)];
}

/** Độ dài phách của ô (nốt đen) — 3/8 → 1.5. */
export function beatsPerMeasure(ref: Pick<ScoreReference, 'timeSignature'>): number {
  return (ref.timeSignature[0] * 4) / ref.timeSignature[1];
}
