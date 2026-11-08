/**
 * PerformanceRecorder — ghi log biểu diễn GỐC (thành phần A của AI Piano Coach).
 *
 * Nhận sự kiện đã chuẩn hoá từ lớp MIDI chung (`midiInput`: Note On + velocity sau đường cong lực gõ, Note Off, CC thô
 * qua `onDetail`) hoặc bàn phím ảo / micro, và lưu theo thứ tự nhận, KHÔNG làm tròn / lượng tử hoá / sửa mốc thời gian:
 *  - `t`  = mốc thời gian của nguồn − t0 (Web MIDI: mốc driver; có thể lệch đồng hồ trang),
 *  - `rt` = lúc app nhận − t0 (performance.now()).
 * Mọi hiệu chỉnh (lệch đồng hồ, bù trễ micro, bỏ khoảng tạm dừng) để dành cho lúc phân tích (`buildPerformance`).
 *
 * Trạng thái: idle → recording ⇄ paused → completed | aborted (| interrupted khi khôi phục phiên dở dang).
 * Sự kiện nhận lúc tạm dừng vẫn được ghi (cờ `p`) để log trung thực, nhưng không tính khi chấm.
 * Không phụ thuộc React / trình duyệt (đồng hồ truyền vào) → kiểm thử được bằng chuỗi sự kiện mô phỏng.
 */
import type { InputSource } from '../../input/NoteInputProvider';
import { RECORDER_VERSION, type MarkKind, type PerformanceEvent, type PerformanceSession, type RecordedSession, type SessionStatus } from '../types';

/** Control Change được ghi: pedal vang, sostenuto, pedal mềm, tắt tiếng / thả mọi phím. */
export const RECORDED_CONTROLLERS: ReadonlySet<number> = new Set([64, 66, 67, 120, 123]);

export interface RecorderNoteOn {
  midi: number;
  /** Mốc thời gian của nguồn (cùng gốc performance.now(), có thể lệch với đàn thật). */
  time: number;
  source: InputSource;
  velocity?: number;
  channel?: number;
  raw?: number;
  port?: string;
  level?: number;
}

export interface RecorderNoteOff {
  midi: number;
  time: number;
  source: InputSource;
  channel?: number;
  raw?: number;
  port?: string;
}

export interface RecorderControl {
  controller: number;
  value: number;
  time: number;
  channel?: number;
  port?: string;
  source?: InputSource;
}

export type RecorderStatus = 'idle' | SessionStatus;

export interface RecorderState {
  status: RecorderStatus;
  eventCount: number;
  /** Số Note On đã ghi lúc đang ghi (không tính lúc tạm dừng). */
  notes: number;
  /** Phím đang giữ (MIDI). */
  held: number[];
  sustainDown: boolean;
  /** Thời gian ghi thực (không tính tạm dừng), ms. */
  activeMs: number;
}

export type SessionMeta = Omit<PerformanceSession, 'status' | 'startedAt' | 'updatedAt' | 'endedAt' | 'eventCount' | 'recorderVersion'>;

export interface RecorderOptions {
  /** Đồng hồ trang (performance.now()). */
  now?: () => number;
  /** Đồng hồ thật (epoch ms) cho `startedAt` / `updatedAt`. */
  wallClock?: () => number;
}

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class PerformanceRecorder {
  private readonly now: () => number;
  private readonly wall: () => number;
  private meta: SessionMeta;
  private statusValue: RecorderStatus = 'idle';
  private events: PerformanceEvent[] = [];
  private t0 = 0;
  private startedAt = 0;
  private endedAt: number | undefined;
  private noteCount = 0;
  private readonly heldKeys = new Map<string, number>();
  private sustain = false;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private dirty = false;
  private readonly listeners = new Set<(s: RecorderState) => void>();

  constructor(meta: SessionMeta, opts: RecorderOptions = {}) {
    this.meta = { ...meta };
    this.now = opts.now ?? perfNow;
    this.wall = opts.wallClock ?? Date.now;
  }

  get status(): RecorderStatus {
    return this.statusValue;
  }

  get sessionId(): string {
    return this.meta.id;
  }

  /** Đang nhận sự kiện (ghi hoặc tạm dừng). */
  get isOpen(): boolean {
    return this.statusValue === 'recording' || this.statusValue === 'paused';
  }

  get state(): RecorderState {
    return {
      status: this.statusValue,
      eventCount: this.events.length,
      notes: this.noteCount,
      held: [...new Set(this.heldKeys.values())].sort((a, b) => a - b),
      sustainDown: this.sustain,
      activeMs: this.activeMs(this.now()),
    };
  }

  subscribe(listener: (s: RecorderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cập nhật metadata (vd tên đàn khi kết nối lại) — không đổi log. */
  updateMeta(patch: Partial<SessionMeta>): void {
    this.meta = { ...this.meta, ...patch, id: this.meta.id };
    this.touch();
  }

  /** Bắt đầu ghi. `pedalDown`: pedal vang đang đạp sẵn (theo trạng thái app nghe được trước đó). */
  start(time = this.now(), opts: { pedalDown?: boolean } = {}): void {
    if (this.statusValue !== 'idle') return;
    this.t0 = time;
    this.startedAt = this.wall();
    this.statusValue = 'recording';
    this.mark('start', time);
    if (opts.pedalDown) {
      this.sustain = true;
      this.mark('pedal-initial', time, 'sustain-down');
    }
    this.touch();
  }

  pause(time = this.now()): void {
    if (this.statusValue !== 'recording') return;
    this.statusValue = 'paused';
    this.pausedAt = time;
    this.mark('pause', time);
    this.touch();
  }

  resume(time = this.now()): void {
    if (this.statusValue !== 'paused') return;
    this.statusValue = 'recording';
    if (this.pausedAt !== null) this.pausedTotal += Math.max(0, time - this.pausedAt);
    this.pausedAt = null;
    this.mark('resume', time);
    this.touch();
  }

  stop(time = this.now()): void {
    if (!this.isOpen) return;
    if (this.pausedAt !== null) this.pausedTotal += Math.max(0, time - this.pausedAt);
    this.pausedAt = null;
    this.mark('stop', time);
    this.statusValue = 'completed';
    this.endedAt = this.wall();
    this.touch();
  }

  abort(time = this.now(), reason = ''): void {
    if (!this.isOpen) return;
    this.mark('abort', time, reason || undefined);
    this.statusValue = 'aborted';
    this.endedAt = this.wall();
    this.touch();
  }

  /** Đàn MIDI rút / mất kết nối giữa chừng: chỉ ghi mốc (phím còn giữ được lớp MIDI thả hộ, phân tích đánh dấu "không đo"). */
  disconnect(time = this.now(), info?: string): void {
    if (!this.isOpen) return;
    this.mark('disconnect', time, info);
    this.heldKeys.clear();
    this.sustain = false;
    this.touch();
  }

  reconnect(time = this.now(), info?: string): void {
    if (!this.isOpen) return;
    this.mark('reconnect', time, info);
    this.touch();
  }

  /**
   * Một tiếng click metronome / đếm vào vừa phát (mốc LÊN LỊCH theo performance.now()) — mốc chuẩn để so nốt với metronome
   * (M1-T7). Chỉ ghi lúc đang ghi; không báo giao diện (tránh vẽ lại mỗi phách) nhưng vẫn đánh dấu cần lưu nháp.
   */
  click(time: number, accent: boolean): void {
    if (this.statusValue !== 'recording') return;
    this.mark('click', time, accent ? 'a' : undefined);
    this.dirty = true;
  }

  noteOn(e: RecorderNoteOn): boolean {
    if (!this.isOpen) return false;
    const paused = this.statusValue === 'paused';
    const ev: PerformanceEvent = {
      k: 'on',
      t: e.time - this.t0,
      rt: this.now() - this.t0,
      n: e.midi,
      v: e.velocity !== undefined && e.velocity > 0 ? e.velocity : null,
      ch: e.channel ?? null,
      src: e.source,
    };
    if (e.raw !== undefined) ev.raw = e.raw;
    if (e.port !== undefined) ev.port = e.port;
    if (e.level !== undefined) ev.lv = e.level;
    if (paused) ev.p = 1;
    this.events.push(ev);
    if (!paused) this.noteCount++;
    if (e.source !== 'microphone') this.heldKeys.set(keyOf(e.source, e.port, e.channel, e.midi), e.midi);
    this.touch();
    return true;
  }

  noteOff(e: RecorderNoteOff): boolean {
    if (!this.isOpen) return false;
    const ev: PerformanceEvent = { k: 'off', t: e.time - this.t0, rt: this.now() - this.t0, n: e.midi, ch: e.channel ?? null, src: e.source };
    if (e.raw !== undefined) ev.raw = e.raw;
    if (e.port !== undefined) ev.port = e.port;
    if (this.statusValue === 'paused') ev.p = 1;
    this.events.push(ev);
    this.heldKeys.delete(keyOf(e.source, e.port, e.channel, e.midi));
    this.touch();
    return true;
  }

  /** Control Change thô (giá trị 0–127, không chỉ bật / tắt). Chỉ ghi các CC trong `RECORDED_CONTROLLERS`. */
  control(e: RecorderControl): boolean {
    if (!this.isOpen || !RECORDED_CONTROLLERS.has(e.controller)) return false;
    const ev: PerformanceEvent = {
      k: 'cc',
      t: e.time - this.t0,
      rt: this.now() - this.t0,
      c: e.controller,
      v: e.value,
      ch: e.channel ?? null,
      src: e.source ?? 'midi',
    };
    if (e.port !== undefined) ev.port = e.port;
    if (this.statusValue === 'paused') ev.p = 1;
    this.events.push(ev);
    if (e.controller === 64) this.sustain = e.value >= 64;
    if (e.controller === 120 || e.controller === 123) this.heldKeys.clear();
    this.touch();
    return true;
  }

  /** Bản chụp để lưu (nháp mỗi vài giây hoặc khi kết thúc). */
  snapshot(): RecordedSession {
    const session: PerformanceSession = {
      ...this.meta,
      status: this.statusValue === 'idle' ? 'recording' : this.statusValue,
      startedAt: this.startedAt,
      updatedAt: this.wall(),
      ...(this.endedAt !== undefined ? { endedAt: this.endedAt } : {}),
      eventCount: this.events.length,
      recorderVersion: RECORDER_VERSION,
    };
    return { session, events: this.events.slice() };
  }

  /** true một lần sau mỗi thay đổi — để lưu nháp khi có gì mới. */
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  private activeMs(time: number): number {
    if (this.statusValue === 'idle') return 0;
    const end = this.statusValue === 'paused' && this.pausedAt !== null ? this.pausedAt : time;
    const stopMark = this.isOpen ? null : [...this.events].reverse().find((e) => e.k === 'mark' && (e.m === 'stop' || e.m === 'abort'));
    const until = stopMark ? stopMark.t + this.t0 : end;
    return Math.max(0, until - this.t0 - this.pausedTotal);
  }

  private mark(m: MarkKind, time: number, info?: string): void {
    const ev: PerformanceEvent = { k: 'mark', t: time - this.t0, rt: time - this.t0, m };
    if (info !== undefined) ev.info = info;
    this.events.push(ev);
  }

  private touch(): void {
    this.dirty = true;
    if (this.listeners.size === 0) return;
    const s = this.state;
    this.listeners.forEach((l) => l(s));
  }
}

function keyOf(source: InputSource, port: string | undefined, channel: number | undefined, midi: number): string {
  return `${source}|${port ?? ''}|${channel ?? ''}|${midi}`;
}
