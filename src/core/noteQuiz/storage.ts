/**
 * Lưu "Đố bé nốt gì?" ở localStorage theo hồ sơ người học: cài đặt (mỗi bé một cấu hình), thống kê lỗi,
 * kỷ lục theo cấu hình (`ArcadeRecords`), lịch sử lượt gần đây. Lỗi đọc / ghi → bỏ qua, trò vẫn chạy.
 */
import { applyArcadeResult, sanitizeArcadeRecords, type ArcadeRecords } from '../games/arcade';
import { sanitizeQuizSettings, type NoteQuizSettings } from './config';
import { emptyStats, type QuizStats } from './tracker';

export const NOTE_QUIZ_STORAGE_KEY = 'vietpiano.note-quiz.v1';
const MAX_HISTORY = 30;

export interface QuizRoundLog {
  at: number;
  key: string;
  total: number;
  firstTry: number;
  score: number;
  stars: number;
  /** Câu cần cô gợi ý / câu cô phải chỉ đáp án. */
  helped?: number;
  revealed?: number;
}

export interface NoteQuizProfileData {
  settings: NoteQuizSettings;
  stats: QuizStats;
  records: ArcadeRecords;
  history: QuizRoundLog[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNeg = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function sanitizeStats(raw: unknown): QuizStats {
  const out = emptyStats();
  if (!isObj(raw)) return out;
  if (isObj(raw.items)) {
    for (const [k, v] of Object.entries(raw.items)) {
      if (!/^(p:(treble|bass|alto|tenor):[A-G]|d:(w|h|q|8|16))$/.test(k) || !isObj(v)) continue;
      const asked = nonNeg(v.asked);
      out.items[k] = { asked, missed: Math.min(asked, nonNeg(v.missed)), streak: Math.min(asked, nonNeg(v.streak)), helped: Math.min(asked, nonNeg(v.helped)) };
    }
  }
  if (isObj(raw.totals)) for (const k of Object.keys(out.totals) as (keyof QuizStats['totals'])[]) out.totals[k] = nonNeg(raw.totals[k]);
  if (isObj(raw.confusions)) for (const [k, v] of Object.entries(raw.confusions)) if (k.includes('>') && nonNeg(v) > 0) out.confusions[k] = nonNeg(v);
  return out;
}

export function sanitizeProfileData(raw: unknown): NoteQuizProfileData {
  const r = isObj(raw) ? raw : {};
  const history = Array.isArray(r.history)
    ? r.history
        .filter(isObj)
        .map((h) => ({ at: nonNeg(h.at), key: String(h.key ?? ''), total: nonNeg(h.total), firstTry: nonNeg(h.firstTry), score: nonNeg(h.score), stars: Math.min(3, nonNeg(h.stars)), helped: nonNeg(h.helped), revealed: nonNeg(h.revealed) }))
        .slice(-MAX_HISTORY)
    : [];
  return { settings: sanitizeQuizSettings(r.settings), stats: sanitizeStats(r.stats), records: sanitizeArcadeRecords(r.records), history };
}

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(NOTE_QUIZ_STORAGE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

export function loadQuizData(profileKey: string): NoteQuizProfileData {
  return sanitizeProfileData(readAll()[profileKey]);
}

export function saveQuizData(profileKey: string, data: NoteQuizProfileData): void {
  try {
    localStorage.setItem(NOTE_QUIZ_STORAGE_KEY, JSON.stringify({ ...readAll(), [profileKey]: data }));
  } catch {
    // chỉ mất phần lưu
  }
}

/** Ghi kết quả một lượt (kỷ lục + lịch sử). */
export function withRoundResult(data: NoteQuizProfileData, log: QuizRoundLog): NoteQuizProfileData {
  return {
    ...data,
    records: applyArcadeResult(data.records, log.key, { score: log.score, stars: log.stars }),
    history: [...data.history, log].slice(-MAX_HISTORY),
  };
}
