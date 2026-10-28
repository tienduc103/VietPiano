import { create } from 'zustand';
import {
  addPracticeTime,
  applyExerciseScore,
  applyGameResult,
  applyLessonRun,
  applyReview,
  emptyRecord,
  GUEST_PROFILE,
  markActivitiesDone,
  type LessonRecord,
} from '../core/curriculum/progress';
import type { ExerciseScore } from '../core/curriculum/scoring';
import type { CurriculumLesson } from '../core/curriculum/types';
import { curriculumStorage } from '../core/storage/CurriculumStorage';

interface CurriculumStore {
  /** Người học đang xem tiến độ (id hồ sơ, hoặc "guest"). */
  profileKey: string;
  records: Record<string, LessonRecord>;
  loaded: boolean;
  /** Lỗi lưu gần nhất (hiện cho người dùng thay vì im lặng mất tiến độ). */
  saveError: string | null;
  load: (profileId: string | null) => Promise<void>;
  recordExercise: (lesson: CurriculumLesson, score: ExerciseScore, practiceMs: number) => Promise<LessonRecord>;
  recordRun: (lesson: CurriculumLesson, runScore: number) => Promise<void>;
  markIntroDone: (lesson: CurriculumLesson) => Promise<void>;
  addTime: (lesson: CurriculumLesson, ms: number) => Promise<void>;
  recordReview: (lesson: CurriculumLesson, practiceMs: number) => Promise<void>;
  recordGame: (lesson: CurriculumLesson, game: { score: number; stars: number }, practiceMs: number) => Promise<void>;
  clear: () => Promise<void>;
}

export const useCurriculum = create<CurriculumStore>((set, get) => {
  /** Cập nhật bản ghi trong bộ nhớ trước (UI phản hồi ngay), rồi ghi xuống IndexedDB. */
  const update = async (lesson: CurriculumLesson, fn: (rec: LessonRecord) => LessonRecord): Promise<LessonRecord> => {
    const { profileKey, records } = get();
    const prev = records[lesson.lessonId] ?? emptyRecord(profileKey, lesson);
    const next = fn(prev);
    if (next === prev) return prev;
    set({ records: { ...get().records, [lesson.lessonId]: next } });
    try {
      await curriculumStorage.put(next);
      if (get().saveError) set({ saveError: null });
    } catch (err) {
      console.warn('[VietPiano] Không lưu được tiến độ giáo trình', err);
      set({ saveError: 'Không lưu được tiến độ trên máy này (bộ nhớ trình duyệt bị chặn?). Kết quả chỉ giữ tới khi đóng app.' });
    }
    return next;
  };

  return {
    profileKey: GUEST_PROFILE,
    records: {},
    loaded: false,
    saveError: null,
    load: async (profileId) => {
      const profileKey = profileId ?? GUEST_PROFILE;
      set({ profileKey, records: get().profileKey === profileKey ? get().records : {}, loaded: false });
      try {
        const records = await curriculumStorage.getAll(profileKey);
        // Người dùng đã đổi hồ sơ trong lúc đọc → bỏ kết quả cũ.
        if (get().profileKey === profileKey) set({ records, loaded: true });
      } catch (err) {
        console.warn('[VietPiano] Không đọc được tiến độ giáo trình', err);
        set({ loaded: true });
      }
    },
    recordExercise: (lesson, score, practiceMs) => update(lesson, (r) => applyExerciseScore(r, lesson, score, practiceMs, Date.now())),
    recordRun: async (lesson, runScore) => {
      await update(lesson, (r) => applyLessonRun(r, runScore, Date.now()));
    },
    markIntroDone: async (lesson) => {
      await update(lesson, (r) => markActivitiesDone(r, lesson, Date.now()));
    },
    addTime: async (lesson, ms) => {
      await update(lesson, (r) => addPracticeTime(r, Math.round(ms), Date.now()));
    },
    recordReview: async (lesson, practiceMs) => {
      await update(lesson, (r) => applyReview(r, Math.round(practiceMs), Date.now()));
    },
    recordGame: async (lesson, game, practiceMs) => {
      await update(lesson, (r) => applyGameResult(r, game, Math.round(practiceMs), Date.now()));
    },
    clear: async () => {
      await curriculumStorage.clear(get().profileKey);
      set({ records: {} });
    },
  };
});
