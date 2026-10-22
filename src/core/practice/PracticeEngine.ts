/**
 * PracticeEngine — logic Wait Mode, không phụ thuộc UI hay nguồn âm thanh.
 *
 * Quy tắc:
 *  - Đúng nốt cần đánh → chuyển sang nốt tiếp theo (mỗi sự kiện chỉ tiến TỐI ĐA một nốt).
 *  - Sai nốt → giữ nguyên vị trí, đếm một lỗi.
 *  - Không có sự kiện → tiếp tục chờ.
 *  - Sự kiện đến quá sát lần chuyển nốt trước (minAdvanceIntervalMs) bị bỏ qua,
 *    lớp bảo vệ thứ hai chống nhảy nhiều nốt (lớp thứ nhất là NoteRecognizer).
 */

export type PracticeStatus = 'waiting' | 'correct' | 'wrong' | 'finished';
export type NoteResult = 'pending' | 'correct' | 'corrected' | 'skipped';

export interface PracticeConfig {
  /** Bỏ qua sự kiện đến sớm hơn khoảng này sau lần chuyển nốt (ms). */
  minAdvanceIntervalMs: number;
  /** Chấp nhận đúng tên nốt nhưng sai quãng tám (hữu ích khi micro nhầm quãng 8). */
  octaveTolerant: boolean;
}

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  minAdvanceIntervalMs: 120,
  octaveTolerant: false,
};

export interface PracticeState {
  readonly expected: readonly number[];
  readonly index: number;
  readonly status: PracticeStatus;
  readonly results: readonly NoteResult[];
  readonly correct: number;
  readonly wrong: number;
  readonly skipped: number;
  readonly lastPlayedMidi: number | null;
  /** Thời điểm của kết quả gần nhất (để UI hiện hiệu ứng ngắn). */
  readonly lastEventTime: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

export type NoteOutcome = 'correct' | 'wrong' | 'ignored' | 'finished';

export function computeAccuracy(state: Pick<PracticeState, 'correct' | 'wrong'>): number {
  const attempts = state.correct + state.wrong;
  return attempts === 0 ? 0 : state.correct / attempts;
}

export class PracticeEngine {
  private state: PracticeState;
  private readonly listeners = new Set<(s: PracticeState) => void>();
  private lastAdvanceTime = -Infinity;
  private hadWrongOnCurrent = false;

  constructor(
    expected: readonly number[],
    private config: PracticeConfig = DEFAULT_PRACTICE_CONFIG,
  ) {
    if (expected.length === 0) throw new Error('Bài học phải có ít nhất một nốt');
    this.state = PracticeEngine.initialState(expected);
  }

  private static initialState(expected: readonly number[]): PracticeState {
    return {
      expected,
      index: 0,
      status: 'waiting',
      results: expected.map(() => 'pending'),
      correct: 0,
      wrong: 0,
      skipped: 0,
      lastPlayedMidi: null,
      lastEventTime: 0,
      startedAt: null,
      finishedAt: null,
    };
  }

  getState(): PracticeState {
    return this.state;
  }

  get expectedMidi(): number | null {
    return this.state.status === 'finished' ? null : this.state.expected[this.state.index];
  }

  setConfig(config: Partial<PracticeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  subscribe(listener: (s: PracticeState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<PracticeState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private matches(played: number, expected: number): boolean {
    if (played === expected) return true;
    return this.config.octaveTolerant && (played - expected) % 12 === 0;
  }

  /** Xử lý một sự kiện nốt từ NoteInputProvider. */
  handleNote(midi: number, time: number): NoteOutcome {
    const s = this.state;
    if (s.status === 'finished') return 'finished';
    if (time - this.lastAdvanceTime < this.config.minAdvanceIntervalMs) return 'ignored';

    const startedAt = s.startedAt ?? time;
    const expected = s.expected[s.index];

    if (!this.matches(midi, expected)) {
      this.hadWrongOnCurrent = true;
      this.setState({ status: 'wrong', wrong: s.wrong + 1, lastPlayedMidi: midi, lastEventTime: time, startedAt });
      return 'wrong';
    }

    const results = s.results.slice();
    results[s.index] = this.hadWrongOnCurrent ? 'corrected' : 'correct';
    this.hadWrongOnCurrent = false;
    this.lastAdvanceTime = time;
    const index = s.index + 1;
    const finished = index >= s.expected.length;
    this.setState({
      index: finished ? s.expected.length - 1 : index,
      status: finished ? 'finished' : 'correct',
      results,
      correct: s.correct + 1,
      lastPlayedMidi: midi,
      lastEventTime: time,
      startedAt,
      finishedAt: finished ? time : null,
    });
    return finished ? 'finished' : 'correct';
  }

  /** Bỏ qua nốt hiện tại. */
  skip(time: number): void {
    const s = this.state;
    if (s.status === 'finished') return;
    const results = s.results.slice();
    results[s.index] = 'skipped';
    this.hadWrongOnCurrent = false;
    this.lastAdvanceTime = time;
    const index = s.index + 1;
    const finished = index >= s.expected.length;
    this.setState({
      index: finished ? s.expected.length - 1 : index,
      status: finished ? 'finished' : 'waiting',
      results,
      skipped: s.skipped + 1,
      lastEventTime: time,
      startedAt: s.startedAt ?? time,
      finishedAt: finished ? time : null,
    });
  }

  /** Quay lại nốt trước (đặt lại kết quả của nốt đó). */
  back(time: number): void {
    const s = this.state;
    const target = s.status === 'finished' ? s.index : Math.max(0, s.index - 1);
    const results = s.results.slice();
    results[target] = 'pending';
    if (s.status !== 'finished') results[s.index] = 'pending';
    this.hadWrongOnCurrent = false;
    this.lastAdvanceTime = time;
    this.setState({ index: target, status: 'waiting', results, lastEventTime: time, finishedAt: null });
  }

  /** Chơi lại từ đầu, xoá thống kê. */
  restart(): void {
    this.hadWrongOnCurrent = false;
    this.lastAdvanceTime = -Infinity;
    this.state = PracticeEngine.initialState(this.state.expected);
    this.listeners.forEach((l) => l(this.state));
  }
}
