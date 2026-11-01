/**
 * Phép so sánh trường độ cho hình minh hoạ giáo trình ("2 nốt trắng = 1 nốt tròn", "1 nốt tròn = 4 phách").
 * Logic thuần: tên + số phách từng hình nốt; `validate` dùng `equationHolds` để không soạn nhầm phép so sánh.
 */
export type NoteValue = 'w' | 'h' | 'q' | '8' | '16';

export const NOTE_VALUE_BEATS: Record<NoteValue, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };
export const NOTE_VALUE_NAME: Record<NoteValue, string> = { w: 'tròn', h: 'trắng', q: 'đen', '8': 'móc đơn', '16': 'móc đôi' };

/** Một vế: `count` hình nốt `value`, hoặc `beats` phách (không có `value`). */
export type NoteValueTerm = { count: number; value: NoteValue } | { beats: number };
export interface NoteValueEquation {
  left: NoteValueTerm;
  right: NoteValueTerm;
}

export const termBeats = (t: NoteValueTerm): number => ('beats' in t ? t.beats : t.count * NOTE_VALUE_BEATS[t.value]);
export const termLabel = (t: NoteValueTerm): string => ('beats' in t ? `${t.beats} phách` : `${t.count} nốt ${NOTE_VALUE_NAME[t.value]}`);
export const equationLabel = (e: NoteValueEquation): string => `${termLabel(e.left)} = ${termLabel(e.right)}`;
export const equationHolds = (e: NoteValueEquation): boolean => termBeats(e.left) === termBeats(e.right);
