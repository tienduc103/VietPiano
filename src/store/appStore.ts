import { create } from 'zustand';
import {
  loadRecentLessons,
  progressStorage,
  pushRecentLesson,
  type LessonProgress,
  type PracticeSession,
} from '../core/storage/ProgressStorage';

export type Route = { name: 'library' } | { name: 'practice'; lessonId: string } | { name: 'settings' };

interface AppStore {
  route: Route;
  progress: Record<string, LessonProgress>;
  recent: string[];
  navigate: (route: Route) => void;
  openLesson: (lessonId: string) => void;
  loadProgress: () => Promise<void>;
  recordSession: (session: PracticeSession) => Promise<void>;
  clearProgress: () => Promise<void>;
}

export const useApp = create<AppStore>((set, get) => ({
  route: { name: 'library' },
  progress: {},
  recent: loadRecentLessons(),
  navigate: (route) => set({ route }),
  openLesson: (lessonId) => set({ route: { name: 'practice', lessonId }, recent: pushRecentLesson(lessonId) }),
  loadProgress: async () => {
    try {
      set({ progress: await progressStorage.getAllProgress() });
    } catch (err) {
      console.warn('[VietPiano] Không đọc được tiến độ', err);
    }
  },
  recordSession: async (session) => {
    try {
      const updated = await progressStorage.recordSession(session);
      set({ progress: { ...get().progress, [updated.lessonId]: updated } });
    } catch (err) {
      console.warn('[VietPiano] Không lưu được phiên luyện tập', err);
    }
  },
  clearProgress: async () => {
    await progressStorage.clearAll();
    set({ progress: {} });
  },
}));
