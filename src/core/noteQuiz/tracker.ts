/**
 * Theo dõi lỗi của bé qua nhiều lượt (theo hồ sơ): mỗi phần được hỏi (tên nốt theo khoá, trường độ) đếm số lần hỏi /
 * số lần chọn nhầm, cặp hay nhầm ("Rê → chọn Mi"). Dùng để:
 *  - hỏi lại nhiều hơn phần bé hay sai (`weightFor`, trọng số khi sinh câu);
 *  - tóm tắt cho phụ huynh ở màn tổng kết (`weakItems`) — theo quy tắc, không suy đoán.
 * Trong câu Kết hợp, chọn nhầm chỉ tính cho phần bị nhầm (đúng tên sai trường độ → chỉ trường độ).
 */
import type { QuestionResult } from './NoteQuizRound';
import type { Support } from './hints';
import { durationKey, pitchKey, type QuizQuestion } from './questions';
import type { NoteQuizSettings } from './config';
import { CLEF_LABEL, DURATION_NAME, LETTERS, QUIZ_DURATIONS, SOLFEGE_NAME, type Letter, type QuizClef, type QuizDuration } from './staff';

export interface ItemStat {
  asked: number;
  /** Số câu có ít nhất một lần chọn nhầm ở phần này. */
  missed: number;
  /** Số câu liên tiếp gần nhất bé đúng ngay ở phần này (đủ dài → giảm dần gợi ý). */
  streak: number;
  /** Số câu phần này cần cô gợi ý (bậc ≥ 1). */
  helped: number;
}

export interface QuizStats {
  items: Record<string, ItemStat>;
  /** "p:treble:D>p:treble:E" → số lần. */
  confusions: Record<string, number>;
  /** Tổng: lần thử (chạm), lỗi cao độ, lỗi trường độ, câu cần gợi ý, câu cô phải chỉ đáp án. */
  totals: { attempts: number; pitchErrors: number; durationErrors: number; helped: number; revealed: number };
}

export const emptyStats = (): QuizStats => ({ items: {}, confusions: {}, totals: { attempts: 0, pitchErrors: 0, durationErrors: 0, helped: 0, revealed: 0 } });

/** Ghi một câu đã trả lời đúng (số lần thử, loại lỗi, mức hỗ trợ). Câu tương tự (sau khi cô chỉ đáp án) vẫn ghi. */
export function recordQuestion(stats: QuizStats, q: QuizQuestion, r: Pick<QuestionResult, 'wrongPicks'> & Partial<Pick<QuestionResult, 'hintLevel' | 'revealed'>>): QuizStats {
  const items = { ...stats.items };
  const confusions = { ...stats.confusions };
  const helped = (r.hintLevel ?? 0) > 0;
  const bump = (key: string, missed: boolean) => {
    const prev = items[key] ?? { asked: 0, missed: 0, streak: 0, helped: 0 };
    items[key] = { asked: prev.asked + 1, missed: prev.missed + (missed ? 1 : 0), streak: missed ? 0 : prev.streak + 1, helped: prev.helped + (helped ? 1 : 0) };
  };
  const t = stats.totals;
  const totals = {
    attempts: t.attempts + r.wrongPicks.length + 1,
    pitchErrors: t.pitchErrors + (q.letter ? r.wrongPicks.filter((o) => o.letter !== q.letter).length : 0),
    durationErrors: t.durationErrors + (q.duration ? r.wrongPicks.filter((o) => o.duration !== q.duration).length : 0),
    helped: t.helped + (helped ? 1 : 0),
    revealed: t.revealed + (r.revealed ? 1 : 0),
  };
  if (q.letter) {
    const key = pitchKey(q.clef, q.letter);
    const wrong = r.wrongPicks.filter((o) => o.letter !== q.letter);
    bump(key, wrong.length > 0);
    for (const o of wrong) confusions[`${key}>${pitchKey(q.clef, o.letter)}`] = (confusions[`${key}>${pitchKey(q.clef, o.letter)}`] ?? 0) + 1;
  }
  if (q.duration) {
    const key = durationKey(q.duration);
    const wrong = r.wrongPicks.filter((o) => o.duration !== q.duration);
    bump(key, wrong.length > 0);
    for (const o of wrong) confusions[`${key}>${durationKey(o.duration)}`] = (confusions[`${key}>${durationKey(o.duration)}`] ?? 0) + 1;
  }
  return { items, confusions, totals };
}

/**
 * Mức hỗ trợ của câu (nhiều phần → lấy phần cần hỗ trợ nhiều nhất):
 * bé hay nhầm (≥ 3 lần hỏi, nhầm ≥ 1/2) → `simple` (gợi ý trực quan ngay); mọi phần đúng ngay ≥ 3 câu liền → `reduced` (gợi ý muộn hơn).
 */
export function supportFor(stats: QuizStats, keys: readonly string[]): Support {
  const list = keys.map((k) => stats.items[k]);
  if (list.some((s) => s && s.asked >= 3 && s.missed / s.asked >= 0.5)) return 'simple';
  if (list.length > 0 && list.every((s) => s && s.streak >= 3)) return 'reduced';
  return 'normal';
}

/** Sai cả cao độ lẫn trường độ: gợi ý phần bé hay nhầm hơn trước (bằng nhau → cao độ). */
export function preferFor(stats: QuizStats, keys: readonly string[]): 'pitch' | 'duration' {
  const p = keys.find((k) => k.startsWith('p:'));
  const d = keys.find((k) => k.startsWith('d:'));
  if (!p || !d) return p ? 'pitch' : 'duration';
  return missRate(stats.items[d]) > missRate(stats.items[p]) ? 'duration' : 'pitch';
}

/** Tỉ lệ nhầm có làm trơn (ít dữ liệu → gần 0). */
export function missRate(s: ItemStat | undefined): number {
  return s ? s.missed / (s.asked + 2) : 0;
}

/** Trọng số khi chọn câu: phần hay nhầm được hỏi nhiều hơn (tối đa ×4). */
export function weightFor(stats: QuizStats): (key: string) => number {
  return (key) => 1 + 3 * missRate(stats.items[key]);
}

export interface WeakItem {
  key: string;
  /** Phần bé hay nhầm sang (khoá thống kê) — để dựng bài luyện riêng. */
  confusedKey: string | null;
  label: string;
  asked: number;
  missed: number;
  /** Phần bé hay chọn nhầm sang (nếu có). */
  confusedWith: string | null;
}

/**
 * Bài luyện riêng cho phần bé hay nhầm: chỉ phần đó + phần hay nhầm sang (hoặc nốt / trường độ liền kề), cao độ cùng khoá
 * hoặc trường độ, 5 câu, gợi ý hỗ trợ tối đa. Không lưu thành cài đặt.
 */
export function practiceFor(w: Pick<WeakItem, 'key' | 'confusedKey'>, base: NoteQuizSettings): NoteQuizSettings {
  const [kind, a, b] = w.key.split(':');
  const other = w.confusedKey?.split(':') ?? [];
  if (kind === 'p') {
    const l = b as Letter;
    const near = (other[2] as Letter | undefined) ?? LETTERS[(LETTERS.indexOf(l) + 1) % 7];
    return { ...base, mode: 'pitch', clef: a as QuizClef, letters: LETTERS.filter((x) => x === l || x === near), choices: 2, questions: 5, maxSupport: true, smartHints: true };
  }
  const d = a as QuizDuration;
  const i = QUIZ_DURATIONS.indexOf(d);
  const near = (other[1] as QuizDuration | undefined) ?? QUIZ_DURATIONS[i === 0 ? 1 : i - 1];
  return { ...base, mode: 'duration', durations: QUIZ_DURATIONS.filter((x) => x === d || x === near), choices: 2, questions: 5, maxSupport: true, smartHints: true };
}

/** "Đô · Khoá Sol", "nốt Tròn". */
export function itemLabel(key: string): string {
  const [kind, a, b] = key.split(':');
  if (kind === 'p') return `${SOLFEGE_NAME[b as Letter]} · ${CLEF_LABEL[a as QuizClef]}`;
  return `nốt ${DURATION_NAME[a as QuizDuration]}`;
}

/** Phần bé còn hay nhầm: hỏi ≥ 3 lần, nhầm ≥ 1/3 số lần. Nhầm nhiều nhất trước. */
export function weakItems(stats: QuizStats, limit = 4): WeakItem[] {
  return Object.entries(stats.items)
    .filter(([, s]) => s.asked >= 3 && s.missed / s.asked >= 1 / 3)
    .sort((a, b) => b[1].missed / b[1].asked - a[1].missed / a[1].asked || b[1].asked - a[1].asked)
    .slice(0, limit)
    .map(([key, s]) => {
      const top = Object.entries(stats.confusions)
        .filter(([k]) => k.startsWith(`${key}>`))
        .sort((x, y) => y[1] - x[1])[0];
      return { key, label: itemLabel(key), asked: s.asked, missed: s.missed, confusedKey: top ? top[0].split('>')[1] : null, confusedWith: top ? itemLabel(top[0].split('>')[1]) : null };
    });
}
