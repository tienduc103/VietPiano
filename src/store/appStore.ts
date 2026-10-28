import { create } from 'zustand';
import {
  loadRecentLessons,
  progressStorage,
  pushRecentLesson,
  type LessonProgress,
  type PracticeSession,
} from '../core/storage/ProgressStorage';

export type LessonStage = 'review' | 'game';

export type Route =
  | { name: 'dashboard' }
  | { name: 'curriculum'; levelId?: string }
  /** `stage`: mở thẳng phần Luyện tập / Trò chơi sau buổi (nút trên thẻ buổi học). */
  | { name: 'lesson'; lessonId: string; stage?: LessonStage }
  | { name: 'library' }
  | { name: 'practice'; lessonId: string }
  | { name: 'settings' };

/** Màn hình mở đầu: Dashboard giáo trình; "?screen=library" / "?screen=curriculum" mở thẳng màn đó (đường tắt, dùng cả trong e2e). */
export function initialRoute(search = typeof location === 'undefined' ? '' : location.search): Route {
  const screen = new URLSearchParams(search).get('screen');
  if (screen === 'library') return { name: 'library' };
  if (screen === 'curriculum') return { name: 'curriculum' };
  return { name: 'dashboard' };
}

interface AppStore {
  route: Route;
  /** Màn trước đó (nút "Quay lại" ở Cài đặt). */
  previous: Route | null;
  progress: Record<string, LessonProgress>;
  /** Toàn bộ lịch sử phiên — để đánh giá và gợi ý bài theo từng hồ sơ người học. */
  sessions: PracticeSession[];
  recent: string[];
  navigate: (route: Route) => void;
  back: () => void;
  openLesson: (lessonId: string) => void;
  loadProgress: () => Promise<void>;
  recordSession: (session: PracticeSession) => Promise<void>;
  clearProgress: () => Promise<void>;
}

export const useApp = create<AppStore>((set, get) => ({
  route: initialRoute(),
  previous: null,
  progress: {},
  sessions: [],
  recent: loadRecentLessons(),
  navigate: (route) => set({ route, previous: get().route }),
  back: () => set({ route: get().previous ?? { name: 'dashboard' }, previous: null }),
  openLesson: (lessonId) => set({ route: { name: 'practice', lessonId }, previous: get().route, recent: pushRecentLesson(lessonId) }),
  loadProgress: async () => {
    try {
      const [progress, sessions] = await Promise.all([progressStorage.getAllProgress(), progressStorage.getAllSessions()]);
      set({ progress, sessions });
    } catch (err) {
      console.warn('[VietPiano] Không đọc được tiến độ', err);
    }
  },
  recordSession: async (session) => {
    try {
      const updated = await progressStorage.recordSession(session);
      set({ progress: { ...get().progress, [updated.lessonId]: updated }, sessions: [...get().sessions, session] });
    } catch (err) {
      console.warn('[VietPiano] Không lưu được phiên luyện tập', err);
    }
  },
  clearProgress: async () => {
    await progressStorage.clearAll();
    set({ progress: {}, sessions: [] });
  },
}));
