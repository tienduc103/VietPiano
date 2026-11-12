/**
 * Cô giáo gợi ý thông minh của "Đố bé nốt gì?" (logic thuần, câu chữ cố định → thu sẵn giọng).
 *
 * Bé chọn sai → cô KHÔNG chỉ ngay đáp án mà gợi ý tăng dần, mỗi bậc cụ thể hơn bậc trước:
 *   1. Lời: gợi ý thô theo phần bé nhầm (nốt trên dòng / trong khe / ngoài khuông; hình dáng trường độ). Không đánh dấu ô nào.
 *   2. Trực quan: vị trí chính xác theo KHOÁ ĐANG HỎI + khuông minh hoạ riêng tô dòng / khe; hình mẫu trường độ ở khu gợi ý.
 *      Kết hợp: giải thích lần lượt cao độ rồi trường độ.
 *   3. Hướng dẫn: cất bớt (làm mờ) các ô sai theo từng bước, luôn chừa ít nhất một ô sai để bé tự chọn.
 *   4. Chỉ ra đáp án (ô đúng sáng lên) + giải thích; bé chạm xong thì làm thêm một câu tương tự.
 * Phân tích nguyên nhân sai: sai cao độ / sai trường độ / đúng tên sai trường độ / đúng trường độ sai tên / sai cả hai
 * (ưu tiên phần bé hay nhầm). Không trừ điểm, không mất lượt thử.
 */
import type { QuizOption, QuizQuestion } from './questions';
import { clefPitches, DURATION_NAME, LETTERS, letterOf, positionText, QUIZ_CLEFS, QUIZ_DURATIONS, SOLFEGE_NAME, staffStep, type QuizClef, type QuizDuration } from './staff';

export type HintLevel = 0 | 1 | 2 | 3 | 4;
/** Phần bé chọn nhầm so với câu hỏi. */
export type WrongCause = 'pitch' | 'duration' | 'both';
/** Mức hỗ trợ của phần đang hỏi: `simple` bé hay nhầm → gợi ý trực quan ngay; `reduced` bé đã vững → gợi ý muộn hơn. */
export type Support = 'normal' | 'simple' | 'reduced';

export interface HintConfig {
  /** Tắt → chỉ "Chưa đúng rồi, bé thử lại nhé!". */
  smartHints: boolean;
  /** Bắt đầu gợi ý sau mấy lần sai. */
  hintAfter: 1 | 2;
  /** Hỗ trợ tối đa cho bé nhỏ: gợi ý trực quan ngay lần sai đầu, cất ô sai nhanh hơn. */
  maxSupport: boolean;
}

export interface Hint {
  level: HintLevel;
  /** Nguyên nhân của lần sai vừa rồi. */
  cause: WrongCause;
  /** Câu cô nói + hiện chữ (ghép từ các câu đơn cố định). */
  text: string;
  /** Khuông minh hoạ tô dòng / khe của nốt cần tìm (khoá đang hỏi). */
  staff: { clef: QuizClef; step: number } | null;
  /** Hình mẫu của trường độ cần tìm. */
  sample: QuizDuration | null;
  /** Ô sai cô cất bớt (cộng dồn qua các bậc). */
  eliminated: number[];
  /** Ô đúng sáng lên. */
  reveal: boolean;
}

export function wrongCause(q: Pick<QuizQuestion, 'letter' | 'duration'>, o: QuizOption): WrongCause {
  const pitchWrong = q.letter !== null && o.letter !== q.letter;
  const durationWrong = q.duration !== null && o.duration !== q.duration;
  return pitchWrong && durationWrong ? 'both' : pitchWrong ? 'pitch' : 'duration';
}

// ─── Câu chữ (nhạc lý cố định, đã kiểm chứng; mỗi hàm trả về MỘT câu đơn) ───

/** Hình dáng trường độ (đầu nốt, thân, móc). */
export const DURATION_SHAPE: Record<QuizDuration, string> = {
  w: 'Nốt Tròn có hình bầu dục rỗng và không có thân.',
  h: 'Nốt Trắng có đầu rỗng và có thân.',
  q: 'Nốt Đen có đầu tô đen và có thân.',
  '8': 'Nốt Móc đơn có đầu tô đen, có thân và một móc.',
  '16': 'Nốt Móc đôi có đầu tô đen, có thân và hai móc.',
};

/** Gợi ý thô vị trí (bậc 1): trên dòng / trong khe / ngoài khuông — theo khoá đang hỏi. */
export function pitchCoarse(midi: number, clef: QuizClef): string {
  const s = staffStep(midi, clef);
  const name = SOLFEGE_NAME[letterOf(midi)];
  if (s < 0) return `Nốt ${name} nằm phía dưới khuông nhạc.`;
  if (s > 8) return `Nốt ${name} nằm phía trên khuông nhạc.`;
  return s % 2 === 0 ? `Nốt ${name} nằm trên một dòng kẻ.` : `Nốt ${name} nằm trong một khe.`;
}

/** Tên khoá giữa câu (giữ hoa tên nốt Sol / Fa / Đô). */
const CLEF_IN_SENTENCE: Record<QuizClef, string> = { treble: 'khoá Sol', bass: 'khoá Fa', alto: 'khoá Đô Alto', tenor: 'khoá Đô Tenor' };

/** Vị trí chính xác (bậc 2+): "Ở khoá Fa, nốt Đô nằm ở khe thứ 2." */
export function pitchExact(midi: number, clef: QuizClef): string {
  return `Ở ${CLEF_IN_SENTENCE[clef]}, nốt ${SOLFEGE_NAME[letterOf(midi)]} ${positionText(midi, clef)}.`;
}

const LOOK_AGAIN = 'Bé nhìn lại nhé!';
const RETRY = 'Chưa đúng rồi, bé thử lại nhé!';
const ELIMINATE = 'Cô cất bớt mấy hình chưa đúng. Bé chọn trong các hình còn lại nhé!';
const REVEAL_TAP = 'Bé chạm vào ô đang sáng nhé!';

const rightLetter = (q: QuizQuestion) => `Bé tìm đúng nốt ${SOLFEGE_NAME[q.letter!]} rồi! Nhưng cô đang hỏi nốt ${SOLFEGE_NAME[q.letter!]} ${DURATION_NAME[q.duration!]} cơ.`;
const rightDuration = (q: QuizQuestion) => `Bé nhận ra nốt ${DURATION_NAME[q.duration!]} rồi! Bây giờ mình tìm đúng vị trí nốt ${SOLFEGE_NAME[q.letter!]} nhé.`;
const reveal = (q: QuizQuestion) => `Cô chỉ cho bé nhé: đây là nốt ${[q.letter ? SOLFEGE_NAME[q.letter] : '', q.duration ? DURATION_NAME[q.duration] : ''].filter(Boolean).join(' ')}.`;
export const SIMILAR_TEXT = 'Mình thử một câu giống vậy nhé!';

/** Câu gợi ý theo bậc + nguyên nhân + phần cô tập trung. */
function hintText(q: QuizQuestion, level: HintLevel, cause: WrongCause, focus: 'pitch' | 'duration'): string {
  const target = q.options[q.answer];
  const parts: string[] = [];
  if (q.mode === 'both' && level <= 2) {
    if (cause === 'duration') parts.push(rightLetter(q));
    if (cause === 'pitch') parts.push(rightDuration(q));
  }
  const pitchFocus = q.mode === 'pitch' || (q.mode === 'both' && focus === 'pitch');
  if (level === 1) {
    parts.push(pitchFocus ? pitchCoarse(target.midi, q.clef) : DURATION_SHAPE[target.duration], LOOK_AGAIN);
  } else if (level === 2) {
    // Kết hợp: lần lượt cao độ rồi trường độ.
    if (q.letter) parts.push(pitchExact(target.midi, q.clef));
    if (q.duration) parts.push(DURATION_SHAPE[target.duration]);
    parts.push(LOOK_AGAIN);
  } else if (level === 3) {
    parts.push(ELIMINATE);
  } else {
    parts.push(reveal(q));
    if (q.letter) parts.push(pitchExact(target.midi, q.clef));
    if (q.duration) parts.push(DURATION_SHAPE[target.duration]);
    parts.push(REVEAL_TAP);
  }
  return parts.join(' ');
}

export interface HintContext {
  q: QuizQuestion;
  /** Ô bé đã chọn sai (theo thứ tự, gồm lần vừa rồi). */
  wrongIndexes: readonly number[];
  /** Ô đã cất ở các bậc trước. */
  eliminated: readonly number[];
  /** Bậc gợi ý cao nhất đã đưa ở câu này. */
  previousLevel: HintLevel;
  config: HintConfig;
  support: Support;
  /** Sai cả hai thuộc tính: phần bé hay nhầm hơn được gợi ý trước. */
  prefer: 'pitch' | 'duration';
}

/** Gợi ý sau lần chọn sai mới nhất. */
export function nextHint(ctx: HintContext): Hint {
  const { q, wrongIndexes, config } = ctx;
  const last = q.options[wrongIndexes[wrongIndexes.length - 1]];
  const cause = wrongCause(q, last);
  const plain: Hint = { level: 0, cause, text: RETRY, staff: null, sample: null, eliminated: [...ctx.eliminated], reveal: false };
  if (!config.smartHints) return plain;
  const after = config.maxSupport ? 1 : config.hintAfter + (ctx.support === 'reduced' ? 1 : 0);
  const step = wrongIndexes.length - after; // 0 = lần gợi ý đầu tiên
  if (step < 0) return plain;
  const start = config.maxSupport || ctx.support === 'simple' ? 2 : 1;
  // Không bao giờ lùi bậc; mỗi lần sai tiếp theo cụ thể hơn.
  let level = Math.max(Math.min(4, start + step), Math.min(4, ctx.previousLevel + 1)) as HintLevel;
  let eliminated = [...ctx.eliminated];
  if (level >= 3) {
    const remaining = q.options.map((_, i) => i).filter((i) => i !== q.answer && !wrongIndexes.includes(i) && !eliminated.includes(i));
    if (remaining.length > 1) {
      level = 3;
      // Cất theo từng bước: hình sai nhiều thuộc tính nhất trước, chừa lại ≥ 1 ô sai.
      const order = [...remaining].sort((a, b) => wrongness(q, q.options[b]) - wrongness(q, q.options[a]));
      const take = config.maxSupport ? remaining.length - 1 : Math.max(1, Math.floor(remaining.length / 2));
      eliminated = [...eliminated, ...order.slice(0, take)];
    } else {
      level = 4;
    }
  }
  const focus: 'pitch' | 'duration' = cause === 'both' ? ctx.prefer : cause;
  const target = q.options[q.answer];
  const visual = level >= 2;
  return {
    level,
    cause,
    text: hintText(q, level, cause, focus),
    staff: visual && q.letter ? { clef: q.clef, step: staffStep(target.midi, q.clef) } : null,
    sample: visual && q.duration ? target.duration : null,
    eliminated,
    reveal: level === 4,
  };
}

/** Số thuộc tính ô `o` khác yêu cầu (0–2). */
function wrongness(q: QuizQuestion, o: QuizOption): number {
  return (q.letter && o.letter !== q.letter ? 1 : 0) + (q.duration && o.duration !== q.duration ? 1 : 0);
}

/** Mọi câu gợi ý có thể gặp (cho `npm run voice`), đã tách câu đơn ở nơi gọi. */
export function hintVoiceLines(): string[] {
  const out = new Set<string>([LOOK_AGAIN, RETRY, ELIMINATE, REVEAL_TAP, SIMILAR_TEXT, ...Object.values(DURATION_SHAPE)]);
  for (const clef of QUIZ_CLEFS)
    for (const midi of clefPitches(clef, 2)) {
      out.add(pitchCoarse(midi, clef));
      out.add(pitchExact(midi, clef));
    }
  for (const l of LETTERS) {
    out.add(reveal({ letter: l, duration: null } as QuizQuestion));
    for (const d of QUIZ_DURATIONS) {
      const q = { letter: l, duration: d } as QuizQuestion;
      out.add(rightLetter(q));
      out.add(rightDuration(q));
      out.add(reveal(q));
    }
  }
  for (const d of QUIZ_DURATIONS) out.add(reveal({ letter: null, duration: d } as QuizQuestion));
  return [...out];
}
