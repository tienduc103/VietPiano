/**
 * ProgressStorage — lưu tiến độ luyện tập trên thiết bị.
 *  - IndexedDB: lịch sử phiên luyện tập + tổng hợp theo bài (dữ liệu tăng dần theo thời gian).
 *  - Fallback bộ nhớ tạm nếu IndexedDB không khả dụng (vd Safari private mode cũ).
 */

export interface PracticeSession {
  id?: number;
  lessonId: string;
  /** Epoch ms lúc bắt đầu phiên. */
  startedAt: number;
  /** Thời gian luyện tập thực (không tính lúc ẩn app). */
  durationMs: number;
  correct: number;
  wrong: number;
  skipped: number;
  completed: boolean;
  notesReached: number;
  totalNotes: number;
}

export interface LessonProgress {
  lessonId: string;
  sessions: number;
  completions: number;
  /** Độ chính xác cao nhất trong các lần hoàn thành (0..1). */
  bestAccuracy: number;
  totalCorrect: number;
  totalWrong: number;
  totalPracticeMs: number;
  lastPracticedAt: number;
}

export interface ProgressTotals {
  sessions: number;
  totalCorrect: number;
  totalWrong: number;
  totalPracticeMs: number;
  lessonsCompleted: number;
}

export interface ProgressStorage {
  recordSession(session: PracticeSession): Promise<LessonProgress>;
  getAllProgress(): Promise<Record<string, LessonProgress>>;
  getRecentSessions(limit: number): Promise<PracticeSession[]>;
  clearAll(): Promise<void>;
}

export function emptyProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    sessions: 0,
    completions: 0,
    bestAccuracy: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalPracticeMs: 0,
    lastPracticedAt: 0,
  };
}

/** Gộp một phiên vào tổng hợp của bài (hàm thuần, dễ kiểm thử). */
export function applySession(prev: LessonProgress, s: PracticeSession): LessonProgress {
  const attempts = s.correct + s.wrong;
  const accuracy = attempts ? s.correct / attempts : 0;
  return {
    lessonId: prev.lessonId,
    sessions: prev.sessions + 1,
    completions: prev.completions + (s.completed ? 1 : 0),
    bestAccuracy: s.completed ? Math.max(prev.bestAccuracy, accuracy) : prev.bestAccuracy,
    totalCorrect: prev.totalCorrect + s.correct,
    totalWrong: prev.totalWrong + s.wrong,
    totalPracticeMs: prev.totalPracticeMs + s.durationMs,
    lastPracticedAt: Math.max(prev.lastPracticedAt, s.startedAt + s.durationMs),
  };
}

export function computeTotals(progress: Record<string, LessonProgress>): ProgressTotals {
  const list = Object.values(progress);
  return {
    sessions: list.reduce((a, p) => a + p.sessions, 0),
    totalCorrect: list.reduce((a, p) => a + p.totalCorrect, 0),
    totalWrong: list.reduce((a, p) => a + p.totalWrong, 0),
    totalPracticeMs: list.reduce((a, p) => a + p.totalPracticeMs, 0),
    lessonsCompleted: list.filter((p) => p.completions > 0).length,
  };
}

const DB_NAME = 'vietpiano';
const DB_VERSION = 1;
const STORE_PROGRESS = 'lessonProgress';
const STORE_SESSIONS = 'sessions';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IndexedDbProgressStorage implements ProgressStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS, { keyPath: 'lessonId' });
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
            store.createIndex('startedAt', 'startedAt');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error);
        };
      });
    }
    return this.dbPromise;
  }

  async recordSession(session: PracticeSession): Promise<LessonProgress> {
    const db = await this.db();
    const tx = db.transaction([STORE_PROGRESS, STORE_SESSIONS], 'readwrite');
    const progressStore = tx.objectStore(STORE_PROGRESS);
    const prev = ((await promisify(progressStore.get(session.lessonId))) as LessonProgress | undefined) ?? emptyProgress(session.lessonId);
    const next = applySession(prev, session);
    progressStore.put(next);
    const { id: _ignored, ...withoutId } = session;
    tx.objectStore(STORE_SESSIONS).add(withoutId);
    await txDone(tx);
    return next;
  }

  async getAllProgress(): Promise<Record<string, LessonProgress>> {
    const db = await this.db();
    const all = (await promisify(db.transaction(STORE_PROGRESS).objectStore(STORE_PROGRESS).getAll())) as LessonProgress[];
    return Object.fromEntries(all.map((p) => [p.lessonId, p]));
  }

  async getRecentSessions(limit: number): Promise<PracticeSession[]> {
    const db = await this.db();
    const index = db.transaction(STORE_SESSIONS).objectStore(STORE_SESSIONS).index('startedAt');
    return new Promise((resolve, reject) => {
      const out: PracticeSession[] = [];
      const req = index.openCursor(null, 'prev');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || out.length >= limit) return resolve(out);
        out.push(cursor.value as PracticeSession);
        cursor.continue();
      };
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORE_PROGRESS, STORE_SESSIONS], 'readwrite');
    tx.objectStore(STORE_PROGRESS).clear();
    tx.objectStore(STORE_SESSIONS).clear();
    await txDone(tx);
  }
}

export class MemoryProgressStorage implements ProgressStorage {
  private progress: Record<string, LessonProgress> = {};
  private sessions: PracticeSession[] = [];
  private nextId = 1;

  async recordSession(session: PracticeSession): Promise<LessonProgress> {
    const next = applySession(this.progress[session.lessonId] ?? emptyProgress(session.lessonId), session);
    this.progress[session.lessonId] = next;
    this.sessions.push({ ...session, id: this.nextId++ });
    return next;
  }

  async getAllProgress() {
    return { ...this.progress };
  }

  async getRecentSessions(limit: number) {
    return [...this.sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  async clearAll() {
    this.progress = {};
    this.sessions = [];
  }
}

/** Thử IndexedDB, nếu lỗi thì tự chuyển sang bộ nhớ tạm. */
class ResilientProgressStorage implements ProgressStorage {
  private impl: ProgressStorage;
  private readonly fallback = new MemoryProgressStorage();

  constructor() {
    this.impl = typeof indexedDB === 'undefined' ? this.fallback : new IndexedDbProgressStorage();
  }

  private async run<T>(fn: (s: ProgressStorage) => Promise<T>): Promise<T> {
    try {
      return await fn(this.impl);
    } catch (err) {
      if (this.impl === this.fallback) throw err;
      console.warn('[VietPiano] IndexedDB lỗi, chuyển sang lưu tạm trong bộ nhớ', err);
      this.impl = this.fallback;
      return fn(this.impl);
    }
  }

  recordSession(s: PracticeSession) {
    return this.run((impl) => impl.recordSession(s));
  }
  getAllProgress() {
    return this.run((impl) => impl.getAllProgress());
  }
  getRecentSessions(limit: number) {
    return this.run((impl) => impl.getRecentSessions(limit));
  }
  clearAll() {
    return this.run((impl) => impl.clearAll());
  }
}

export const progressStorage: ProgressStorage = new ResilientProgressStorage();

// ── Bài học gần đây: danh sách nhỏ → localStorage ──────────────────────────
const RECENT_KEY = 'vietpiano.recent.v1';
const RECENT_MAX = 5;

export function loadRecentLessons(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentLesson(lessonId: string): string[] {
  const next = [lessonId, ...loadRecentLessons().filter((id) => id !== lessonId)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // bỏ qua
  }
  return next;
}
