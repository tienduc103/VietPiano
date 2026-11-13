/**
 * Câu cô giáo của "Đố bé nốt gì?". Mọi câu ghép từ tập hữu hạn (7 tên nốt × 5 trường độ) → `npm run voice` thu sẵn mp3
 * cho từng câu đơn (`noteQuizVoiceLines`). Sửa câu ở đây rồi chạy lại `npm run voice`.
 * Không đọc tên / thông tin của bé.
 */
import type { VoiceCue } from '../voice/types';
import { hintVoiceLines } from './hints';
import type { QuizQuestion } from './questions';
import { DURATION_NAME, LETTERS, QUIZ_DURATIONS, SOLFEGE_NAME, type Letter, type QuizDuration } from './staff';

/** "nốt Đô", "nốt Tròn", "nốt Đô Tròn". */
export function askedName(q: { letter: Letter | null; duration: QuizDuration | null }): string {
  return ['nốt', q.letter ? SOLFEGE_NAME[q.letter] : '', q.duration ? DURATION_NAME[q.duration] : ''].filter(Boolean).join(' ');
}

/** Câu hỏi: "Bé ơi, đâu là nốt Đô?" / "Bé tìm giúp cô nốt Tròn nhé!" / "Bé ơi, đâu là nốt Đô Tròn?". */
export function questionText(q: Pick<QuizQuestion, 'letter' | 'duration'>): string {
  return q.letter === null ? `Bé tìm giúp cô ${askedName(q)} nhé!` : `Bé ơi, đâu là ${askedName(q)}?`;
}

export const QUIZ_SAY = {
  welcome: 'Chào bé! Cô đố, bé chạm vào hình nốt đúng nhé!',
  wrong: 'Chưa đúng rồi, bé thử lại nhé!',
  end3: 'Bé giỏi quá! Bé được ba ngôi sao!',
  end2: 'Bé làm tốt lắm! Bé được hai ngôi sao!',
  end1: 'Bé chơi xong rồi! Bé được một ngôi sao. Mình chơi lại nhé!',
} as const;

export function praiseText(q: Pick<QuizQuestion, 'letter' | 'duration'>): string {
  return `Giỏi quá! Đây đúng là ${askedName(q)}!`;
}

export function endText(stars: number): string {
  return stars >= 3 ? QUIZ_SAY.end3 : stars === 2 ? QUIZ_SAY.end2 : QUIZ_SAY.end1;
}

/** Câu hỏi: ưu tiên 3. Khen / nhắc khi bé chạm: ưu tiên 4 → ngắt câu hỏi đang đọc dở. Không cooldown (bé có thể sai liên tiếp). */
export function quizCue(kind: 'question' | 'feedback' | 'end', text: string): VoiceCue {
  return {
    id: `nq-${kind}`,
    trigger: kind === 'question' ? 'step_start' : kind === 'end' ? 'lesson_complete' : 'note_correct',
    instructionText: text,
    priority: kind === 'question' ? 3 : 4,
    cooldownMs: 0,
  };
}

/** Mọi câu cô có thể nói trong trò (cho `npm run voice`). */
export function noteQuizVoiceLines(): string[] {
  const asks: { letter: Letter | null; duration: QuizDuration | null }[] = [
    ...LETTERS.map((letter) => ({ letter, duration: null })),
    ...QUIZ_DURATIONS.map((duration) => ({ letter: null, duration })),
    ...LETTERS.flatMap((letter) => QUIZ_DURATIONS.map((duration) => ({ letter, duration }))),
  ];
  return [...Object.values(QUIZ_SAY), ...asks.flatMap((a) => [questionText(a), praiseText(a)]), ...hintVoiceLines()];
}
