/**
 * Một lượt "Đố bé nốt gì?" — máy trạng thái thuần: ready → asking ⇄ (sai: vẫn asking) → answered → … → finished.
 *
 * - Không giới hạn thời gian, không trừ điểm; chạm sai không mất gì, bé chọn lại tới khi đúng (ô đã chọn sai mờ đi).
 * - Mỗi lần sai → cô gợi ý thông minh (`hints.ts`): lời → minh hoạ → cất bớt ô sai → chỉ ra ô đúng.
 *   Đã phải chỉ ra đáp án → sau khi bé chạm đúng, lượt có thêm một câu tương tự (`makeSimilar`) để bé tự làm lại.
 * - Điểm mỗi câu: đúng ngay lần đầu 10, đúng sau khi thử lại / có gợi ý 5. Sao theo tỉ lệ đúng ngay,
 *   chơi hết lượt luôn được ít nhất 1 sao (không tạo áp lực cho bé).
 */
import { nextHint, type Hint, type HintConfig, type HintLevel, type Support, type WrongCause } from './hints';
import { matches, type QuizOption, type QuizQuestion } from './questions';

export type QuizStatus = 'ready' | 'asking' | 'answered' | 'finished';

export interface QuestionResult {
  /** Số lần chọn sai trước khi đúng. */
  wrong: number;
  /** Ô đã chọn sai (theo thứ tự). */
  wrongPicks: QuizOption[];
  /** Nguyên nhân từng lần sai (cao độ / trường độ / cả hai). */
  causes: WrongCause[];
  /** Bậc gợi ý cao nhất đã cần (0 = không cần gợi ý). */
  hintLevel: HintLevel;
  /** Cô đã phải chỉ ra đáp án. */
  revealed: boolean;
  /** Câu tương tự thêm vào sau khi cô chỉ đáp án. */
  followUp: boolean;
  points: number;
}

export interface NoteQuizState {
  status: QuizStatus;
  index: number;
  question: QuizQuestion | null;
  /** Số câu của lượt (tăng khi thêm câu tương tự). */
  total: number;
  /** Chỉ số ô đã chọn sai của câu hiện tại. */
  wrongIndexes: number[];
  /** Gợi ý đang hiện (sau lần sai gần nhất). */
  hint: Hint | null;
  /** Ô đúng đang sáng (cô đã chỉ ra). */
  hinted: boolean;
  /** Ô vừa chạm (hiệu ứng) + kết quả. */
  last: { index: number; correct: boolean; at: number } | null;
  results: QuestionResult[];
  score: number;
}

export type AnswerOutcome = 'correct' | 'wrong' | 'ignored';

export const pointsFor = (wrong: number): number => (wrong === 0 ? 10 : 5);

export interface RoundHelpers {
  /** Mức hỗ trợ theo lịch sử của phần đang hỏi (bé hay nhầm → đơn giản hơn; đã vững → gợi ý muộn hơn). */
  support?: (q: QuizQuestion) => Support;
  /** Sai cả hai thuộc tính: gợi ý phần bé hay nhầm hơn trước. */
  prefer?: (q: QuizQuestion) => 'pitch' | 'duration';
  /** Câu tương tự (cùng yêu cầu, đáp án nhiễu / vị trí khác) sau khi cô phải chỉ đáp án. */
  makeSimilar?: (q: QuizQuestion) => QuizQuestion;
}

export class NoteQuizRound {
  private state: NoteQuizState;
  private readonly listeners = new Set<() => void>();
  private readonly list: QuizQuestion[];
  private followUps = new Set<number>();

  constructor(
    questions: readonly QuizQuestion[],
    private readonly hintConfig: HintConfig,
    private readonly helpers: RoundHelpers = {},
  ) {
    this.list = [...questions];
    this.state = { status: 'ready', index: 0, question: questions[0] ?? null, total: questions.length, wrongIndexes: [], hint: null, hinted: false, last: null, results: [], score: 0 };
  }

  get questions(): readonly QuizQuestion[] {
    return this.list;
  }

  getState = (): NoteQuizState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(patch: Partial<NoteQuizState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  isFollowUp(index: number): boolean {
    return this.followUps.has(index);
  }

  start(): void {
    if (this.state.status !== 'ready') return;
    this.set({ status: this.list.length > 0 ? 'asking' : 'finished' });
  }

  /** Bé chạm ô `index`. Ô đã chọn sai / đã được cô cất thì không tính. */
  answer(index: number, now: number): AnswerOutcome {
    const s = this.state;
    const q = s.question;
    if (s.status !== 'asking' || !q || index < 0 || index >= q.options.length || s.wrongIndexes.includes(index) || s.hint?.eliminated.includes(index)) return 'ignored';
    if (matches(q, q.options[index])) {
      const wrong = s.wrongIndexes.length;
      const points = pointsFor(wrong);
      const revealed = !!s.hint?.reveal;
      const result: QuestionResult = {
        wrong,
        wrongPicks: s.wrongIndexes.map((i) => q.options[i]),
        causes: s.hint ? this.causes : [],
        hintLevel: this.maxLevel,
        revealed,
        followUp: this.followUps.has(s.index),
        points,
      };
      // Cô đã chỉ đáp án → thêm một câu tương tự ngay sau câu này (một lần, không nối dài mãi).
      let total = s.total;
      if (revealed && this.helpers.makeSimilar && !this.followUps.has(s.index)) {
        this.list.splice(s.index + 1, 0, this.helpers.makeSimilar(q));
        this.followUps = new Set([...this.followUps].map((i) => (i > s.index ? i + 1 : i)));
        this.followUps.add(s.index + 1);
        total = this.list.length;
      }
      this.set({ status: 'answered', total, last: { index, correct: true, at: now }, results: [...s.results, result], score: s.score + points });
      return 'correct';
    }
    const wrongIndexes = [...s.wrongIndexes, index];
    const hint = nextHint({
      q,
      wrongIndexes,
      eliminated: s.hint?.eliminated ?? [],
      previousLevel: s.hint?.level ?? 0,
      config: this.hintConfig,
      support: this.helpers.support?.(q) ?? 'normal',
      prefer: this.helpers.prefer?.(q) ?? 'pitch',
    });
    this.causes = [...this.causes, hint.cause];
    this.maxLevel = Math.max(this.maxLevel, hint.level) as HintLevel;
    this.set({ wrongIndexes, hint, hinted: hint.reveal, last: { index, correct: false, at: now } });
    return 'wrong';
  }

  private causes: WrongCause[] = [];
  private maxLevel: HintLevel = 0;

  /** Sang câu sau (hoặc kết thúc lượt). */
  next(): void {
    const s = this.state;
    if (s.status !== 'answered') return;
    const index = s.index + 1;
    this.causes = [];
    this.maxLevel = 0;
    if (index >= this.list.length) {
      this.set({ status: 'finished', last: null, hint: null });
      return;
    }
    this.set({ status: 'asking', index, question: this.list[index], wrongIndexes: [], hint: null, hinted: false, last: null });
  }
}

export interface QuizSummary {
  total: number;
  firstTry: number;
  /** Câu cần gợi ý (bậc ≥ 1). */
  helped: number;
  revealed: number;
  score: number;
  maxScore: number;
  stars: number;
}

/** Tổng kết: câu tương tự (thêm sau khi cô chỉ đáp án) không tính vào tỉ lệ sao. */
export function summarizeQuiz(state: Pick<NoteQuizState, 'results' | 'score'>): QuizSummary {
  const main = state.results.filter((r) => !r.followUp);
  const firstTry = main.filter((r) => r.wrong === 0).length;
  const total = main.length;
  const ratio = total > 0 ? firstTry / total : 0;
  return {
    total,
    firstTry,
    helped: state.results.filter((r) => r.hintLevel > 0).length,
    revealed: state.results.filter((r) => r.revealed).length,
    score: state.score,
    maxScore: state.results.length * 10,
    stars: ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1,
  };
}
