/**
 * FiveFingerDrill — Wait Mode cho một chuỗi 8 bước (một tay, luân phiên hoặc hai tay cùng lúc). Máy trạng thái thuần,
 * thời gian truyền vào.
 *
 *  - Bước một nốt: đúng → sang bước kế (mỗi sự kiện tiến TỐI ĐA một bước); sai → giữ nguyên, ghi lỗi.
 *  - Bước hai nốt (hai tay cùng lúc): mỗi nốt đúng ghi nhận một phần; chỉ sang bước khi đủ HAI nốt và hai lần đánh
 *    cách nhau không quá `syncToleranceMs`. Nốt thứ hai đến muộn hơn → chưa tính "cùng lúc": nốt đó thành lần đánh
 *    đầu mới, đếm `lateSync` (không phải lỗi sai nốt). Không yêu cầu cùng một mili giây.
 *  - Không phạt phản ứng chậm (Wait Mode): thời gian phản ứng chỉ ghi lại để thống kê.
 *  - Sự kiện đến quá sát lần chuyển bước trước (`minAdvanceIntervalMs`) bị bỏ qua — chống nhảy nhiều bước
 *    (lớp thứ nhất là NoteRecognizer).
 *  - Tạm dừng: bỏ qua mọi nốt, thời gian dừng không tính vào thời gian phản ứng.
 *  - Nhịp (`rhythm`): đo khoảng cách giữa hai bước liên tiếp so với trường độ theo `bpm` (không đổi cách chấm nốt).
 */

import { DURATION_BEATS } from '../lessons/types';
import type { ChainStep, StepNote } from './generator';

export type DrillOutcome = 'correct' | 'partial' | 'late-sync' | 'wrong' | 'ignored' | 'finished';
export type StepResult = 'pending' | 'correct' | 'corrected';

export interface DrillConfig {
  minAdvanceIntervalMs: number;
  /** Hai nốt của bước hai tay được coi là cùng lúc nếu cách nhau không quá khoảng này. */
  syncToleranceMs: number;
  /** Chấm nhịp: nhịp độ (nốt đen / phút); null = không chấm nhịp. */
  rhythmBpm: number | null;
  /** Lệch tối đa vẫn coi là đúng nhịp: max(ms này, 25% phách). */
  rhythmToleranceMs: number;
}

export const DEFAULT_DRILL_CONFIG: DrillConfig = {
  minAdvanceIntervalMs: 120,
  syncToleranceMs: 250,
  rhythmBpm: null,
  rhythmToleranceMs: 120,
};

/** Một lần đánh (để thống kê cá nhân). */
export interface DrillAttempt {
  step: number;
  played: number;
  /** Nốt cần đánh mà lần đánh này nhắm tới (nốt đúng: chính nốt đó; nốt sai: nốt còn chờ gần nhất). */
  expected: StepNote;
  ok: boolean;
  time: number;
}

export interface StepRecord {
  /** Từ lúc bước bắt đầu (trừ thời gian tạm dừng) tới nốt đúng đầu tiên của bước. */
  reactionMs: number | null;
  wrong: number;
  /** Số lần hai tay không cùng lúc (chỉ bước hai nốt). */
  lateSync: number;
  /** Độ lệch giữa hai tay của lần đánh được chấp nhận (ms). */
  syncSpreadMs: number | null;
  /** Thời điểm hoàn thành bước (lần đánh đầu của cặp hai tay). */
  hitTime: number | null;
}

export interface DrillState {
  readonly steps: readonly ChainStep[];
  readonly index: number;
  readonly status: 'waiting' | 'finished';
  readonly results: readonly StepResult[];
  /** Nốt của bước hiện tại đã đánh đúng (bước hai tay). */
  readonly hitMidis: readonly number[];
  readonly correct: number;
  readonly wrong: number;
  readonly lateSync: number;
  readonly lastOutcome: DrillOutcome | null;
  readonly lastMidi: number | null;
  readonly lastEventTime: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly paused: boolean;
}

export class FiveFingerDrill {
  private state: DrillState;
  private readonly listeners = new Set<(s: DrillState) => void>();
  private lastAdvanceTime = -Infinity;
  private stepStart: number | null = null;
  private pausedAt: number | null = null;
  private hits: { midi: number; time: number }[] = [];
  private records: StepRecord[];
  private attempts: DrillAttempt[] = [];

  constructor(
    steps: readonly ChainStep[],
    private config: DrillConfig = DEFAULT_DRILL_CONFIG,
  ) {
    if (steps.length === 0) throw new Error('Chuỗi phải có ít nhất một bước');
    this.state = FiveFingerDrill.initial(steps);
    this.records = steps.map(emptyRecord);
  }

  private static initial(steps: readonly ChainStep[]): DrillState {
    return {
      steps,
      index: 0,
      status: 'waiting',
      results: steps.map(() => 'pending'),
      hitMidis: [],
      correct: 0,
      wrong: 0,
      lateSync: 0,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
      startedAt: null,
      finishedAt: null,
      paused: false,
    };
  }

  getState(): DrillState {
    return this.state;
  }

  subscribe(listener: (s: DrillState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<DrillState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  setConfig(config: Partial<DrillConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Bắt đầu tính thời gian phản ứng cho bước đầu (nếu không gọi, tính từ nốt đầu tiên nhận được). */
  start(time: number): void {
    if (this.stepStart === null && this.state.status !== 'finished') this.stepStart = time;
  }

  get currentStep(): ChainStep | null {
    return this.state.status === 'finished' ? null : this.state.steps[this.state.index];
  }

  /** Nốt của bước hiện tại còn chờ đánh. */
  pendingNotes(): StepNote[] {
    const step = this.currentStep;
    if (!step) return [];
    return step.notes.filter((n) => !this.state.hitMidis.includes(n.midi));
  }

  pause(time: number): void {
    if (this.state.paused || this.state.status === 'finished') return;
    this.pausedAt = time;
    // Hai tay đang đánh dở: bỏ lần đánh dở (sau khi tiếp tục phải đánh lại cùng lúc).
    this.hits = [];
    this.setState({ paused: true, hitMidis: [] });
  }

  resume(time: number): void {
    if (!this.state.paused) return;
    if (this.stepStart !== null && this.pausedAt !== null) this.stepStart += Math.max(0, time - this.pausedAt);
    this.pausedAt = null;
    this.setState({ paused: false });
  }

  handleNote(midi: number, time: number): DrillOutcome {
    const s = this.state;
    if (s.status === 'finished') return 'finished';
    if (s.paused) return 'ignored';
    if (time - this.lastAdvanceTime < this.config.minAdvanceIntervalMs) return 'ignored';
    this.stepStart ??= time;
    const startedAt = s.startedAt ?? time;
    const step = s.steps[s.index];
    const rec = this.records[s.index];
    const target = step.notes.find((n) => n.midi === midi);

    if (!target) {
      const pending = this.pendingNotes();
      this.attempts.push({ step: s.index, played: midi, expected: closest(pending.length ? pending : step.notes, midi), ok: false, time });
      rec.wrong++;
      this.hits = [];
      this.setState({ wrong: s.wrong + 1, hitMidis: [], lastOutcome: 'wrong', lastMidi: midi, lastEventTime: time, startedAt });
      return 'wrong';
    }

    if (step.notes.length > 1) {
      // Bỏ lần đánh quá cũ (không còn "cùng lúc" với nốt vừa đến).
      const fresh = this.hits.filter((h) => h.midi !== midi && time - h.time <= this.config.syncToleranceMs);
      const late = this.hits.some((h) => h.midi !== midi && time - h.time > this.config.syncToleranceMs);
      this.hits = [...fresh, { midi, time }];
      this.attempts.push({ step: s.index, played: midi, expected: target, ok: true, time });
      if (rec.reactionMs === null) rec.reactionMs = Math.max(0, time - this.stepStart);
      if (this.hits.length < step.notes.length) {
        if (late) rec.lateSync++;
        const outcome: DrillOutcome = late ? 'late-sync' : 'partial';
        this.setState({
          hitMidis: this.hits.map((h) => h.midi),
          lateSync: s.lateSync + (late ? 1 : 0),
          lastOutcome: outcome,
          lastMidi: midi,
          lastEventTime: time,
          startedAt,
        });
        return outcome;
      }
      rec.syncSpreadMs = Math.max(...this.hits.map((h) => h.time)) - Math.min(...this.hits.map((h) => h.time));
      rec.hitTime = Math.min(...this.hits.map((h) => h.time));
    } else {
      this.attempts.push({ step: s.index, played: midi, expected: target, ok: true, time });
      if (rec.reactionMs === null) rec.reactionMs = Math.max(0, time - this.stepStart);
      rec.hitTime = time;
    }

    // Đủ nốt của bước → sang bước kế.
    const results = s.results.slice();
    results[s.index] = rec.wrong > 0 || rec.lateSync > 0 ? 'corrected' : 'correct';
    this.hits = [];
    this.lastAdvanceTime = time;
    this.stepStart = time;
    const index = s.index + 1;
    const finished = index >= s.steps.length;
    this.setState({
      index: finished ? s.steps.length - 1 : index,
      status: finished ? 'finished' : 'waiting',
      results,
      hitMidis: [],
      correct: s.correct + 1,
      lastOutcome: finished ? 'finished' : 'correct',
      lastMidi: midi,
      lastEventTime: time,
      startedAt,
      finishedAt: finished ? time : null,
    });
    return finished ? 'finished' : 'correct';
  }

  /** Luyện lại chuỗi này từ đầu. */
  restart(): void {
    this.lastAdvanceTime = -Infinity;
    this.stepStart = null;
    this.pausedAt = null;
    this.hits = [];
    this.records = this.state.steps.map(emptyRecord);
    this.attempts = [];
    this.state = FiveFingerDrill.initial(this.state.steps);
    this.listeners.forEach((l) => l(this.state));
  }

  getRecords(): readonly StepRecord[] {
    return this.records;
  }

  getAttempts(): readonly DrillAttempt[] {
    return this.attempts;
  }

  /** Tổng kết chuỗi (gọi sau khi hoàn thành). */
  summary(): DrillSummary {
    return summarizeDrill(this.state.steps, this.records, this.config);
  }
}

function emptyRecord(): StepRecord {
  return { reactionMs: null, wrong: 0, lateSync: 0, syncSpreadMs: null, hitTime: null };
}

function closest(notes: readonly StepNote[], midi: number): StepNote {
  return notes.reduce((best, n) => (Math.abs(n.midi - midi) < Math.abs(best.midi - midi) ? n : best), notes[0]);
}

export interface RhythmSummary {
  /** Số khoảng giữa hai bước đã đo. */
  intervals: number;
  onTime: number;
  /** Lệch trung bình (ms, tuyệt đối). */
  meanAbsErrorMs: number;
}

export interface DrillSummary {
  steps: number;
  /** Số nốt đúng / sai (mỗi nốt của bước hai tay tính riêng). */
  correctNotes: number;
  wrongNotes: number;
  /** Tỉ lệ nốt đúng trên tổng số lần đánh. */
  accuracy: number;
  /** Số bước đúng ngay lần đầu. */
  firstTry: number;
  avgReactionMs: number | null;
  lateSync: number;
  rhythm: RhythmSummary | null;
}

export function summarizeDrill(steps: readonly ChainStep[], records: readonly StepRecord[], config: DrillConfig): DrillSummary {
  const correctNotes = steps.reduce((s, st) => s + st.notes.length, 0);
  const wrongNotes = records.reduce((s, r) => s + r.wrong, 0);
  const reactions = records.map((r) => r.reactionMs).filter((x): x is number => x !== null);
  let rhythm: RhythmSummary | null = null;
  if (config.rhythmBpm) {
    const beatMs = 60000 / config.rhythmBpm;
    const tolerance = Math.max(config.rhythmToleranceMs, beatMs * 0.25);
    const errors: number[] = [];
    for (let i = 1; i < records.length; i++) {
      const a = records[i - 1].hitTime;
      const b = records[i].hitTime;
      if (a === null || b === null) continue;
      errors.push(Math.abs(b - a - DURATION_BEATS[steps[i - 1].duration] * beatMs));
    }
    rhythm = {
      intervals: errors.length,
      onTime: errors.filter((e) => e <= tolerance).length,
      meanAbsErrorMs: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : 0,
    };
  }
  return {
    steps: steps.length,
    correctNotes,
    wrongNotes,
    accuracy: correctNotes / Math.max(1, correctNotes + wrongNotes),
    firstTry: records.filter((r) => r.wrong === 0 && r.lateSync === 0).length,
    avgReactionMs: reactions.length ? reactions.reduce((s, x) => s + x, 0) / reactions.length : null,
    lateSync: records.reduce((s, r) => s + r.lateSync, 0),
    rhythm,
  };
}
