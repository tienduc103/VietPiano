/**
 * RainbowEngine — MỘT bộ máy chấm cho mọi chế độ của "Cầu vồng hai bàn tay" (từng tay / hai tay cùng bước /
 * lên núi – xuống núi / giữ nhịp / tập lại đoạn). Máy trạng thái thuần, thời gian truyền vào.
 *
 * Chờ (`timing: 'wait'`):
 *  - Bước một tay: nốt đúng → sang bước kế. Bước hai tay: mỗi tay đánh đúng phần của mình (thứ tự bất kỳ, cách nhau
 *    bao lâu cũng được) mới sang bước — "đủ hai nốt". Hai lần đánh cách nhau ≤ `syncToleranceMs` mới ghi là
 *    "cùng lúc"; xa hơn vẫn qua bước nhưng ghi `together: false`.
 *  - Mỗi sự kiện tiến tối đa MỘT bước; sự kiện quá sát lần chuyển bước (`minAdvanceIntervalMs`) bị bỏ.
 *  - Sai một nốt: tay đó được ghi lỗi + chỉ phím cần sửa, giữ nguyên bước (không phải chơi lại cả vòng), phần đã
 *    đúng của tay kia giữ nguyên.
 * Giữ nhịp (`timing: 'tempo'`):
 *  - Đếm vào `countInBeats` phách rồi mỗi bước một phách; đồng hồ KHÔNG chờ. Nốt đúng trong cửa sổ ±½ phách quanh
 *    phách của bước: đúng nhịp (≤ `onTimeMs`) / sớm / trễ; hết cửa sổ mà chưa đánh → thiếu. Giữa hai vòng nghỉ
 *    `restBeats` phách (ăn mừng + đếm vào lại).
 *  - Vòng chỉ tính "chơi hết" khi MỖI tay đánh được ≥ `minHitRate` số nốt của mình — một tay bỏ trống không thể
 *    hoàn thành nhiệm vụ hai tay.
 * Chung:
 *  - Mỗi nốt cần một lần nhấn MỚI: đàn MIDI / bàn phím ảo phải có Note Off trước khi cùng phím được tính lại
 *    (giữ phím, Note On lặp không thêm bước). Micro không có Note Off — lớp chống lặp là NoteRecognizer.
 *  - Micro: nốt "sai" lệch đúng quãng tám / hoạ âm, hoặc trùng nốt vừa đánh của tay đó (âm còn ngân) là
 *    KHÔNG CHẮC (`uncertain`) — không tính là lỗi của bé, không dùng để đề xuất đoạn tập lại.
 *  - Tạm dừng (bé bấm, mất kết nối đàn / micro, nghe mẫu, mở cài đặt): bỏ mọi nốt, xoá phần đánh dở của bước,
 *    không ghi lỗi. Giữ nhịp: tiếp tục → đếm vào lại từ bước đang dở.
 */
import type { Hand } from '../lessons/types';
import type { RouteNote, RouteStep } from './route';

export type TimingMode = 'wait' | 'tempo';
export type NoteSource = 'microphone' | 'virtual' | 'midi';
export type EngineStatus = 'ready' | 'count-in' | 'playing' | 'celebrating' | 'paused' | 'done';
export type PauseReason = 'user' | 'input-lost' | 'listening' | 'settings' | 'hidden';
export type NoteOutcome = 'hit' | 'step' | 'round' | 'wrong' | 'uncertain' | 'repeat' | 'held' | 'ignored';
export type TimingClass = 'on-time' | 'early' | 'late' | 'missed';

export interface EngineConfig {
  timing: TimingMode;
  /** Số vòng của nhiệm vụ. */
  rounds: number;
  minAdvanceIntervalMs: number;
  syncToleranceMs: number;
  /** Chờ: thời gian ăn mừng giữa hai vòng. */
  celebrateMs: number;
  bpm: number;
  countInBeats: number;
  /** Giữ nhịp: số phách nghỉ giữa hai vòng (gồm cả phách đếm vào). */
  restBeats: number;
  /** Giữ nhịp: lệch tối đa vẫn là đúng nhịp; null → min(200, max(100, 20% phách)). */
  onTimeMs: number | null;
  /** Giữ nhịp: tỉ lệ nốt tối thiểu MỖI tay phải đánh được để vòng tính là chơi hết. */
  minHitRate: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  timing: 'wait',
  rounds: 3,
  minAdvanceIntervalMs: 120,
  syncToleranceMs: 250,
  celebrateMs: 1500,
  bpm: 60,
  countInBeats: 4,
  restBeats: 6,
  onTimeMs: null,
  minHitRate: 0.6,
};

export interface HandMark {
  hitTime: number | null;
  /** Lần đánh sai đã xác định (gán cho tay này) khi bước đang chờ. */
  wrong: number;
  /** Lần micro nghe không chắc (không tính lỗi). */
  uncertain: number;
  /** Giữ nhịp: kết quả thời điểm. */
  timing: TimingClass | null;
  deviationMs: number | null;
  /** Nốt đã nhầm sang (để thống kê). */
  wrongMidis: number[];
}

export interface StepRecord {
  /** Vòng (1…). */
  round: number;
  /** Chỉ số bước trong lượt. */
  index: number;
  pos: number;
  hands: Partial<Record<Hand, HandMark>>;
  /** Độ lệch giữa hai tay (ms) — chỉ bước hai tay đã đủ hai nốt. */
  spreadMs: number | null;
  /** Hai tay cùng lúc (≤ syncToleranceMs); null = bước một tay hoặc chưa đủ hai nốt. */
  together: boolean | null;
  /** Bước đã xong (chờ: đủ nốt; giữ nhịp: hết cửa sổ). */
  closed: boolean;
  /** Giữ nhịp: thời điểm phách của bước. */
  beatTime: number | null;
}

export interface RoundInfo {
  round: number;
  /** Chơi hết vòng (chờ: luôn đúng khi xong; giữ nhịp: mỗi tay đủ `minHitRate`). */
  complete: boolean;
  endedAt: number;
}

export interface EngineState {
  readonly status: EngineStatus;
  readonly pauseReason: PauseReason | null;
  readonly timing: TimingMode;
  readonly steps: readonly RouteStep[];
  /** Vòng đang chơi (1…). */
  readonly round: number;
  readonly roundsTarget: number;
  /** Số vòng đã kết thúc (gồm cả vòng giữ nhịp chưa đủ nốt). */
  readonly roundsEnded: number;
  /** Số vòng chơi hết (tính cho nhiệm vụ / phần thưởng). */
  readonly roundsComplete: number;
  readonly index: number;
  /** Tay đã đánh đúng ở bước hiện tại. */
  readonly handsDone: readonly Hand[];
  readonly lastOutcome: NoteOutcome | null;
  readonly lastMidi: number | null;
  readonly lastHand: Hand | null;
  /** Nốt cần sửa sau lần sai gần nhất (tô sáng trên bàn phím). */
  readonly fixMidi: number | null;
  readonly lastEventTime: number;
  /** Giữ nhịp: số phách còn lại của đếm vào (4, 3, 2, 1) hoặc null. */
  readonly countdown: number | null;
  /** Giữ nhịp: kết quả thời điểm lần đánh gần nhất. */
  readonly lastTiming: TimingClass | null;
  readonly startedAt: number | null;
}

const EMPTY_MARK = (): HandMark => ({ hitTime: null, wrong: 0, uncertain: 0, timing: null, deviationMs: null, wrongMidis: [] });

export class RainbowEngine {
  private state: EngineState;
  private readonly listeners = new Set<() => void>();
  private readonly config: EngineConfig;
  private readonly held: Set<number>;
  private records: StepRecord[] = [];
  private rounds: RoundInfo[] = [];
  private lastAdvance = -Infinity;
  private celebrateUntil = 0;
  private pausedAt: number | null = null;
  private statusBeforePause: EngineStatus = 'playing';
  /** Giữ nhịp: mốc phách của bước 0 của vòng hiện tại. */
  private anchor = 0;

  constructor(
    private readonly steps: readonly RouteStep[],
    config: Partial<EngineConfig> = {},
    /** Phím đang giữ từ ván trước (đổi cài đặt / chơi lại) — vẫn phải thả ra mới tính lại. */
    heldKeys: Iterable<number> = [],
  ) {
    if (steps.length === 0) throw new Error('Lượt phải có ít nhất một bước');
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config, rounds: Math.max(1, Math.floor(config.rounds ?? DEFAULT_ENGINE_CONFIG.rounds)) };
    this.held = new Set(heldKeys);
    this.state = {
      status: 'ready',
      pauseReason: null,
      timing: this.config.timing,
      steps,
      round: 1,
      roundsTarget: this.config.rounds,
      roundsEnded: 0,
      roundsComplete: 0,
      index: 0,
      handsDone: [],
      lastOutcome: null,
      lastMidi: null,
      lastHand: null,
      fixMidi: null,
      lastEventTime: 0,
      countdown: null,
      lastTiming: null,
      startedAt: null,
    };
    this.openRound(1);
  }

  // ── Đọc trạng thái ─────────────────────────────────────────────
  getState(): EngineState {
    return this.state;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getConfig(): Readonly<EngineConfig> {
    return this.config;
  }
  /** Mọi bước đã chơi (mọi vòng). */
  getRecords(): readonly StepRecord[] {
    return this.records;
  }
  getRounds(): readonly RoundInfo[] {
    return this.rounds;
  }
  heldKeys(): number[] {
    return [...this.held];
  }
  get beatMs(): number {
    return 60000 / this.config.bpm;
  }
  get onTimeMs(): number {
    return this.config.onTimeMs ?? Math.min(200, Math.max(100, this.beatMs * 0.2));
  }
  /** Nốt còn chờ của bước hiện tại (rỗng khi không chơi). */
  pendingNotes(): RouteNote[] {
    const s = this.state;
    if (s.status === 'done' || s.status === 'ready') return [];
    const step = this.steps[s.index];
    return step.notes.filter((n) => !s.handsDone.includes(n.hand));
  }
  /** Giữ nhịp: mốc các phách metronome từ đầu đếm vào của vòng hiện tại tới hết vòng. */
  beatTimes(): number[] {
    if (this.config.timing !== 'tempo') return [];
    const recs = this.roundRecords();
    const open = Math.max(0, recs.findIndex((r) => !r.closed));
    const first = this.anchor + (open - this.config.countInBeats) * this.beatMs;
    const n = this.config.countInBeats + this.steps.length - open;
    return Array.from({ length: n }, (_, i) => first + i * this.beatMs);
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private openRound(round: number): void {
    this.steps.forEach((step, index) => {
      const hands: Partial<Record<Hand, HandMark>> = {};
      for (const n of step.notes) hands[n.hand] = EMPTY_MARK();
      this.records.push({ round, index, pos: step.pos, hands, spreadMs: null, together: null, closed: false, beatTime: null });
    });
  }

  private roundRecords(round = this.state.round): StepRecord[] {
    return this.records.filter((r) => r.round === round);
  }

  private current(): StepRecord {
    return this.roundRecords()[this.state.index];
  }

  private scheduleRound(anchor: number): void {
    this.anchor = anchor;
    this.roundRecords().forEach((r, i) => (r.beatTime = anchor + i * this.beatMs));
  }

  // ── Điều khiển ─────────────────────────────────────────────────
  start(time: number): void {
    if (this.state.status !== 'ready') return;
    if (this.config.timing === 'tempo') {
      this.scheduleRound(time + this.config.countInBeats * this.beatMs);
      this.set({ status: 'count-in', countdown: this.config.countInBeats, startedAt: time });
    } else {
      this.set({ status: 'playing', startedAt: time });
    }
  }

  pause(time: number, reason: PauseReason = 'user'): void {
    const s = this.state;
    if (s.status === 'paused') {
      // Lý do nặng hơn (mất kết nối) thay lý do nhẹ.
      if (reason === 'input-lost' && s.pauseReason !== 'input-lost') this.set({ pauseReason: reason });
      return;
    }
    if (s.status === 'ready' || s.status === 'done') return;
    this.statusBeforePause = s.status;
    this.pausedAt = time;
    // Bỏ phần đánh dở của bước (sau khi tiếp tục phải đánh lại) — KHÔNG ghi lỗi.
    const open = this.config.timing === 'tempo' ? this.roundRecords().filter((r) => !r.closed) : [this.current()].filter((r) => r && !r.closed);
    for (const r of open) for (const m of Object.values(r.hands)) if (m) Object.assign(m, { hitTime: null, timing: null, deviationMs: null });
    this.set({ status: 'paused', pauseReason: reason, handsDone: [], fixMidi: null, countdown: null });
  }

  resume(time: number): void {
    const s = this.state;
    if (s.status !== 'paused') return;
    const pausedFor = Math.max(0, time - (this.pausedAt ?? time));
    this.pausedAt = null;
    this.lastAdvance = time;
    if (this.config.timing === 'tempo') {
      // Đếm vào lại; bước đang dở trở thành bước đầu sau đếm vào.
      const recs = this.roundRecords();
      const first = recs.findIndex((r) => !r.closed);
      const anchor = time + this.config.countInBeats * this.beatMs - Math.max(0, first) * this.beatMs;
      this.scheduleRound(anchor);
      this.set({ status: 'count-in', pauseReason: null, countdown: this.config.countInBeats });
      this.tick(time);
      return;
    }
    if (this.statusBeforePause === 'celebrating') this.celebrateUntil += pausedFor;
    this.set({ status: this.statusBeforePause, pauseReason: null });
  }

  /** Sau khi xong nhiệm vụ: chơi thêm MỘT vòng (cần người chơi bấm). */
  playMore(time: number): void {
    if (this.state.status !== 'done') return;
    const round = this.state.round + 1;
    this.openRound(round);
    this.lastAdvance = time;
    this.set({ roundsTarget: this.state.roundsTarget + 1, round, index: 0, handsDone: [], fixMidi: null, lastOutcome: null });
    if (this.config.timing === 'tempo') {
      this.scheduleRound(time + this.config.countInBeats * this.beatMs);
      this.set({ status: 'count-in', countdown: this.config.countInBeats });
    } else {
      this.set({ status: 'playing' });
    }
  }

  noteOff(midi: number): void {
    this.held.delete(midi);
  }

  /** Mất hết tín hiệu phím (rút đàn): coi như đã thả mọi phím. */
  releaseAll(): void {
    this.held.clear();
  }

  tick(now: number): void {
    const s = this.state;
    if (s.status === 'celebrating' && this.config.timing === 'wait') {
      if (now >= this.celebrateUntil) this.nextRound(now);
      return;
    }
    if (this.config.timing !== 'tempo') return;
    if (s.status !== 'count-in' && s.status !== 'playing' && s.status !== 'celebrating') return;
    const recs = this.roundRecords();
    // Đếm vào (tới phách của bước đầu còn mở — sau tạm dừng là bước đang dở).
    const ref = recs.find((r) => !r.closed)?.beatTime ?? this.anchor;
    if (now < ref - this.beatMs / 2) {
      const beatsLeft = Math.ceil((ref - now) / this.beatMs - 1e-9);
      if (beatsLeft <= this.config.countInBeats) {
        if (s.status !== 'count-in' || s.countdown !== beatsLeft) this.set({ status: 'count-in', countdown: Math.max(1, beatsLeft) });
      }
      return;
    }
    // Đóng các bước đã hết cửa sổ → thiếu nốt.
    const half = this.beatMs / 2;
    let changed = false;
    for (const r of recs) {
      if (r.closed || r.beatTime === null || now <= r.beatTime + half) continue;
      r.closed = true;
      changed = true;
      for (const m of Object.values(r.hands)) if (m && m.hitTime === null) m.timing = 'missed';
    }
    const open = recs.findIndex((r) => !r.closed);
    if (open === -1) {
      this.endRound(now);
      return;
    }
    if (s.status !== 'playing' || s.index !== open || changed) {
      const handsDone = (Object.entries(recs[open].hands) as [Hand, HandMark][]).filter(([, m]) => m.hitTime !== null).map(([h]) => h);
      this.set({ status: 'playing', countdown: null, index: open, handsDone, ...(s.index !== open ? { fixMidi: null } : {}) });
    }
  }

  private endRound(time: number): void {
    const s = this.state;
    const complete = this.config.timing === 'wait' || this.roundHasEnoughHits(s.round);
    this.rounds.push({ round: s.round, complete, endedAt: time });
    const roundsEnded = s.roundsEnded + 1;
    const roundsComplete = s.roundsComplete + (complete ? 1 : 0);
    if (roundsEnded >= s.roundsTarget) {
      this.set({ status: 'done', roundsEnded, roundsComplete, handsDone: [], countdown: null, fixMidi: null });
      return;
    }
    if (this.config.timing === 'tempo') {
      // Nhịp vẫn chạy: vòng sau bắt đầu sau `restBeats` phách nghỉ.
      const lastBeat = this.roundRecords().at(-1)?.beatTime ?? time;
      const round = s.round + 1;
      this.set({ round, roundsEnded, roundsComplete, index: 0, handsDone: [], status: 'celebrating', fixMidi: null });
      this.openRound(round);
      this.scheduleRound(lastBeat + (1 + this.config.restBeats) * this.beatMs);
      return;
    }
    this.celebrateUntil = time + this.config.celebrateMs;
    this.set({ status: 'celebrating', roundsEnded, roundsComplete, handsDone: [], fixMidi: null });
  }

  private nextRound(time: number): void {
    const round = this.state.round + 1;
    this.openRound(round);
    this.lastAdvance = time;
    this.set({ status: 'playing', round, index: 0, handsDone: [], fixMidi: null });
  }

  private roundHasEnoughHits(round: number): boolean {
    const recs = this.roundRecords(round);
    const hands = new Set(recs.flatMap((r) => Object.keys(r.hands) as Hand[]));
    for (const h of hands) {
      const marks = recs.map((r) => r.hands[h]).filter((m): m is HandMark => !!m);
      const hits = marks.filter((m) => m.hitTime !== null).length;
      if (hits < Math.ceil(marks.length * this.config.minHitRate)) return false;
    }
    return true;
  }

  // ── Nốt vào ────────────────────────────────────────────────────
  noteOn(midi: number, time: number, source: NoteSource): NoteOutcome {
    if (source !== 'microphone') {
      // Giữ phím / Note On lặp: phải thả ra (Note Off) mới tính là lần nhấn mới. Ghi nhận cả khi đang dừng.
      if (this.held.has(midi)) return 'held';
      this.held.add(midi);
    }
    const s = this.state;
    if (this.config.timing === 'tempo') {
      if (s.status === 'count-in' || s.status === 'playing') this.tick(time);
      const now = this.state;
      if (now.status !== 'playing' && now.status !== 'count-in') return 'ignored';
      return this.tempoNote(midi, time, source);
    }
    if (s.status !== 'playing') return 'ignored';
    if (time - this.lastAdvance < this.config.minAdvanceIntervalMs) return 'ignored';
    const step = this.steps[s.index];
    const rec = this.current();
    const target = step.notes.find((n) => n.midi === midi);
    if (!target) return this.wrong(midi, time, source, step, rec);
    const mark = rec.hands[target.hand]!;
    if (mark.hitTime !== null) {
      this.set({ lastOutcome: 'repeat', lastMidi: midi, lastHand: target.hand, lastEventTime: time });
      return 'repeat';
    }
    mark.hitTime = time;
    const handsDone = [...s.handsDone, target.hand];
    if (handsDone.length < step.notes.length) {
      this.set({ handsDone, lastOutcome: 'hit', lastMidi: midi, lastHand: target.hand, lastEventTime: time, fixMidi: s.fixMidi === midi ? null : s.fixMidi });
      return 'hit';
    }
    // Đủ nốt → sang bước.
    const times = Object.values(rec.hands).map((m) => m!.hitTime!);
    if (times.length > 1) {
      rec.spreadMs = Math.max(...times) - Math.min(...times);
      rec.together = rec.spreadMs <= this.config.syncToleranceMs;
    }
    rec.closed = true;
    this.lastAdvance = time;
    const base = { lastMidi: midi, lastHand: target.hand, lastEventTime: time, fixMidi: null, handsDone: [] as Hand[] };
    if (s.index + 1 >= this.steps.length) {
      this.set({ ...base, lastOutcome: 'round' });
      this.endRound(time);
      return 'round';
    }
    this.set({ ...base, index: s.index + 1, lastOutcome: 'step' });
    return 'step';
  }

  private tempoNote(midi: number, time: number, source: NoteSource): NoteOutcome {
    const recs = this.roundRecords();
    const half = this.beatMs / 2;
    // Bước còn mở có cửa sổ chứa lúc này và có tay chờ đúng nốt này — chọn bước gần nhất.
    let best: { rec: StepRecord; note: RouteNote; dev: number } | null = null;
    for (const r of recs) {
      if (r.closed || r.beatTime === null || Math.abs(time - r.beatTime) > half) continue;
      const note = this.steps[r.index].notes.find((n) => n.midi === midi && r.hands[n.hand]!.hitTime === null);
      if (note && (!best || Math.abs(time - r.beatTime) < Math.abs(best.dev))) best = { rec: r, note, dev: time - r.beatTime };
    }
    if (best) {
      const mark = best.rec.hands[best.note.hand]!;
      mark.hitTime = time;
      mark.deviationMs = best.dev;
      mark.timing = Math.abs(best.dev) <= this.onTimeMs ? 'on-time' : best.dev < 0 ? 'early' : 'late';
      const marks = Object.values(best.rec.hands) as HandMark[];
      if (marks.length > 1 && marks.every((m) => m.hitTime !== null)) {
        const t = marks.map((m) => m.hitTime!);
        best.rec.spreadMs = Math.max(...t) - Math.min(...t);
        best.rec.together = best.rec.spreadMs <= this.config.syncToleranceMs;
      }
      const isCurrent = best.rec.index === this.state.index;
      this.set({
        lastOutcome: 'hit',
        lastMidi: midi,
        lastHand: best.note.hand,
        lastEventTime: time,
        lastTiming: mark.timing,
        ...(isCurrent ? { handsDone: [...new Set([...this.state.handsDone, best.note.hand])] } : {}),
        fixMidi: this.state.fixMidi === midi ? null : this.state.fixMidi,
      });
      return 'hit';
    }
    // Nốt không khớp: trong lúc đếm vào → bỏ qua; khi đang chạy → sai của bước có cửa sổ chứa lúc này.
    const near = recs.find((r) => !r.closed && r.beatTime !== null && Math.abs(time - r.beatTime) <= half);
    if (!near) {
      this.set({ lastOutcome: 'ignored', lastMidi: midi, lastEventTime: time });
      return 'ignored';
    }
    return this.wrong(midi, time, source, this.steps[near.index], near);
  }

  private wrong(midi: number, time: number, source: NoteSource, step: RouteStep, rec: StepRecord): NoteOutcome {
    const target = attributeNote(midi, step, rec);
    const mark = rec.hands[target.hand]!;
    if (source === 'microphone' && this.isUncertain(midi, target, rec)) {
      mark.uncertain++;
      this.set({ lastOutcome: 'uncertain', lastMidi: midi, lastHand: target.hand, lastEventTime: time });
      return 'uncertain';
    }
    mark.wrong++;
    mark.wrongMidis.push(midi);
    this.set({ lastOutcome: 'wrong', lastMidi: midi, lastHand: target.hand, lastEventTime: time, fixMidi: target.midi });
    return 'wrong';
  }

  /** Micro: lệch quãng tám / hoạ âm 3, hoặc trùng nốt vừa đánh của tay đó (âm ngân) → không chắc là bé đánh sai. */
  private isUncertain(midi: number, target: RouteNote, rec: StepRecord): boolean {
    const d = midi - target.midi;
    if (d !== 0 && (d % 12 === 0 || d === 19)) return true;
    const prev = this.records[this.records.indexOf(rec) - 1];
    const prevStep = prev ? this.steps[prev.index] : null;
    const prevNote = prevStep?.notes.find((n) => n.hand === target.hand);
    return prevNote?.midi === midi;
  }
}

/**
 * Gán nốt sai cho tay: nốt nằm trong vùng phím của đúng MỘT tay → tay đó (kể cả tay đã đánh xong bước = nốt thừa);
 * nằm ở phím chung / ngoài cả hai vùng → nốt cần đánh gần nhất, ưu tiên tay còn chờ.
 */
export function attributeNote(midi: number, step: RouteStep, rec?: StepRecord): RouteNote {
  if (step.notes.length === 1) return step.notes[0];
  const inRegion = step.notes.filter((n) => midi >= n.start && midi <= n.start + 12);
  if (inRegion.length === 1) return inRegion[0];
  const pending = step.notes.filter((n) => !rec || rec.hands[n.hand]?.hitTime === null);
  const pool = pending.length ? pending : step.notes;
  return pool.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a));
}
