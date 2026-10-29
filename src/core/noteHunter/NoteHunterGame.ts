/**
 * NoteHunterGame — máy trạng thái thuần của trò Săn nốt (thời gian truyền vào, không DOM/âm thanh).
 *
 * Bản nhạc tự chạy theo `MusicTransport`; các nốt KHÔNG phải mục tiêu do app phát (AudioScheduler).
 * Chế độ:
 *  - 'wait'  (Wait Mode): tới đầu nốt mục tiêu → đồng hồ DỪNG ĐÚNG phách đó (WAITING_FOR_NOTE) tới khi đánh đúng
 *            cao độ + quãng 8 (so MIDI). Sai: vẫn chờ, cho thử lại; không phạt phản ứng chậm.
 *  - 'note'  (Note Mode): như Wait Mode nhưng tính lỗi và thời gian phản ứng vào kết quả.
 *  - 'rhythm'(Rhythm Mode): đồng hồ không dừng; phải đánh trong cửa sổ ±`rhythmWindowMs` quanh đầu nốt, lỡ → 'missed'.
 *
 * Chống nhận nhầm:
 *  - Chỉ tính sự kiện noteOn MỚI (MIDI Note On / onset micro / bấm phím ảo); phím đang giữ từ trước không bao giờ
 *    được tính — giữ C4 từ nốt trước tới mục tiêu C4 sau vẫn phải đánh lại.
 *  - Sự kiện xảy ra trước điểm chờ quá `earlyGraceMs` bị bỏ (tín hiệu cũ); trong `earlyGraceMs` trước đầu nốt
 *    mục tiêu mà đúng → nhận luôn, không dừng (người chơi đánh đúng phách).
 *  - Mỗi sự kiện giải quyết tối đa một mục tiêu; bỏ sự kiện < `minRepeatMs` sau lần đánh đúng (micro báo lặp).
 */
import type { InputSource } from '../input/NoteInputProvider';
import { clampBpm, MusicTransport } from './MusicTransport';
import { songMeasureBeats, targetIndices, type HunterSong } from './songs';

export type HunterMode = 'wait' | 'note' | 'rhythm';
export type HunterStatus = 'IDLE' | 'PLAYING' | 'WAITING_FOR_NOTE' | 'PAUSED' | 'COMPLETED';

export const MODE_LABEL: Record<HunterMode, string> = { wait: 'Wait Mode', note: 'Note Mode', rhythm: 'Rhythm Mode' };

export interface HunterConfig {
  mode: HunterMode;
  bpm: number;
  /** Số phách đếm vào trước nốt đầu (mặc định một ô nhịp). */
  leadInBeats?: number;
  earlyGraceMs: number;
  minRepeatMs: number;
  /** Rhythm Mode: lệch tối đa so với đầu nốt (micro có độ trễ nhận diện → nên rộng hơn MIDI). */
  rhythmWindowMs: number;
  /** Nốt mục tiêu "sắp đến" khi còn chừng này phách (tô nổi bật ở cột trái + khuông nhạc). */
  approachBeats: number;
}

export const DEFAULT_HUNTER_CONFIG: Omit<HunterConfig, 'mode' | 'bpm'> = {
  earlyGraceMs: 150,
  minRepeatMs: 150,
  rhythmWindowMs: 250,
  approachBeats: 2,
};

export type TargetStatus = 'pending' | 'hit' | 'missed';

export interface TargetResult {
  /** Chỉ số nốt trong bài. */
  noteIndex: number;
  midi: number;
  startBeat: number;
  status: TargetStatus;
  /** Các nốt đánh sai trong lúc chờ mục tiêu này. */
  wrong: number[];
  /** Wait/Note Mode: ms từ lúc bắt đầu chờ tới lúc đánh đúng (0 nếu đánh đúng phách, không phải chờ). */
  reactionMs?: number;
  /** Rhythm Mode: lệch so với đầu nốt (âm = sớm). */
  timingMs?: number;
  velocity?: number;
  source?: InputSource;
}

export type HunterFeedback = { kind: 'correct' | 'wrong' | 'miss'; midi: number; targetMidi: number; at: number; seq: number };

export interface HunterState {
  status: HunterStatus;
  mode: HunterMode;
  bpm: number;
  /** Vị trí ở lần cập nhật gần nhất (UI vẽ con trỏ bằng `positionAt` mỗi khung hình). */
  position: number;
  targets: TargetResult[];
  /** Chỉ số mục tiêu đang chờ / sắp tới trong `targets` (= targets.length khi hết). */
  cursor: number;
  /** Lúc bắt đầu chờ mục tiêu hiện tại (WAITING_FOR_NOTE). */
  waitingSince: number | null;
  /** Mục tiêu hiện tại đang ở gần (≤ approachBeats) — tô nổi bật. */
  approaching: boolean;
  feedback: HunterFeedback | null;
  /** Phím đang giữ (MIDI / bàn phím ảo — micro không có Note Off). */
  held: number[];
  /** Trạng thái trước khi tạm dừng. */
  pausedFrom: 'PLAYING' | 'WAITING_FOR_NOTE' | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface HunterNoteOn {
  midi: number;
  time: number;
  velocity?: number;
  source?: InputSource;
}

export type NoteOutcome = 'correct' | 'wrong' | 'ignored';

const EPS = 1e-6;

export class NoteHunterGame {
  readonly song: HunterSong;
  readonly config: HunterConfig;
  readonly targetSet: ReadonlySet<number>;
  /** Chỉ số nốt (trong bài) là mục tiêu — app KHÔNG tự phát các nốt này. */
  readonly targetNoteIndices: ReadonlySet<number>;
  private readonly transport: MusicTransport;
  private state: HunterState;
  private listeners = new Set<() => void>();
  private lastHitTime = -Infinity;
  private lastTick = -Infinity;
  private pausedAt = 0;
  private seq = 0;

  constructor(song: HunterSong, targets: Iterable<number>, config: Partial<HunterConfig> & Pick<HunterConfig, 'mode' | 'bpm'>) {
    this.song = song;
    this.config = { ...DEFAULT_HUNTER_CONFIG, ...config, bpm: clampBpm(config.bpm) };
    this.targetSet = new Set(targets);
    const indices = targetIndices(song, this.targetSet);
    this.targetNoteIndices = new Set(indices);
    this.transport = new MusicTransport(this.config.bpm);
    this.state = this.initialState();
  }

  /** Bài có ít nhất một nốt mục tiêu — không có thì không được bắt đầu. */
  hasTargets(): boolean {
    return this.targetNoteIndices.size > 0;
  }

  get leadInBeats(): number {
    return this.config.leadInBeats ?? songMeasureBeats(this.song);
  }

  get msPerBeat(): number {
    return this.transport.msPerBeat;
  }

  getState(): HunterState {
    return this.state;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Vị trí (nốt đen) tại `now` — dùng để vẽ con trỏ mượt mỗi khung hình. */
  positionAt(now: number): number {
    return this.transport.position(now);
  }

  /** Thời điểm (ms) đồng hồ đạt `beat` nếu chạy liên tục từ mốc hiện tại. */
  timeAtBeat(beat: number): number {
    return this.transport.timeAt(beat);
  }

  /**
   * Phách mà âm thanh tự phát KHÔNG được vượt qua: đầu mục tiêu đang chờ / sắp tới (Wait/Note Mode).
   * Rhythm Mode không dừng → vô hạn.
   */
  stopBeat(): number {
    const { cursor, targets } = this.state;
    if (this.config.mode === 'rhythm' || cursor >= targets.length) return Infinity;
    return targets[cursor].startBeat;
  }

  private initialState(): HunterState {
    return {
      status: 'IDLE',
      mode: this.config.mode,
      bpm: this.transport.bpm,
      position: -this.leadInBeats,
      targets: [...this.targetNoteIndices].map((i) => {
        const n = this.song.notes[i];
        return { noteIndex: i, midi: n.midiNumber!, startBeat: n.startBeat, status: 'pending' as const, wrong: [] };
      }),
      cursor: 0,
      waitingSince: null,
      approaching: false,
      feedback: null,
      held: [],
      pausedFrom: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  private set(patch: Partial<HunterState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private updateTarget(i: number, patch: Partial<TargetResult>): TargetResult[] {
    return this.state.targets.map((t, k) => (k === i ? { ...t, ...patch } : t));
  }

  private feedback(kind: HunterFeedback['kind'], midi: number, targetMidi: number, at: number): HunterFeedback {
    return { kind, midi, targetMidi, at, seq: ++this.seq };
  }

  start(now: number): void {
    if (!this.hasTargets()) throw new Error('Bài không có nốt mục tiêu nào');
    if (this.state.status !== 'IDLE' && this.state.status !== 'COMPLETED') return;
    this.state = this.initialState();
    this.lastHitTime = -Infinity;
    this.lastTick = now;
    this.transport.start(-this.leadInBeats, now);
    this.set({ status: 'PLAYING', startedAt: now, position: -this.leadInBeats });
  }

  /** Về đầu bài và chạy lại ngay (cả khi đang chạy / chờ / tạm dừng). */
  restart(now: number): void {
    this.transport.freezeAt(-this.leadInBeats);
    this.state = { ...this.initialState(), status: 'COMPLETED' };
    this.start(now);
  }

  /** Dừng hẳn, về trạng thái ban đầu (đổi cài đặt). */
  reset(): void {
    this.transport.freezeAt(-this.leadInBeats);
    this.state = this.initialState();
    this.listeners.forEach((l) => l());
  }

  pause(now: number): void {
    const { status } = this.state;
    if (status !== 'PLAYING' && status !== 'WAITING_FOR_NOTE') return;
    this.tick(now);
    if (this.state.status !== 'PLAYING' && this.state.status !== 'WAITING_FOR_NOTE') return;
    this.transport.pause(now);
    this.pausedAt = now;
    this.set({ status: 'PAUSED', pausedFrom: this.state.status, position: this.transport.position(now) });
  }

  resume(now: number): void {
    if (this.state.status !== 'PAUSED') return;
    const from = this.state.pausedFrom ?? 'PLAYING';
    this.lastTick = now;
    if (from === 'PLAYING') {
      this.transport.resume(now);
      this.set({ status: 'PLAYING', pausedFrom: null });
    } else {
      // Thời gian tạm dừng không tính vào thời gian phản ứng.
      const waitingSince = this.state.waitingSince === null ? now : this.state.waitingSince + (now - this.pausedAt);
      this.set({ status: 'WAITING_FOR_NOTE', pausedFrom: null, waitingSince });
    }
  }

  /** Đổi nhịp độ (giữ nguyên vị trí trong bài). */
  setTempo(bpm: number, now: number): void {
    this.transport.setTempo(bpm, now);
    (this.config as { bpm: number }).bpm = this.transport.bpm;
    this.set({ bpm: this.transport.bpm });
  }

  /** Gọi mỗi khung hình: tiến đồng hồ, dừng đúng đầu mục tiêu, đánh dấu lỡ (Rhythm Mode), kết thúc bài. */
  tick(now: number): void {
    if (now > this.lastTick) this.lastTick = now;
    if (this.state.status !== 'PLAYING') return;
    const pos = this.transport.position(now);
    const { mode, rhythmWindowMs, approachBeats } = this.config;
    let { cursor, targets } = this.state;
    let feedback = this.state.feedback;

    if (mode === 'rhythm') {
      while (cursor < targets.length && now > this.transport.timeAt(targets[cursor].startBeat) + rhythmWindowMs) {
        const t = targets[cursor];
        targets = targets.map((x, k) => (k === cursor ? { ...x, status: 'missed' as const } : x));
        feedback = this.feedback('miss', t.midi, t.midi, now);
        cursor++;
      }
    } else if (cursor < targets.length && pos >= targets[cursor].startBeat - EPS) {
      const beat = targets[cursor].startBeat;
      const waitingSince = this.transport.timeAt(beat);
      this.transport.freezeAt(beat);
      this.set({ status: 'WAITING_FOR_NOTE', position: beat, waitingSince, approaching: true, cursor, targets, feedback });
      return;
    }

    if (cursor >= targets.length && pos >= this.song.totalBeats - EPS) {
      this.transport.freezeAt(this.song.totalBeats);
      this.set({ status: 'COMPLETED', position: this.song.totalBeats, cursor, targets, feedback, approaching: false, finishedAt: now });
      return;
    }

    const approaching = cursor < targets.length && targets[cursor].startBeat - pos <= approachBeats;
    if (cursor !== this.state.cursor || approaching !== this.state.approaching || feedback !== this.state.feedback) {
      this.set({ position: pos, cursor, targets, approaching, feedback });
    } else {
      // Vị trí đổi mỗi khung hình — không báo listener (UI đọc `positionAt`).
      this.state = { ...this.state, position: pos };
    }
  }

  noteOn(e: HunterNoteOn): NoteOutcome {
    const held = this.state.held.includes(e.midi) ? this.state.held : [...this.state.held, e.midi];
    if (held !== this.state.held) this.state = { ...this.state, held };
    // Đồng hồ có thể đã qua đầu mục tiêu trước khi khung hình kịp cập nhật.
    if (e.time > this.lastTick) this.tick(e.time);
    const { status } = this.state;
    if (status !== 'PLAYING' && status !== 'WAITING_FOR_NOTE') return 'ignored';
    if (e.time - this.lastHitTime < this.config.minRepeatMs) return 'ignored';
    return this.config.mode === 'rhythm' ? this.rhythmNoteOn(e) : this.waitNoteOn(e);
  }

  noteOff(midi: number): void {
    if (this.state.held.includes(midi)) this.state = { ...this.state, held: this.state.held.filter((m) => m !== midi) };
  }

  private hit(i: number, e: HunterNoteOn, patch: Partial<TargetResult>): TargetResult[] {
    this.lastHitTime = e.time;
    return this.updateTarget(i, {
      status: 'hit',
      ...patch,
      ...(e.velocity !== undefined ? { velocity: e.velocity } : {}),
      ...(e.source ? { source: e.source } : {}),
    });
  }

  private waitNoteOn(e: HunterNoteOn): NoteOutcome {
    const { cursor, targets, status } = this.state;
    const target = targets[cursor];
    if (!target) return 'ignored';
    const { earlyGraceMs } = this.config;

    if (status === 'PLAYING') {
      // Đánh đúng ngay trước đầu nốt (đúng phách) → nhận luôn, đồng hồ không dừng.
      const targetTime = this.transport.timeAt(target.startBeat);
      if (e.midi !== target.midi || targetTime - e.time > earlyGraceMs) return 'ignored';
      const targetsNext = this.hit(cursor, e, { reactionMs: 0 });
      this.set({ targets: targetsNext, cursor: cursor + 1, approaching: false, feedback: this.feedback('correct', e.midi, target.midi, e.time) });
      return 'correct';
    }

    const since = this.state.waitingSince ?? e.time;
    if (e.time < since - earlyGraceMs) return 'ignored'; // tín hiệu cũ, từ trước lúc chờ
    if (e.midi !== target.midi) {
      this.set({ targets: this.updateTarget(cursor, { wrong: [...target.wrong, e.midi] }), feedback: this.feedback('wrong', e.midi, target.midi, e.time) });
      return 'wrong';
    }
    const targetsNext = this.hit(cursor, e, { reactionMs: Math.max(0, Math.round(e.time - since)) });
    // Chạy tiếp từ đúng phách đang chờ, tính từ lúc đánh (không bù thời gian đã chờ).
    const resumeAt = Math.max(e.time, since);
    this.transport.resume(resumeAt);
    this.lastTick = Math.max(this.lastTick, resumeAt);
    this.set({
      status: 'PLAYING',
      targets: targetsNext,
      cursor: cursor + 1,
      waitingSince: null,
      approaching: false,
      feedback: this.feedback('correct', e.midi, target.midi, e.time),
    });
    return 'correct';
  }

  private rhythmNoteOn(e: HunterNoteOn): NoteOutcome {
    const { cursor, targets } = this.state;
    const { rhythmWindowMs } = this.config;
    // Mục tiêu đang chờ hoặc mục tiêu kế tiếp (khi hai mục tiêu sát nhau), lấy cái gần thời điểm đánh nhất.
    let best = -1;
    let bestDiff = Infinity;
    for (let k = cursor; k < Math.min(targets.length, cursor + 2); k++) {
      const diff = e.time - this.transport.timeAt(targets[k].startBeat);
      if (Math.abs(diff) <= rhythmWindowMs && Math.abs(diff) < Math.abs(bestDiff)) {
        best = k;
        bestDiff = diff;
      }
    }
    if (best < 0) return 'ignored';
    const target = targets[best];
    if (e.midi !== target.midi) {
      this.set({ targets: this.updateTarget(best, { wrong: [...target.wrong, e.midi] }), feedback: this.feedback('wrong', e.midi, target.midi, e.time) });
      return 'wrong';
    }
    // Mục tiêu trước đó (nếu nhảy qua) coi như lỡ.
    let next = this.hit(best, e, { timingMs: Math.round(bestDiff) });
    for (let k = cursor; k < best; k++) next = next.map((t, j) => (j === k ? { ...t, status: 'missed' as const } : t));
    this.set({ targets: next, cursor: best + 1, approaching: false, feedback: this.feedback('correct', e.midi, target.midi, e.time) });
    return 'correct';
  }
}

// ── Tổng kết ───────────────────────────────────────────────────────

export interface NoteSummary {
  midi: number;
  count: number;
  hit: number;
  missed: number;
  /** Số lần đánh sai khi chờ nốt này. */
  wrong: number;
  avgReactionMs: number | null;
}

export interface HunterSummary {
  total: number;
  hit: number;
  missed: number;
  wrong: number;
  avgReactionMs: number | null;
  /** Rhythm Mode: lệch tuyệt đối trung bình. */
  avgTimingMs: number | null;
  /** Đánh đúng ngay lần đầu (không sai, không lỡ) / tổng. */
  accuracy: number;
  perNote: NoteSummary[];
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summarize(targets: readonly TargetResult[]): HunterSummary {
  const byMidi = new Map<number, TargetResult[]>();
  for (const t of targets) byMidi.set(t.midi, [...(byMidi.get(t.midi) ?? []), t]);
  const perNote = [...byMidi.entries()]
    .sort(([a], [b]) => a - b)
    .map(([midi, ts]) => ({
      midi,
      count: ts.length,
      hit: ts.filter((t) => t.status === 'hit').length,
      missed: ts.filter((t) => t.status === 'missed').length,
      wrong: ts.reduce((s, t) => s + t.wrong.length, 0),
      avgReactionMs: mean(ts.flatMap((t) => (t.reactionMs !== undefined ? [t.reactionMs] : []))),
    }));
  const clean = targets.filter((t) => t.status === 'hit' && t.wrong.length === 0).length;
  return {
    total: targets.length,
    hit: targets.filter((t) => t.status === 'hit').length,
    missed: targets.filter((t) => t.status === 'missed').length,
    wrong: targets.reduce((s, t) => s + t.wrong.length, 0),
    avgReactionMs: mean(targets.flatMap((t) => (t.reactionMs !== undefined ? [t.reactionMs] : []))),
    avgTimingMs: mean(targets.flatMap((t) => (t.timingMs !== undefined ? [Math.abs(t.timingMs)] : []))),
    accuracy: targets.length ? clean / targets.length : 0,
    perNote,
  };
}

/** Các nốt sai / lỡ nhiều nhất (để luyện tiếp), nhiều lỗi trước; không có lỗi → rỗng. */
export function weakestNotes(summary: HunterSummary, max = 3): number[] {
  return summary.perNote
    .filter((n) => n.wrong + n.missed > 0)
    .sort((a, b) => b.wrong + b.missed - (a.wrong + a.missed) || a.midi - b.midi)
    .slice(0, max)
    .map((n) => n.midi);
}
