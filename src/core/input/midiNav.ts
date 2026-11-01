/**
 * Điều hướng bằng đàn MIDI: khi màn hình KHÔNG nghe nốt (trang giới thiệu, màn kết quả, lớp phủ
 * "Sẵn sàng" / tổng kết của trò chơi…), bấm phím trên đàn thay cho bấm nút:
 *   - phím trắng bất kỳ hoặc đạp pedal vang → nút "đi tới" (Tiếp, Tiếp tục, Bắt đầu, Chơi ngay…)
 *   - phím đen bất kỳ → nút "lùi lại" (Trước, Quay lại…)
 *   - hai phím đen bất kỳ cùng lúc (cách nhau ≤ `chordMs`) → về Trang chủ
 * Phím đen chờ `chordMs` xem có phím đen thứ hai không rồi mới "lùi lại" (`press` → 'pending', `flush`).
 * Chỉ đàn MIDI (micro dễ nghe nhầm, bàn phím ảo thì đã chạm được màn hình).
 *
 * Chống bấm nhầm: bỏ phím trong `guardMs` sau khi nút xuất hiện, sau mỗi lần điều hướng và sau mỗi lần
 * chạm màn hình (màn vừa đổi). Đang có màn nghe nốt (`listen()`) → phím đàn vẫn là phím đàn, không điều hướng.
 * Về Trang chủ cũng chỉ ở màn chờ bấm nút (có ít nhất một nút điều hướng đang hiện).
 * Logic thuần — phần DOM (nút có hiện / bị tắt không) nằm ở `available()` do UI cung cấp.
 */

export type MidiNavAction = 'forward' | 'back';
export type MidiNavResult = MidiNavAction | 'home';

export interface MidiNavTarget {
  action: MidiNavAction;
  /** Nút đang hiện, không bị tắt, không bị hộp thoại che. */
  available(): boolean;
  activate(): void;
}

export type MidiNavInput = { kind: 'note'; midi: number; time: number } | { kind: 'pedal'; time: number };

/** Bỏ phím trong chừng này ms sau khi nút / màn xuất hiện. */
export const MIDI_NAV_GUARD_MS = 1200;
/** Hai phím đen cách nhau không quá chừng này ms = bấm cùng lúc. */
export const MIDI_NAV_CHORD_MS = 200;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

export function actionFor(input: MidiNavInput): MidiNavAction {
  return input.kind === 'pedal' || !isBlackKey(input.midi) ? 'forward' : 'back';
}

interface Entry {
  target: MidiNavTarget;
  since: number;
}

export class MidiNav {
  private entries: Entry[] = [];
  private listeners = 0;
  private blockedUntil = -Infinity;
  /** Thời điểm phím đen đang chờ (chưa biết là "lùi lại" hay nửa đầu của "về Trang chủ"). */
  private pendingBlack: number | null = null;
  private home: (() => void) | null = null;

  constructor(
    private readonly guardMs = MIDI_NAV_GUARD_MS,
    private readonly chordMs = MIDI_NAV_CHORD_MS,
  ) {}

  /** Nút có điều hướng bằng phím xuất hiện (`now` = lúc hiện). Trả về hàm gỡ. */
  register(target: MidiNavTarget, now: number): () => void {
    const entry = { target, since: now };
    this.entries.push(entry);
    return () => {
      this.entries = this.entries.filter((e) => e !== entry);
    };
  }

  /** Việc cần làm khi bấm hai phím đen cùng lúc (về Trang chủ). */
  setHome(fn: (() => void) | null): void {
    this.home = fn;
  }

  /** Màn đang nghe nốt (bài tập, trò chơi đang chơi…) → tắt điều hướng tới khi gỡ. */
  listen(): () => void {
    this.listeners++;
    this.pendingBlack = null;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.listeners--;
    };
  }

  get listening(): boolean {
    return this.listeners > 0;
  }

  /** Còn phím đen đang chờ → gọi `flush(time + chordMs)`. */
  get pending(): boolean {
    return this.pendingBlack !== null;
  }

  /** Màn vừa đổi do chạm (không qua phím đàn) → chờ lại `guardMs`. */
  touched(now: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, now + this.guardMs);
    this.pendingBlack = null;
  }

  /**
   * Một lần bấm phím / đạp pedal. Trả về hành động đã thực hiện; 'pending' = phím đen đang chờ phím đen
   * thứ hai (gọi `flush` sau `chordMs`); null = bỏ qua.
   */
  press(input: MidiNavInput): MidiNavResult | 'pending' | null {
    if (this.listeners > 0 || input.time < this.blockedUntil) return null;
    if (actionFor(input) === 'forward') {
      this.pendingBlack = null;
      return this.fire('forward', input.time);
    }
    const first = this.pendingBlack;
    if (first !== null && input.time - first <= this.chordMs) {
      this.pendingBlack = null;
      return this.goHome(input.time);
    }
    // Chỉ chờ khi có chỗ để đi (nút "lùi lại" hoặc về Trang chủ từ màn chờ bấm nút).
    if (!this.settledTarget(null, input.time)) return null;
    this.pendingBlack = input.time;
    return 'pending';
  }

  /** Hết thời gian chờ phím đen thứ hai → "lùi lại". */
  flush(now: number): MidiNavResult | null {
    const t = this.pendingBlack;
    if (t === null || now - t < this.chordMs) return null;
    this.pendingBlack = null;
    if (this.listeners > 0 || t < this.blockedUntil) return null;
    return this.fire('back', t);
  }

  private goHome(time: number): MidiNavResult | null {
    if (!this.home || !this.settledTarget(null, time)) return null;
    this.blockedUntil = time + this.guardMs;
    this.home();
    return 'home';
  }

  private fire(action: MidiNavAction, time: number): MidiNavResult | null {
    const target = this.settledTarget(action, time);
    if (!target) return null;
    this.blockedUntil = time + this.guardMs;
    target.activate();
    return action;
  }

  /**
   * Nút xuất hiện sau cùng (lớp phủ / hộp thoại mới nhất), còn dùng được, đúng loại (`action` null = loại nào cũng được).
   * Nút đó vừa hiện chưa đủ `guardMs` → null.
   */
  private settledTarget(action: MidiNavAction | null, time: number): MidiNavTarget | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if ((action && e.target.action !== action) || !e.target.available()) continue;
      return time - e.since < this.guardMs ? null : e.target;
    }
    return null;
  }
}
