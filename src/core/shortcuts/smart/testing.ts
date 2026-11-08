/**
 * Dữ liệu dựng sẵn cho test Lối tắt thông minh: một hồ sơ, giờ cố định (12:00 ngày 07/11/2026 giờ Việt Nam).
 * Chỉ dùng trong test.
 */
import { CURRICULUM } from '../../curriculum/content/curriculum';
import { emptyRecord, type LessonRecord } from '../../curriculum/progress';
import { findLesson } from '../../curriculum/unlock';
import { lessonManager } from '../../lessons/LessonManager';
import type { LearnerProfile } from '../../profile/LearnerProfile';
import type { PracticeSession } from '../../storage/ProgressStorage';
import type { SmartInput } from './context';
import type { SmartPolicy } from './engine';
import { DEFAULT_SMART_SETTINGS } from './settings';
import { findGuidedLesson } from '../../curriculum/content/guided';

/** Giờ Việt Nam: `getTimezoneOffset()` = −420. */
export const TZ = -420;
export const NOW = Date.UTC(2026, 10, 7, 5, 0, 0); // 12:00 giờ VN
export const DAY = 86_400_000;

export const PROFILE: LearnerProfile = { id: 'p1', name: 'Bé An', age: 8, avatar: '🐱', experience: 'new', goals: [], dailyMinutes: 15, createdAt: 0 };

export function smartInput(over: Partial<SmartInput> = {}): SmartInput {
  return {
    profileId: 'p1',
    profile: null,
    now: NOW,
    tzOffsetMin: TZ,
    records: {},
    sessions: [],
    library: lessonManager.all(),
    usage: [],
    fiveFinger: null,
    gameTimeRemainingMs: 10 * 60_000,
    labelStyle: 'solfege',
    ...over,
  };
}

export function policy(over: Partial<SmartPolicy> = {}): SmartPolicy {
  return { settings: { ...DEFAULT_SMART_SETTINGS, types: { ...DEFAULT_SMART_SETTINGS.types } }, dismissed: {}, manualKeys: new Set(), ...over };
}

/** Bản ghi tiến độ buổi (giáo trình chính hoặc dẫn dắt) với các trường cần thử. */
export function record(lessonId: string, patch: Partial<LessonRecord> = {}): LessonRecord {
  const lesson = findLesson(CURRICULUM, lessonId) ?? findGuidedLesson(lessonId);
  if (!lesson) throw new Error(`Không có buổi ${lessonId}`);
  return { ...emptyRecord('p1', lesson), lastPracticedAt: NOW - DAY, ...patch };
}

/** Buổi đã đạt (đủ điều kiện tiên quyết cho buổi sau). */
export const passed = (lessonId: string, patch: Partial<LessonRecord> = {}) =>
  record(lessonId, { passed: true, passedAt: NOW - 2 * DAY, attempts: 1, bestScore: 90, lastScore: 90, activitiesDone: true, ...patch });

export function records(...list: LessonRecord[]): Record<string, LessonRecord> {
  return Object.fromEntries(list.map((r) => [r.lessonId, r]));
}

export function session(lessonId: string, patch: Partial<PracticeSession> = {}): PracticeSession {
  return {
    lessonId,
    profileId: 'p1',
    startedAt: NOW - DAY,
    durationMs: 60_000,
    correct: 10,
    wrong: 0,
    skipped: 0,
    completed: true,
    notesReached: 10,
    totalNotes: 10,
    ...patch,
  };
}
