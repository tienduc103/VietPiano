/**
 * Nốt bé đã học qua "Khám phá nốt nhạc" / "Làm quen từng nốt" (buổi nốt đã đạt) — trò chơi tự do dùng làm gợi ý mặc định:
 * Bóng bay (nốt cần tìm khi chưa chọn), Thu hoạch cà chua (độ khó). Chỉ là gợi ý ban đầu, người chơi đổi được trong cài đặt trò.
 */
import type { Letter } from '../balloonPop/notes';
import type { TomatoDifficulty } from '../tomatoHarvest/TomatoHarvestGame';
import { DISCOVERY_PREFIX } from './content/discovery';
import { SUPPLEMENT_NOTES } from './content/supplement';
import { isPassed, type Records } from './unlock';

/** Chưa đạt buổi nốt nào → bắt đầu với Đô – Rê – Mi. */
export const STARTER_LETTERS: readonly Letter[] = ['C', 'D', 'E'];

/** Các nốt (chữ cái, thứ tự Đô → Si) có buổi nốt đã đạt ở một trong hai giáo trình. */
export function learnedLetters(records: Records): Letter[] {
  return SUPPLEMENT_NOTES.filter((n) => {
    const id = n.letter.toLowerCase();
    return isPassed(records, `${DISCOVERY_PREFIX}${id}`) || isPassed(records, `sup-${id}`);
  }).map((n) => n.letter);
}

/** Nốt gợi ý cho trò "Tìm nốt" của Bóng bay. */
export function suggestedHuntLetters(records: Records): Letter[] {
  const learned = learnedLetters(records);
  return learned.length > 0 ? learned : [...STARTER_LETTERS];
}

/** Độ khó gợi ý cho Thu hoạch cà chua theo số nốt đã học (giống ngưỡng cũ: ≥ 7 khó, ≥ 4 vừa). */
export function suggestedTomatoDifficulty(records: Records): TomatoDifficulty {
  const n = learnedLetters(records).length;
  return n >= 7 ? 'hard' : n >= 4 ? 'medium' : 'easy';
}
