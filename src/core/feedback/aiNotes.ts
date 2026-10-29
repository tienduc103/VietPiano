/**
 * Lịch sử nhận xét AI (hàm thuần) — dùng cho buổi học giáo trình (`LessonRecord.aiNotes`)
 * và bài trong Thư viện (`storage/AiNoteStorage`).
 */

/** Chế độ chơi ở màn Luyện tập (bài thư viện); buổi giáo trình không ghi. */
export type AiNoteMode = 'wait' | 'count' | 'tempo';

/** Nhận xét của AI cục bộ (Ollama) cho một lần làm bài / buổi. */
export interface AiNote {
  /** Thời điểm xong bài — khoá của lần làm; "Viết lại" ghi đè nhận xét cùng `at`. */
  at: number;
  /** Điểm của lần đó (0–100). */
  score: number;
  text: string;
  model: string;
  mode?: AiNoteMode;
}

/** Số nhận xét AI giữ lại mỗi bài / buổi (mới nhất). */
export const MAX_AI_NOTES = 10;

/** Thêm nhận xét (cùng `at` → thay thế), cũ → mới, tối đa MAX_AI_NOTES. Nhận xét rỗng → trả nguyên danh sách. */
export function mergeAiNote(notes: readonly AiNote[], note: AiNote): AiNote[] {
  const text = note.text.trim();
  if (!text) return notes as AiNote[];
  return [...notes.filter((n) => n.at !== note.at), { ...note, text }].sort((a, b) => a.at - b.at).slice(-MAX_AI_NOTES);
}

export const AI_NOTE_MODE_LABEL: Record<AiNoteMode, string> = { wait: 'Chờ nốt', count: 'Đếm nốt', tempo: 'Theo nhịp' };

/** Đọc từ bộ nhớ ngoài: bỏ mục hỏng. */
export function sanitizeAiNotes(raw: unknown): AiNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (n): n is AiNote =>
        !!n && typeof n === 'object' && typeof n.at === 'number' && typeof n.score === 'number' && typeof n.text === 'string' && n.text.trim() !== '',
    )
    .map((n) => {
      const note: AiNote = { at: n.at, score: n.score, text: n.text, model: typeof n.model === 'string' ? n.model : '' };
      if (n.mode === 'wait' || n.mode === 'count' || n.mode === 'tempo') note.mode = n.mode;
      return note;
    })
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_AI_NOTES);
}
