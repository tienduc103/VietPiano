/**
 * Bộ sinh biểu diễn tổng hợp cho bộ test tham chiếu của Scoring Engine: từ `ScoreReference` dựng log MIDI gốc
 * (Note On / Off / CC 64) theo một đường cong tempo, cài sẵn lỗi đã biết (sai / thiếu / thừa nốt, lệch thời điểm, trường độ,
 * lực gõ, pedal, ngắt quãng, hai tay lệch…), rồi đi qua đúng `buildPerformance` như dữ liệu thật.
 * Tất định (jitter theo seed). Chỉ dùng trong test.
 */
import type { InputSource } from '../../input/NoteInputProvider';
import type { Hand } from '../../lessons/types';
import { buildPerformance } from '../recorder/buildPerformance';
import type { BuiltPerformance, PerformanceEvent, RecordedSession, RefNote, ScoreReference } from '../types';

export interface SynthNoteMod {
  skip?: boolean;
  /** Đánh phím khác. */
  midi?: number;
  shiftMs?: number;
  /** Thời gian giữ / trường độ (mặc định `durationRatio`). */
  durationRatio?: number;
  velocity?: number;
}

export interface SynthOptions {
  bpm?: number;
  /** Đường cong tempo tuỳ ý: phách → ms (ghi đè `bpm`). */
  msAtBeat?: (beat: number) => number;
  /** Mốc của phách 0 (ms). */
  startMs?: number;
  mods?: Record<string, SynthNoteMod>;
  extras?: { midi: number; beat: number; offsetMs?: number; durationBeats?: number; velocity?: number }[];
  /** Biên độ lệch ngẫu nhiên (tất định) mỗi nốt, ms. */
  jitterMs?: number;
  seed?: number;
  durationRatio?: number;
  /** Lực gõ mặc định; hàm theo nốt; null = nguồn không có lực gõ. */
  velocity?: number | null | ((n: RefNote) => number);
  /** Hợp âm rải: nốt thứ k của nhóm (thấp → cao) trễ k × spread. */
  chordSpreadMs?: number;
  handOffsetMs?: Partial<Record<Hand, number>>;
  /** Pedal theo phách / theo ms. */
  pedal?: { downBeat: number; upBeat: number | null }[];
  pedalMs?: { down: number; up: number | null }[];
  /** Ngắt giữa bài: mọi nốt từ phách `beat` trễ thêm `ms`. */
  gaps?: { beat: number; ms: number }[];
  source?: InputSource;
  /** false: không có Note Off (micro). */
  noteOff?: boolean;
  /** Đánh tráo thứ tự hai nốt (theo id). */
  swaps?: [string, string][];
  latencyMs?: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function synthTimeMap(ref: ScoreReference, opts: SynthOptions): (beat: number) => number {
  const start = opts.startMs ?? 1000;
  const msPerBeat = 60000 / (opts.bpm ?? ref.targetBpm);
  const base = opts.msAtBeat ?? ((b: number) => start + b * msPerBeat);
  const gaps = [...(opts.gaps ?? [])].sort((a, b) => a.beat - b.beat);
  return (beat: number) => base(beat) + gaps.filter((g) => beat >= g.beat - 1e-9).reduce((a, g) => a + g.ms, 0);
}

export function synthRecorded(ref: ScoreReference, opts: SynthOptions = {}): RecordedSession {
  const at = synthTimeMap(ref, opts);
  const rand = rng(opts.seed ?? 7);
  const jitter = opts.jitterMs ?? 0;
  const src = opts.source ?? 'midi';
  const withOff = opts.noteOff ?? src !== 'microphone';
  const velOf = (n: RefNote, mod?: SynthNoteMod): number | null => {
    if (mod?.velocity !== undefined) return mod.velocity;
    const v = opts.velocity === undefined ? 72 : opts.velocity;
    return typeof v === 'function' ? v(n) : v;
  };
  type Raw = { t: number; ev: PerformanceEvent };
  const raws: Raw[] = [];
  const onsetOf = new Map<string, number>();

  ref.notes.forEach((n) => {
    const g = ref.groups[n.group];
    const rank = g.notes.indexOf(ref.notes.indexOf(n));
    const base = at(n.onsetBeat) + (opts.chordSpreadMs ?? 0) * rank + (opts.handOffsetMs?.[n.hand] ?? 0);
    onsetOf.set(n.id, base + (jitter ? (rand() * 2 - 1) * jitter : 0));
  });
  for (const [a, b] of opts.swaps ?? []) {
    const ta = onsetOf.get(a)!;
    onsetOf.set(a, onsetOf.get(b)!);
    onsetOf.set(b, ta);
  }

  const push = (midi: number, on: number, durMs: number, v: number | null, channel: number) => {
    const ev: PerformanceEvent = src === 'microphone' ? { k: 'on', t: on, rt: on, n: midi, v: null, ch: null, src, lv: v === null ? 0.05 : v / 1270 } : { k: 'on', t: on, rt: on, n: midi, v, ch: channel, port: 'syn', src };
    raws.push({ t: on, ev });
    if (withOff) raws.push({ t: on + durMs, ev: { k: 'off', t: on + durMs, rt: on + durMs, n: midi, ch: channel, port: 'syn', src } });
  };

  ref.notes.forEach((n) => {
    const mod = opts.mods?.[n.id];
    if (mod?.skip) return;
    const on = onsetOf.get(n.id)! + (mod?.shiftMs ?? 0);
    const dur = (at(n.onsetBeat + n.durationBeats) - at(n.onsetBeat)) * (mod?.durationRatio ?? opts.durationRatio ?? 0.92);
    push(mod?.midi ?? n.midi, on, Math.max(10, dur), velOf(n, mod), n.hand === 'left' ? 1 : 0);
  });
  for (const x of opts.extras ?? []) {
    const on = at(x.beat) + (x.offsetMs ?? 0);
    const dur = (at(x.beat + (x.durationBeats ?? 0.5)) - at(x.beat)) * 0.9;
    push(x.midi, on, dur, x.velocity ?? (typeof opts.velocity === 'number' ? opts.velocity : opts.velocity === null ? null : 72), 0);
  }
  const pedals = [...(opts.pedal ?? []).map((p) => ({ down: at(p.downBeat), up: p.upBeat === null ? null : at(p.upBeat) })), ...(opts.pedalMs ?? [])];
  for (const p of pedals) {
    raws.push({ t: p.down, ev: { k: 'cc', t: p.down, rt: p.down, c: 64, v: 127, ch: 0, port: 'syn', src: 'midi' } });
    if (p.up !== null) raws.push({ t: p.up, ev: { k: 'cc', t: p.up, rt: p.up, c: 64, v: 0, ch: 0, port: 'syn', src: 'midi' } });
  }
  // Đàn thật luôn nhả phím trước khi gõ lại cùng phím: Note Off muộn hơn Note On kế tiếp của cùng phím → kéo về trước nó.
  const byKey = new Map<number, Raw[]>();
  for (const r of raws) if (r.ev.k === 'on' || r.ev.k === 'off') byKey.set(r.ev.n, [...(byKey.get(r.ev.n) ?? []), r]);
  for (const list of byKey.values()) {
    const ons = list.filter((r) => r.ev.k === 'on').map((r) => r.t).sort((a, b) => a - b);
    for (const r of list) {
      if (r.ev.k !== 'off') continue;
      const ownOn = list.find((x) => x.ev.k === 'on' && x.t <= r.t && list.indexOf(x) === list.indexOf(r) - 1)?.t ?? -Infinity;
      const next = ons.find((t) => t > ownOn + 1e-9);
      if (next !== undefined && r.t > next - 5) {
        r.t = Math.max(ownOn + 1, next - 5);
        r.ev = { ...r.ev, t: r.t, rt: r.t };
      }
    }
  }
  // Note Off trước Note On cùng mốc (nốt lặp liền nhau).
  raws.sort((a, b) => a.t - b.t || (a.ev.k === 'off' ? -1 : 0) - (b.ev.k === 'off' ? -1 : 0));
  const lastNote = ref.notes.length ? Math.max(...ref.notes.map((n) => at(n.onsetBeat + n.durationBeats))) : 0;
  const end = Math.max(lastNote, ...raws.map((r) => r.t)) + 500;
  const events: PerformanceEvent[] = [{ k: 'mark', t: 0, rt: 0, m: 'start' }, ...raws.map((r) => r.ev), { k: 'mark', t: end, rt: end, m: 'stop' }];
  return {
    session: {
      id: 'synth',
      profileKey: 'test',
      lessonId: ref.id,
      lessonTitle: ref.title,
      hand: 'both',
      mode: 'technical',
      targetBpm: ref.targetBpm,
      metronome: false,
      status: 'completed',
      startedAt: 0,
      updatedAt: 0,
      input: { source: src, capabilities: { noteOff: withOff, velocity: src === 'midi' && opts.velocity !== null, relativeLevel: src === 'microphone', pedal: pedals.length > 0, polyphonic: src !== 'microphone' } },
      latencyMs: opts.latencyMs ?? 0,
      recorderVersion: '1.0.0',
      eventCount: events.length,
    },
    events,
  };
}

export function synthPerformance(ref: ScoreReference, opts: SynthOptions = {}): BuiltPerformance {
  return buildPerformance(synthRecorded(ref, opts));
}
