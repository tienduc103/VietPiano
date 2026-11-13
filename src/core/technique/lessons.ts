/**
 * Tra bài DÙNG CHUNG cho Coach / Smart Practice: bài Thư viện + bài kỹ thuật ngón tay + bài bổ trợ (`rem:…`, sinh lại từ bài gốc).
 * Bài kỹ thuật KHÔNG nằm trong `LESSONS` (không hiện ở Thư viện bài / bài hát, không chịu quy tắc "bài khuông đôi phải có pedal").
 */
import type { CriterionKey } from '../coach/types';
import { LESSONS } from '../lessons/library';
import type { Lesson } from '../lessons/types';
import { parseRemedialId, remedialLessonFromId } from '../smartPractice/remedial';
import { exerciseById, exerciseForLesson, FINGER_EXERCISES } from './catalog';

/** Bài kỹ thuật tự biên soạn (không gồm bài áp dụng — đó là bài Thư viện). */
export const TECHNIQUE_LESSONS: readonly Lesson[] = FINGER_EXERCISES.filter((e) => !e.libraryLessonId).map((e) => e.lesson);

/** Bài gốc (Thư viện hoặc bài kỹ thuật) — không gồm bài bổ trợ. */
export function findSourceLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id) ?? exerciseById(id)?.lesson;
}

const remedialCache = new Map<string, Lesson | null>();

/** Mọi bài theo id, kể cả bài bổ trợ `rem:<bài gốc>:<a>-<b>`. */
export function resolveLesson(id: string): Lesson | undefined {
  const direct = findSourceLesson(id);
  if (direct) return direct;
  if (!parseRemedialId(id)) return undefined;
  if (!remedialCache.has(id)) remedialCache.set(id, remedialLessonFromId(id, findSourceLesson)?.lesson ?? null);
  return remedialCache.get(id) ?? undefined;
}

export function isRemedialId(id: string): boolean {
  return parseRemedialId(id) !== null;
}

export function isTechniqueLesson(id: string): boolean {
  return !!exerciseById(id) && !exerciseById(id)!.libraryLessonId;
}

/** Trọng số chấm riêng theo mục tiêu bài (bài kỹ thuật; bài bổ trợ của bài kỹ thuật dùng trọng số của bài gốc). */
export function scoringWeightsFor(lessonId: string): Partial<Record<CriterionKey, number>> | undefined {
  const p = parseRemedialId(lessonId);
  const ex = exerciseForLesson(p ? p.sourceId : lessonId);
  return ex?.scoringConfig.weights;
}
