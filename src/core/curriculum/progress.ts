/**
 * Tiến độ giáo trình của một người học cho một buổi (hàm thuần; lưu ở storage/CurriculumStorage).
 * Mỗi kết quả bài tập được ghi NGAY khi làm xong → đóng app giữa buổi không mất tiến độ;
 * trạng thái đạt của buổi suy từ điểm cao nhất từng bài tập.
 */
import { scoreLesson, type ExerciseScore } from './scoring';
import type { CurriculumLesson } from './types';
import { mergeAiNote, sanitizeAiNotes, type AiNote } from '../feedback/aiNotes';

export { MAX_AI_NOTES, type AiNote } from '../feedback/aiNotes';

export interface ExerciseRecord {
  attempts: number;
  bestScore: number;
  lastScore: number;
  /** Đã từng đạt. */
  passed: boolean;
}

export interface LessonRecord {
  /** `${profileKey}|${lessonId}` */
  key: string;
  profileKey: string;
  lessonId: string;
  contentVersion: number;
  /** Số lần làm hết các bài tập của buổi (tới màn kết quả). */
  attempts: number;
  /** Điểm buổi cao nhất / gần nhất (lần làm hết các bài tập). */
  bestScore: number;
  lastScore: number | null;
  passed: boolean;
  passedAt: number | null;
  /** Đã xem hết phần giới thiệu. */
  activitiesDone: boolean;
  practiceMs: number;
  lastPracticedAt: number;
  exercises: Record<string, ExerciseRecord>;
  /** Lỗi hay gặp: khoá như "C4→D4" (cần C4, đánh D4) → số lần. */
  mistakes: Record<string, number>;
  /** Số lần làm xong phần Luyện tập sau buổi (không ảnh hưởng điểm / trạng thái đạt). */
  reviewCount: number;
  /** Trò chơi sau buổi: số ván, điểm và số sao cao nhất. */
  gamePlays: number;
  gameBestScore: number;
  gameBestStars: number;
  /** Theo từng trò (khoá = loại trò, vd "note-catch") — điểm các trò không so sánh với nhau được. */
  games: Record<string, GameRecord>;
  /** Nhận xét AI các lần làm buổi, cũ → mới, tối đa MAX_AI_NOTES. */
  aiNotes: AiNote[];
}

export interface GameRecord {
  plays: number;
  bestScore: number;
  bestStars: number;
}

/** Người học chưa có hồ sơ dùng chung khoá này. */
export const GUEST_PROFILE = 'guest';

export function recordKey(profileKey: string, lessonId: string): string {
  return `${profileKey}|${lessonId}`;
}

export function emptyRecord(profileKey: string, lesson: Pick<CurriculumLesson, 'lessonId' | 'contentVersion'>): LessonRecord {
  return {
    key: recordKey(profileKey, lesson.lessonId),
    profileKey,
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    attempts: 0,
    bestScore: 0,
    lastScore: null,
    passed: false,
    passedAt: null,
    activitiesDone: false,
    practiceMs: 0,
    lastPracticedAt: 0,
    exercises: {},
    mistakes: {},
    reviewCount: 0,
    gamePlays: 0,
    gameBestScore: 0,
    gameBestStars: 0,
    games: {},
    aiNotes: [],
  };
}

function withPass(rec: LessonRecord, lesson: CurriculumLesson, now: number): LessonRecord {
  const best = Object.fromEntries(Object.entries(rec.exercises).map(([id, e]) => [id, { score: e.bestScore, passed: e.passed }]));
  const { passed } = scoreLesson(lesson, best, rec.activitiesDone);
  // Đã đạt thì giữ nguyên trạng thái đạt (luyện lại điểm thấp không làm mất).
  if (rec.passed || !passed) return rec;
  return { ...rec, passed: true, passedAt: now };
}

/** Ghi kết quả một lần làm bài tập. */
export function applyExerciseScore(rec: LessonRecord, lesson: CurriculumLesson, s: ExerciseScore, practiceMs: number, now: number): LessonRecord {
  const prev = rec.exercises[s.exerciseId];
  const exercise: ExerciseRecord = {
    attempts: (prev?.attempts ?? 0) + 1,
    bestScore: Math.max(prev?.bestScore ?? 0, s.score),
    lastScore: s.score,
    passed: (prev?.passed ?? false) || s.passed,
  };
  const mistakes = { ...rec.mistakes };
  for (const m of s.mistakes) mistakes[m] = (mistakes[m] ?? 0) + 1;
  const next: LessonRecord = {
    ...rec,
    contentVersion: lesson.contentVersion,
    exercises: { ...rec.exercises, [s.exerciseId]: exercise },
    mistakes,
    practiceMs: rec.practiceMs + Math.max(0, practiceMs),
    lastPracticedAt: now,
  };
  return withPass(next, lesson, now);
}

export function markActivitiesDone(rec: LessonRecord, lesson: CurriculumLesson, now: number): LessonRecord {
  if (rec.activitiesDone) return rec;
  return withPass({ ...rec, activitiesDone: true, lastPracticedAt: now }, lesson, now);
}

/** Làm hết các bài tập của buổi (điểm của chính lần này). */
export function applyLessonRun(rec: LessonRecord, runScore: number, now: number): LessonRecord {
  return { ...rec, attempts: rec.attempts + 1, lastScore: runScore, bestScore: Math.max(rec.bestScore, runScore), lastPracticedAt: now };
}

export function addPracticeTime(rec: LessonRecord, ms: number, now: number): LessonRecord {
  if (ms <= 0) return rec;
  return { ...rec, practiceMs: rec.practiceMs + ms, lastPracticedAt: now };
}

/** Làm xong phần Luyện tập sau buổi. */
export function applyReview(rec: LessonRecord, practiceMs: number, now: number): LessonRecord {
  return { ...rec, reviewCount: rec.reviewCount + 1, practiceMs: rec.practiceMs + Math.max(0, practiceMs), lastPracticedAt: now };
}

/** Chơi xong một ván trò chơi sau buổi. */
export function applyGameResult(rec: LessonRecord, game: { kind: string; score: number; stars: number }, practiceMs: number, now: number): LessonRecord {
  const prev = rec.games[game.kind];
  return {
    ...rec,
    games: {
      ...rec.games,
      [game.kind]: { plays: (prev?.plays ?? 0) + 1, bestScore: Math.max(prev?.bestScore ?? 0, game.score), bestStars: Math.max(prev?.bestStars ?? 0, game.stars) },
    },
    gamePlays: rec.gamePlays + 1,
    gameBestScore: Math.max(rec.gameBestScore, game.score),
    gameBestStars: Math.max(rec.gameBestStars, game.stars),
    practiceMs: rec.practiceMs + Math.max(0, practiceMs),
    lastPracticedAt: now,
  };
}

/** Lưu nhận xét AI của một lần làm buổi (cùng `at` → thay thế, ví dụ khi bấm "Viết lại"). */
export function applyAiNote(rec: LessonRecord, note: AiNote): LessonRecord {
  const aiNotes = mergeAiNote(rec.aiNotes, note);
  return aiNotes === rec.aiNotes ? rec : { ...rec, aiNotes };
}

/** Lỗi hay gặp nhất, nhiều nhất trước. */
export function topMistakes(rec: Pick<LessonRecord, 'mistakes'> | undefined, limit = 5): { key: string; count: number }[] {
  if (!rec) return [];
  return Object.entries(rec.mistakes)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** Đọc bản ghi từ bộ nhớ ngoài: bỏ bản ghi hỏng thay vì làm hỏng cả màn hình. */
export function sanitizeRecord(raw: unknown): LessonRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LessonRecord>;
  if (typeof r.profileKey !== 'string' || typeof r.lessonId !== 'string') return null;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const exercises: Record<string, ExerciseRecord> = {};
  for (const [id, e] of Object.entries(r.exercises ?? {})) {
    if (!e || typeof e !== 'object') continue;
    exercises[id] = { attempts: num(e.attempts), bestScore: num(e.bestScore), lastScore: num(e.lastScore), passed: e.passed === true };
  }
  const mistakes: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.mistakes ?? {})) if (typeof v === 'number' && v > 0) mistakes[k] = v;
  const games: Record<string, GameRecord> = {};
  for (const [k, g] of Object.entries(r.games ?? {})) {
    if (g && typeof g === 'object') games[k] = { plays: num(g.plays), bestScore: num(g.bestScore), bestStars: Math.min(3, num(g.bestStars)) };
  }
  return {
    key: recordKey(r.profileKey, r.lessonId),
    profileKey: r.profileKey,
    lessonId: r.lessonId,
    contentVersion: num(r.contentVersion, 1),
    attempts: num(r.attempts),
    bestScore: num(r.bestScore),
    lastScore: typeof r.lastScore === 'number' ? r.lastScore : null,
    passed: r.passed === true,
    passedAt: typeof r.passedAt === 'number' ? r.passedAt : null,
    activitiesDone: r.activitiesDone === true,
    practiceMs: num(r.practiceMs),
    lastPracticedAt: num(r.lastPracticedAt),
    exercises,
    mistakes,
    reviewCount: num(r.reviewCount),
    gamePlays: num(r.gamePlays),
    gameBestScore: num(r.gameBestScore),
    gameBestStars: Math.min(3, num(r.gameBestStars)),
    games,
    aiNotes: sanitizeAiNotes(r.aiNotes),
  };
}

