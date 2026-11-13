/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — ghi MỘT lượt Biểu diễn, thuần (thời gian truyền vào).
 *
 * Mỗi sự kiện nốt là một bản ghi, nối theo chính đối tượng sự kiện (mọi người nghe của một nguồn nhận cùng đối tượng):
 *  - `input`: người nghe RIÊNG của nhật ký trên cả 3 nguồn — thấy mọi nốt, kể cả nốt bị lọc trước khi tới màn;
 *  - `dropped`: màn bỏ nốt trước khi chấm (lý do: tay kia, phần đệm, đang nghe mẫu…);
 *  - `graded`: kết quả PerformanceTracker (hit / wrong / extra / ignored) + nốt được chấm (so trạng thái trước / sau).
 * Thứ tự gọi giữa các người nghe không quan trọng. Nốt có bản ghi mà không được chấm / không có lý do của màn → `why`
 * = lý do đoán lúc nhận (`input(…, hint)`) hoặc 'filtered'.
 */
import type { InputSource, NoteInputEvent, NoteOffEvent } from '../input/NoteInputProvider';
import { DYNAMICS_WEIGHT, PEDAL_WEIGHT, PERFORMANCE_WEIGHTS, weightedScore, type Criterion } from '../curriculum/scoring';
import type { PerformanceConfig, PerformanceOutcome, PerformanceResult, PerformanceState, TimedNote } from '../practice/PerformanceTracker';
import { diagnose, summarize } from './diagnose';
import {
  PERFORM_LOG_SCHEMA,
  type LogDevice,
  type LogEnv,
  type LogInputSource,
  type LogPlayer,
  type LoggedEvent,
  type LoggedMark,
  type LoggedNote,
  type PerformEntry,
  type PerformLogResult,
  type PerformSetup,
} from './types';

/** Nốt của tracker + thông tin để đọc log (tên nốt, tay, ô nhịp). */
export interface SessionNote extends TimedNote {
  pitch?: string;
  hand?: 'right' | 'left';
  kind?: 'melody' | 'harmony' | 'left';
  measure?: number;
}

export interface SessionInit {
  screen: PerformEntry['screen'];
  notes: readonly SessionNote[];
  lesson: PerformEntry['lesson'];
  setup: PerformSetup;
  /** performance.now() lúc bắt đầu lượt (bấm Bắt đầu). */
  startTime: number;
}

export interface EntryMeta {
  id: string;
  at: string;
  app: string;
  device: LogDevice;
  player: LogPlayer;
  env: LogEnv;
}

/** Giới hạn để một lượt dài / micro nhiễu không làm log phình. */
export const MAX_EVENTS = 4000;
export const MAX_PITCH_FRAMES = 6000;

const SOURCE: Record<InputSource, LogInputSource> = { microphone: 'mic', midi: 'midi', virtual: 'virtual' };
const round = (x: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
};

/** Điểm 0–100 theo rubric Biểu diễn (cùng tiêu chí + trọng số màn Luyện tập / giáo trình). */
export function performScore(r: PerformanceResult): number {
  const criteria: Criterion[] = [
    { key: 'pitch', label: 'Đúng nốt', value: r.pitchAccuracy, weight: PERFORMANCE_WEIGHTS.pitch },
    { key: 'timing', label: 'Đúng nhịp', value: r.timing, weight: PERFORMANCE_WEIGHTS.timing },
    { key: 'duration', label: 'Đúng trường độ', value: r.duration, weight: PERFORMANCE_WEIGHTS.duration },
    { key: 'completion', label: 'Hoàn thành bài', value: r.completion, weight: PERFORMANCE_WEIGHTS.completion },
    ...(r.dynamics !== undefined ? [{ key: 'dynamics' as const, label: 'Mạnh – nhẹ', value: r.dynamics, weight: DYNAMICS_WEIGHT }] : []),
    ...(r.pedal !== undefined ? [{ key: 'pedal' as const, label: 'Pedal', value: r.pedal, weight: PEDAL_WEIGHT }] : []),
  ];
  return Math.round(weightedScore(criteria));
}

export class PerformLogSession {
  private readonly byEvent = new Map<NoteInputEvent, LoggedEvent>();
  private readonly events: LoggedEvent[] = [];
  private readonly hints = new Map<LoggedEvent, string>();
  private readonly offs: [number, number, LogInputSource][] = [];
  private readonly pedals: [number, boolean][] = [];
  private readonly marks: LoggedMark[] = [];
  private readonly pitchTrack: NonNullable<PerformEntry['pitch']> = [];
  private lastPitchMidi: number | null | undefined = undefined;

  constructor(private readonly init: SessionInit) {}

  get startTime(): number {
    return this.init.startTime;
  }

  /** Số sự kiện nốt đã ghi (lượt bỏ dở mà chưa có nốt nào thì không cần lưu). */
  get inputCount(): number {
    return this.events.length;
  }

  private rel(time: number): number {
    return round(time - this.init.startTime, 1);
  }

  private record(e: NoteInputEvent, recvTime: number, beat: number | null): LoggedEvent {
    const known = this.byEvent.get(e);
    if (known) {
      if (known.beat === null && beat !== null) known.beat = round(beat, 3);
      return known;
    }
    const r: LoggedEvent = {
      t: this.rel(e.time),
      src: SOURCE[e.source],
      m: e.midi,
      ...(e.velocity !== undefined ? { vel: e.velocity } : {}),
      ...(e.level !== undefined ? { lvl: round(e.level, 4) } : {}),
      lag: round(recvTime - e.time, 1),
      beat: beat === null ? null : round(beat, 3),
      out: 'dropped',
    };
    // Quá giới hạn: vẫn trả bản ghi để người gọi dùng, nhưng không lưu.
    if (this.events.length < MAX_EVENTS) {
      this.byEvent.set(e, r);
      this.events.push(r);
    }
    return r;
  }

  /** Nốt thô từ nguồn (trước mọi bộ lọc của màn). `hint` = lý do đoán nếu cuối cùng nốt không tới bộ chấm. */
  input(e: NoteInputEvent, recvTime: number, beat: number | null, hint?: string): void {
    const r = this.record(e, recvTime, beat);
    if (hint) this.hints.set(r, hint);
  }

  /** Màn bỏ nốt trước khi chấm. */
  dropped(e: NoteInputEvent, reason: string, recvTime: number, beat: number | null): void {
    const r = this.record(e, recvTime, beat);
    if (r.out === 'dropped') r.why = reason;
  }

  /** Kết quả của `PerformanceTracker.handleNoteOn`; `before` / `after` = trạng thái tracker ngay trước / sau lần gọi. */
  graded(e: NoteInputEvent, outcome: PerformanceOutcome, recvTime: number, beat: number | null, before: PerformanceState, after: PerformanceState): void {
    const r = this.record(e, recvTime, beat);
    r.out = outcome;
    delete r.why;
    if (beat !== null) r.beat = round(beat, 3);
    if (outcome !== 'hit' && outcome !== 'wrong') return;
    const i = after.results.findIndex((res, k) => before.results[k] === 'pending' && (res === 'correct' || res === 'wrong'));
    if (i < 0) return;
    r.note = i;
    const off = after.offsetsMs[i];
    if (off !== null) r.off = round(off, 1);
  }

  noteOff(e: NoteOffEvent): void {
    if (this.offs.length < MAX_EVENTS) this.offs.push([this.rel(e.time), e.midi, SOURCE[e.source]]);
  }

  pedal(down: boolean, time: number): void {
    if (this.pedals.length < MAX_EVENTS) this.pedals.push([this.rel(time), down]);
  }

  mark(k: LoggedMark['k'], time: number, beat: number, bpm?: number): void {
    this.marks.push({ t: this.rel(time), k, beat: round(beat, 3), ...(bpm !== undefined ? { bpm } : {}) });
  }

  /** Khung phân tích của micro: chỉ ghi khi cao độ nghe được đổi hoặc có noteOn. */
  pitchFrame(time: number, live: { midi: number; cents: number; confidence: number } | null, rms: number, noteOn: boolean): void {
    const midi = live?.midi ?? null;
    if (!noteOn && midi === this.lastPitchMidi) return;
    this.lastPitchMidi = midi;
    if (this.pitchTrack.length >= MAX_PITCH_FRAMES) return;
    this.pitchTrack.push([this.rel(time), midi, live ? Math.round(live.cents) : 0, live ? round(live.confidence, 2) : 0, round(rms, 4), noteOn ? 1 : 0]);
  }

  /** Dựng dòng log khi hết lượt (hết bài / chơi lại / rời màn). */
  build(end: PerformEntry['end'], endTime: number, state: PerformanceState, result: PerformanceResult, config: PerformanceConfig, meta: EntryMeta): PerformEntry {
    const notes: LoggedNote[] = [];
    this.init.notes.forEach((n, i) => {
      if (n.midi === null) return;
      const off = state.offsetsMs[i];
      const held = state.heldRatios[i];
      notes.push({
        i,
        b: round(n.startBeat, 4),
        d: round(n.durationBeats, 4),
        m: n.midi,
        ...(n.pitch !== undefined ? { p: n.pitch } : {}),
        ...(n.hand !== undefined ? { h: n.hand } : {}),
        ...(n.kind !== undefined ? { k: n.kind } : {}),
        ...(n.measure !== undefined ? { ms: n.measure } : {}),
        r: state.results[i],
        off: off === null ? null : round(off, 1),
        pm: state.playedMidis[i],
        held: held === null ? null : round(held, 3),
      });
    });
    const events = this.events.map((e) => (e.out === 'dropped' && e.why === undefined ? { ...e, why: this.hints.get(e) ?? 'filtered' } : { ...e }));
    const logResult: PerformLogResult = { ...result, score: performScore(result) };
    const diagnosis = diagnose(notes, events, { onTimeMs: config.onTimeMs, octaveTolerant: config.octaveTolerant });
    const entry: Omit<PerformEntry, 'summary'> = {
      v: PERFORM_LOG_SCHEMA,
      id: meta.id,
      type: 'perform',
      at: meta.at,
      app: meta.app,
      device: meta.device,
      player: meta.player,
      env: meta.env,
      screen: this.init.screen,
      end,
      lesson: this.init.lesson,
      setup: this.init.setup,
      durationMs: Math.round(endTime - this.init.startTime),
      notes,
      events,
      offs: [...this.offs],
      pedal: [...this.pedals],
      marks: [...this.marks],
      ...(this.pitchTrack.length ? { pitch: [...this.pitchTrack] } : {}),
      result: logResult,
      diagnosis,
    };
    return { ...entry, summary: summarize(entry) };
  }
}
