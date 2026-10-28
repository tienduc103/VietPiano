/**
 * QuizEngine — máy trạng thái dùng chung cho bài nhiều lượt: tìm phím, trắc nghiệm, nhận diện nốt.
 * Mỗi lượt có một hàm chấm `check(answer)`; engine không biết câu trả lời là phím hay lựa chọn.
 *  - retry = true (luyện tập): sai thì ở lại lượt đó tới khi đúng; lượt được tính đúng nếu đúng ngay lần đầu.
 *  - retry = false (kiểm tra): mỗi lượt một lần trả lời, sai cũng sang lượt sau.
 * Câu trả lời đến quá sát lần chuyển lượt (`minIntervalMs`) bị bỏ qua — micro hay phát lặp một nốt.
 */

export type RoundResult = 'pending' | 'correct' | 'corrected' | 'wrong';
export type QuizStatus = 'active' | 'finished';
export type QuizOutcome = 'correct' | 'wrong' | 'ignored' | 'finished';

export interface QuizState<A> {
  readonly index: number;
  readonly status: QuizStatus;
  readonly results: readonly RoundResult[];
  /** Số lượt đúng ngay lần đầu. */
  readonly correct: number;
  /** Tổng số lần trả lời sai (kể cả lúc thử lại). */
  readonly wrong: number;
  readonly lastAnswer: A | null;
  readonly lastOutcome: 'correct' | 'wrong' | null;
  readonly lastEventTime: number;
  /** Câu trả lời sai theo từng lượt (để thống kê lỗi hay gặp). */
  readonly mistakes: readonly { round: number; answer: A }[];
}

export interface QuizConfig {
  retry: boolean;
  minIntervalMs: number;
}

export class QuizEngine<A> {
  private state: QuizState<A>;
  private readonly listeners = new Set<(s: QuizState<A>) => void>();
  private lastAdvanceTime = -Infinity;
  private wrongOnCurrent = false;
  private readonly config: QuizConfig;

  constructor(
    private readonly checks: readonly ((answer: A) => boolean)[],
    config: Partial<QuizConfig> = {},
  ) {
    if (checks.length === 0) throw new Error('Bài tập phải có ít nhất một lượt');
    this.config = { retry: false, minIntervalMs: 250, ...config };
    this.state = this.initialState();
  }

  private initialState(): QuizState<A> {
    return {
      index: 0,
      status: 'active',
      results: this.checks.map(() => 'pending'),
      correct: 0,
      wrong: 0,
      lastAnswer: null,
      lastOutcome: null,
      lastEventTime: 0,
      mistakes: [],
    };
  }

  getState(): QuizState<A> {
    return this.state;
  }

  get rounds(): number {
    return this.checks.length;
  }

  subscribe(listener: (s: QuizState<A>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<QuizState<A>>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  answer(answer: A, time: number): QuizOutcome {
    const s = this.state;
    if (s.status === 'finished') return 'finished';
    if (time - this.lastAdvanceTime < this.config.minIntervalMs) return 'ignored';
    const ok = this.checks[s.index](answer);
    const base = { lastAnswer: answer, lastOutcome: ok ? ('correct' as const) : ('wrong' as const), lastEventTime: time };
    if (!ok) {
      const mistakes = [...s.mistakes, { round: s.index, answer }];
      if (this.config.retry) {
        this.wrongOnCurrent = true;
        this.setState({ ...base, wrong: s.wrong + 1, mistakes });
        return 'wrong';
      }
    }
    const results = s.results.slice();
    results[s.index] = ok ? (this.wrongOnCurrent ? 'corrected' : 'correct') : 'wrong';
    const firstTry = ok && !this.wrongOnCurrent;
    this.wrongOnCurrent = false;
    this.lastAdvanceTime = time;
    const next = s.index + 1;
    const finished = next >= this.checks.length;
    this.setState({
      ...base,
      index: finished ? s.index : next,
      status: finished ? 'finished' : 'active',
      results,
      correct: s.correct + (firstTry ? 1 : 0),
      wrong: s.wrong + (ok ? 0 : 1),
      mistakes: ok ? s.mistakes : [...s.mistakes, { round: s.index, answer }],
    });
    return ok ? 'correct' : 'wrong';
  }

  /** Người học xem gợi ý ở lượt hiện tại → lượt này không còn tính là đúng ngay lần đầu. */
  hint(): void {
    if (this.state.status === 'active') this.wrongOnCurrent = true;
  }

  restart(): void {
    this.wrongOnCurrent = false;
    this.lastAdvanceTime = -Infinity;
    this.state = this.initialState();
    this.listeners.forEach((l) => l(this.state));
  }
}
