/**
 * CalibrationCheck — bài kiểm tra sau khi căn chỉnh: khuông nhạc chạy theo nhịp nhưng DỪNG CHỜ ở
 * mỗi nốt cho tới khi nghe đúng nốt đó, rồi chạy tiếp. Mục đích là xem máy NGHE có đúng không:
 *  - nghe sai nốt (wrong) — micro nhầm cao độ, hoặc người chơi đánh nhầm;
 *  - nghe thừa (extra) — âm ngân của nốt vừa đánh bị tính là đánh lại (nhảy nốt trong Wait Mode).
 *
 * Mô hình đồng hồ: vị trí (nốt đen) = anchorPos + (t − anchorTime) × nhịp, nhưng không vượt quá
 * thời điểm của nốt đang chờ. Nhận đúng nốt → đặt lại mốc tại vị trí hiện tại và chạy tiếp.
 * Sự kiện trùng cao độ nốt vừa nhận mà đến trước cửa sổ của nốt kế (earlyWindowBeats) được tính là
 * "thừa" — nhờ vậy hai nốt giống nhau liền nhau (E4 E4) vẫn phân biệt được với âm ngân bị nhận lại.
 */

import { parseNotes } from '../lessons/notation';
import { DURATION_BEATS, type Lesson } from '../lessons/types';

export interface CheckNote {
  midi: number;
  /** Trường độ, tính bằng nốt đen. */
  beats: number;
}

export interface CalibrationCheckConfig {
  bpm: number;
  countInBeats: number;
  /** Đánh nốt trùng cao độ nốt trước sớm hơn chừng này (nốt đen) so với nốt kế → tính là âm ngân nhận lại. */
  earlyWindowBeats: number;
  octaveTolerant: boolean;
}

export const DEFAULT_CHECK_CONFIG: CalibrationCheckConfig = {
  bpm: 72,
  countInBeats: 4,
  earlyWindowBeats: 0.5,
  octaveTolerant: false,
};

export interface CheckNoteResult {
  accepted: boolean;
  /** Các nốt nghe sai trong lúc chờ nốt này. */
  wrong: number[];
  /** Số lần nốt này bị nghe lại (thừa) sau khi đã được nhận. */
  extra: number;
}

export type CheckStatus = 'idle' | 'countIn' | 'running' | 'finished';

export interface CheckState {
  readonly status: CheckStatus;
  /** Nốt đang chờ (= notes.length khi đã nhận hết). */
  readonly index: number;
  readonly results: readonly CheckNoteResult[];
  /** Có sự kiện nghe sai gần nhất (đổi giá trị mỗi lần, để UI rung). */
  readonly wrongCount: number;
}

export type CheckEventOutcome = 'accepted' | 'wrong' | 'extra' | 'ignored';

/** Giai điệu kiểm tra: nhảy quãng, nốt lặp liền nhau (E4 E4, G4 G4) và quãng 8 (C4–C5). */
export const CHECK_LESSON: Lesson = {
  id: 'calibration-check',
  title: 'Kiểm tra nhận diện',
  description: 'Bài kiểm tra sau khi căn chỉnh micro.',
  category: 'notes',
  clef: 'treble',
  timeSignature: [4, 4],
  difficulty: 1,
  hand: 'right',
  notes: parseNotes('C4 E4 G4 C5 | G4 G4 E4 E4 | D4 F4 A4 F4 | E4 D4 C4/h'),
  source: 'Tự biên soạn (VietPiano)',
  tempo: 72,
};

export function lessonToCheckNotes(lesson: Pick<Lesson, 'notes'>): CheckNote[] {
  return lesson.notes.map((n) => ({ midi: n.midi, beats: DURATION_BEATS[n.duration] }));
}

export class CalibrationCheck {
  readonly config: CalibrationCheckConfig;
  readonly notes: readonly CheckNote[];
  /** Thời điểm bắt đầu từng nốt (nốt đen, nốt đầu = 0). */
  readonly onsets: readonly number[];
  private readonly totalBeats: number;

  private state: CheckState;
  private readonly listeners = new Set<(s: CheckState) => void>();
  private anchorPos = 0;
  private anchorTime = 0;

  constructor(notes: readonly CheckNote[], config: Partial<CalibrationCheckConfig> = {}) {
    this.config = { ...DEFAULT_CHECK_CONFIG, ...config };
    this.notes = notes;
    let pos = 0;
    this.onsets = notes.map((n) => {
      const at = pos;
      pos += n.beats;
      return at;
    });
    this.totalBeats = pos;
    this.state = { status: 'idle', index: 0, results: notes.map(() => emptyResult()), wrongCount: 0 };
  }

  getState(): CheckState {
    return this.state;
  }

  subscribe(listener: (s: CheckState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(time: number): void {
    this.anchorPos = -this.config.countInBeats;
    this.anchorTime = time;
    this.set({ status: 'countIn', index: 0, results: this.notes.map(() => emptyResult()), wrongCount: 0 });
  }

  /** Vị trí đồng hồ nhịp (nốt đen); âm = đang đếm vào. Dừng ở nốt đang chờ. */
  position(time: number): number {
    const s = this.state;
    if (s.status === 'idle') return -this.config.countInBeats;
    if (s.status === 'finished') return this.totalBeats;
    const free = this.anchorPos + ((time - this.anchorTime) * this.config.bpm) / 60000;
    const cap = s.index < this.notes.length ? this.onsets[s.index] : this.totalBeats;
    return Math.min(free, cap);
  }

  /** Đồng hồ đang dừng chờ nốt. */
  isWaiting(time: number): boolean {
    const s = this.state;
    return (s.status === 'countIn' || s.status === 'running') && s.index < this.notes.length && this.position(time) >= this.onsets[s.index];
  }

  /** Gọi đều đặn (mỗi khung hình): chuyển trạng thái đếm vào → chạy → xong. */
  tick(time: number): void {
    const s = this.state;
    const pos = this.position(time);
    if (s.status === 'countIn' && pos >= 0) this.set({ ...s, status: 'running' });
    else if (s.status === 'running' && s.index >= this.notes.length && pos >= this.totalBeats) this.set({ ...s, status: 'finished' });
  }

  handleNote(midi: number, time: number): CheckEventOutcome {
    this.tick(time);
    const s = this.state;
    if (s.status !== 'countIn' && s.status !== 'running') return 'ignored';
    const pos = this.position(time);
    const i = s.index;
    const prev = i > 0 ? this.notes[i - 1].midi : null;
    const expected = i < this.notes.length ? this.notes[i].midi : null;

    if (expected !== null && this.matches(midi, expected)) {
      const tooEarly = pos < this.onsets[i] - this.config.earlyWindowBeats;
      if (!(tooEarly && prev !== null && this.matches(midi, prev))) {
        this.anchorPos = pos;
        this.anchorTime = time;
        this.set({ ...s, index: i + 1, results: patch(s.results, i, (r) => ({ ...r, accepted: true })) });
        return 'accepted';
      }
    }
    if (prev !== null && this.matches(midi, prev)) {
      this.set({ ...s, results: patch(s.results, i - 1, (r) => ({ ...r, extra: r.extra + 1 })) });
      return 'extra';
    }
    if (expected === null) return 'ignored';
    this.set({ ...s, results: patch(s.results, i, (r) => ({ ...r, wrong: [...r.wrong, midi] })), wrongCount: s.wrongCount + 1 });
    return 'wrong';
  }

  private matches(played: number, target: number): boolean {
    return played === target || (this.config.octaveTolerant && (played - target) % 12 === 0);
  }

  private set(next: CheckState): void {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }
}

export type CheckAdvice = 'extra-notes' | 'octave-errors' | 'wrong-notes';

export interface CheckSummary {
  total: number;
  /** Nốt được nhận ngay, không nghe sai, không nghe thừa. */
  clean: number;
  wrongEvents: number;
  octaveEvents: number;
  extraEvents: number;
  advice: CheckAdvice[];
}

export function summarizeCheck(notes: readonly CheckNote[], results: readonly CheckNoteResult[]): CheckSummary {
  let clean = 0;
  let wrongEvents = 0;
  let octaveEvents = 0;
  let extraEvents = 0;
  results.forEach((r, i) => {
    if (r.accepted && r.wrong.length === 0 && r.extra === 0) clean++;
    extraEvents += r.extra;
    for (const m of r.wrong) {
      if ((m - notes[i].midi) % 12 === 0) octaveEvents++;
      else wrongEvents++;
    }
  });
  const advice: CheckAdvice[] = [];
  if (extraEvents > 0) advice.push('extra-notes');
  if (octaveEvents > 0) advice.push('octave-errors');
  if (wrongEvents > 0) advice.push('wrong-notes');
  return { total: notes.length, clean, wrongEvents, octaveEvents, extraEvents, advice };
}

function emptyResult(): CheckNoteResult {
  return { accepted: false, wrong: [], extra: 0 };
}

function patch<T>(arr: readonly T[], i: number, f: (v: T) => T): T[] {
  return arr.map((v, k) => (k === i ? f(v) : v));
}
