/**
 * PracticeEngine — logic Wait Mode, không phụ thuộc UI hay nguồn âm thanh.
 *
 * Quy tắc:
 *  - Đúng nốt cần đánh → chuyển sang nốt tiếp theo (mỗi sự kiện chỉ tiến TỐI ĐA một nốt).
 *  - Sai nốt → giữ nguyên vị trí, đếm một lỗi.
 *    Chế độ "Đếm nốt" (advanceOnWrong): sai nốt vẫn chuyển sang nốt tiếp theo, nốt đó ghi là 'wrong'
 *    — mỗi nốt nghe thấy đi đúng một nốt nhạc, người học thấy ngay mình sai ở đâu.
 *  - Không có sự kiện → tiếp tục chờ.
 *  - Sự kiện đến quá sát lần chuyển nốt trước (minAdvanceIntervalMs) bị bỏ qua,
 *    lớp bảo vệ thứ hai chống nhảy nhiều nốt (lớp thứ nhất là NoteRecognizer).
 *  - Hai tay (`twoHands`, chỉ dùng với đàn MIDI — micro không tách được hợp âm): nốt giai điệu kèm các nốt tay
 *    trái `leftHand[index]`. Đánh theo thứ tự bất kỳ; mỗi nốt đúng ghi nhận một phần ('partial'), đủ cả hai tay
 *    mới chuyển nốt. Nốt không thuộc bước hiện tại → sai.
 */

export type PracticeStatus = 'waiting' | 'correct' | 'wrong' | 'finished';
export type NoteResult = 'pending' | 'correct' | 'corrected' | 'wrong' | 'skipped';

export interface PracticeConfig {
  /** Bỏ qua sự kiện đến sớm hơn khoảng này sau lần chuyển nốt (ms). */
  minAdvanceIntervalMs: number;
  /** Chấp nhận đúng tên nốt nhưng sai quãng tám (hữu ích khi micro nhầm quãng 8). */
  octaveTolerant: boolean;
  /** Chế độ "Đếm nốt": sai nốt vẫn chuyển sang nốt tiếp theo. */
  advanceOnWrong: boolean;
  /** Chấm cả nốt tay trái (`leftHand` truyền vào constructor) — chỉ bật khi nốt đến từ đàn MIDI. */
  twoHands?: boolean;
}

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  minAdvanceIntervalMs: 120,
  octaveTolerant: false,
  advanceOnWrong: false,
  twoHands: false,
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
  /** Chế độ hai tay: nốt tay trái của bước hiện tại chưa đánh (rỗng khi tắt hai tay). */
  readonly pendingLeft: readonly number[];
  /** Chế độ hai tay: đã đánh đúng nốt giai điệu, đang chờ tay trái. */
  readonly melodyDone: boolean;
}

export type NoteOutcome = 'correct' | 'partial' | 'wrong' | 'ignored' | 'finished';

export function computeAccuracy(state: Pick<PracticeState, 'correct' | 'wrong'>): number {
  const attempts = state.correct + state.wrong;
  return attempts === 0 ? 0 : state.correct / attempts;
}

export class PracticeEngine {
  private state: PracticeState;
  private readonly listeners = new Set<(s: PracticeState) => void>();
  private lastAdvanceTime = -Infinity;
  private hadWrongOnCurrent = false;
  private leftPressed = new Set<number>();
  private melodyDone = false;

  /** `leftHand[i]` = nốt tay trái cần đánh cùng nốt giai điệu thứ i (xem `accompanimentByNote`). */
  constructor(
    expected: readonly number[],
    private config: PracticeConfig = DEFAULT_PRACTICE_CONFIG,
    private readonly leftHand?: readonly (readonly number[])[],
  ) {
    if (expected.length === 0) throw new Error('Bài học phải có ít nhất một nốt');
    if (leftHand && leftHand.length !== expected.length) throw new Error('Phần tay trái phải khớp số nốt giai điệu');
    this.state = { ...PracticeEngine.initialState(expected), pendingLeft: this.requiredLeft(0) };
  }

  private static initialState(expected: readonly number[]): PracticeState {
    return {
      pendingLeft: [],
      melodyDone: false,
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
    const twoHandsChanged = config.twoHands !== undefined && config.twoHands !== !!this.config.twoHands;
    this.config = { ...this.config, ...config };
    if (twoHandsChanged) {
      this.resetStep();
      this.setState({ pendingLeft: this.requiredLeft(this.state.index), melodyDone: false });
    }
  }

  /** Nốt tay trái cần đánh ở bước `index` (rỗng nếu không chấm hai tay). */
  private requiredLeft(index: number): readonly number[] {
    return (this.config.twoHands && this.leftHand?.[index]) || [];
  }

  private resetStep(): void {
    this.hadWrongOnCurrent = false;
    this.leftPressed = new Set();
    this.melodyDone = false;
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

    // Hai tay: nốt tay trái so khớp chính xác (không nới quãng 8) và xét trước giai điệu.
    const left = this.requiredLeft(s.index);
    const isLeft = left.includes(midi);
    const isMelody = !isLeft && this.matches(midi, expected);
    if (left.length > 0 && (isLeft || isMelody)) {
      if (isLeft ? this.leftPressed.has(midi) : this.melodyDone) return 'ignored';
      if (isLeft) this.leftPressed.add(midi);
      else this.melodyDone = true;
      const pendingLeft = left.filter((m) => !this.leftPressed.has(m));
      if (!this.melodyDone || pendingLeft.length > 0) {
        this.setState({ status: 'waiting', pendingLeft, melodyDone: this.melodyDone, startedAt });
        return 'partial';
      }
    }

    const ok = isLeft || isMelody;
    if (!ok && !this.config.advanceOnWrong) {
      this.hadWrongOnCurrent = true;
      this.setState({ status: 'wrong', wrong: s.wrong + 1, lastPlayedMidi: midi, lastEventTime: time, startedAt });
      return 'wrong';
    }

    const results = s.results.slice();
    results[s.index] = !ok ? 'wrong' : this.hadWrongOnCurrent ? 'corrected' : 'correct';
    this.resetStep();
    this.lastAdvanceTime = time;
    const index = s.index + 1;
    const finished = index >= s.expected.length;
    this.setState({
      pendingLeft: finished ? [] : this.requiredLeft(index),
      melodyDone: false,
      index: finished ? s.expected.length - 1 : index,
      status: finished ? 'finished' : ok ? 'correct' : 'wrong',
      results,
      correct: s.correct + (ok ? 1 : 0),
      wrong: s.wrong + (ok ? 0 : 1),
      lastPlayedMidi: midi,
      lastEventTime: time,
      startedAt,
      finishedAt: finished ? time : null,
    });
    return finished ? 'finished' : ok ? 'correct' : 'wrong';
  }

  /** Bỏ qua nốt hiện tại. */
  skip(time: number): void {
    const s = this.state;
    if (s.status === 'finished') return;
    const results = s.results.slice();
    results[s.index] = 'skipped';
    this.resetStep();
    this.lastAdvanceTime = time;
    const index = s.index + 1;
    const finished = index >= s.expected.length;
    this.setState({
      pendingLeft: finished ? [] : this.requiredLeft(index),
      melodyDone: false,
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
    this.resetStep();
    this.lastAdvanceTime = time;
    this.setState({ index: target, status: 'waiting', results, lastEventTime: time, finishedAt: null, pendingLeft: this.requiredLeft(target), melodyDone: false });
  }

  /** Chơi lại từ đầu, xoá thống kê. */
  restart(): void {
    this.resetStep();
    this.lastAdvanceTime = -Infinity;
    this.state = { ...PracticeEngine.initialState(this.state.expected), pendingLeft: this.requiredLeft(0) };
    this.listeners.forEach((l) => l(this.state));
  }
}
