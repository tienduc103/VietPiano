/**
 * CoachStorage — lưu dữ liệu AI Piano Coach trên máy (IndexedDB riêng "vietpiano-coach", không nâng phiên bản DB cũ).
 *
 *  sessions       metadata phiên (nhẹ, để liệt kê lịch sử)       index profileKey, profileLesson, status
 *  sessionEvents  log gốc của phiên (ghi cùng giao dịch)
 *  results        ScoringResult theo (phiên, phiên bản engine, chế độ) — chấm lại bằng bản mới KHÔNG xoá bản cũ
 *  feedback       nhận xét (AI cục bộ / theo quy tắc)
 *  plans          kế hoạch luyện sửa lỗi + tiến độ
 *
 * Mọi bản ghi có `profileKey` → lịch sử của từng thành viên trong gia đình tách riêng. Xoá chỉ khi người dùng bấm
 * (một phiên, hoặc toàn bộ lịch sử của một hồ sơ). IndexedDB lỗi (Safari riêng tư cũ…) → bộ nhớ tạm trong phiên.
 */
import type { AIFeedback, PerformanceEvent, PerformanceSession, PracticePlan, ProfileKey, RecordedSession, ScoringResult, SessionStatus } from '../types';

export const COACH_DB_NAME = 'vietpiano-coach';
export const COACH_DB_VERSION = 1;

const S_SESSIONS = 'sessions';
const S_EVENTS = 'sessionEvents';
const S_RESULTS = 'results';
const S_FEEDBACK = 'feedback';
const S_PLANS = 'plans';
const ALL_STORES = [S_SESSIONS, S_EVENTS, S_RESULTS, S_FEEDBACK, S_PLANS];

export interface CoachExport {
  format: 'vietpiano-coach-export';
  /** 2: thêm log gốc từng phiên (`events`) → chấm lại được bằng phiên bản engine mới / gửi kèm khi báo lỗi chấm. */
  version: 2;
  exportedAt: number;
  profileKey: ProfileKey;
  sessions: PerformanceSession[];
  /** Log gốc theo id phiên (mốc thời gian nguyên bản, không làm tròn). */
  events: Record<string, PerformanceEvent[]>;
  results: ScoringResult[];
  feedback: AIFeedback[];
  plans: PracticePlan[];
}

/** Log gốc của các phiên (cho file xuất). */
async function eventsOf(storage: Pick<CoachStorage, 'getRecorded'>, sessions: readonly PerformanceSession[]): Promise<Record<string, PerformanceEvent[]>> {
  const out: Record<string, PerformanceEvent[]> = {};
  for (const s of sessions) out[s.id] = (await storage.getRecorded(s.id))?.events ?? [];
  return out;
}

export interface CoachStorage {
  /** Ghi (đè) metadata + log của một phiên trong cùng một giao dịch — dùng cho lưu nháp và lưu cuối. */
  saveSession(rec: RecordedSession): Promise<void>;
  getSession(id: string): Promise<PerformanceSession | null>;
  getRecorded(id: string): Promise<RecordedSession | null>;
  /** Phiên của một hồ sơ (một bài nếu có `lessonId`), cũ → mới. */
  listSessions(profileKey: ProfileKey, lessonId?: string): Promise<PerformanceSession[]>;
  /** Phiên còn dở dang (đang ghi / tạm dừng) — app tắt giữa chừng. */
  listOpenSessions(profileKey: ProfileKey): Promise<PerformanceSession[]>;
  setSessionStatus(id: string, status: SessionStatus): Promise<void>;
  saveResult(result: ScoringResult): Promise<void>;
  listResults(profileKey: ProfileKey, lessonId?: string): Promise<ScoringResult[]>;
  resultsForSession(sessionId: string): Promise<ScoringResult[]>;
  saveFeedback(feedback: AIFeedback): Promise<void>;
  feedbackForResult(resultId: string): Promise<AIFeedback[]>;
  savePlan(plan: PracticePlan): Promise<void>;
  listPlans(profileKey: ProfileKey, lessonId?: string): Promise<PracticePlan[]>;
  /** Xoá một phiên kèm log, kết quả, nhận xét của nó. */
  deleteSession(id: string): Promise<void>;
  /** Xoá toàn bộ dữ liệu Coach của một hồ sơ. */
  deleteProfile(profileKey: ProfileKey): Promise<void>;
  exportProfile(profileKey: ProfileKey, now?: number): Promise<CoachExport>;
}

/** Migration theo phiên bản: chỉ THÊM store / index; dữ liệu cũ đọc qua sanitize, không ghi đè lúc nâng cấp. */
export function upgradeCoachDb(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const sessions = db.createObjectStore(S_SESSIONS, { keyPath: 'id' });
    sessions.createIndex('profileKey', 'profileKey');
    sessions.createIndex('profileLesson', ['profileKey', 'lessonId']);
    sessions.createIndex('status', 'status');
    db.createObjectStore(S_EVENTS, { keyPath: 'sessionId' });
    const results = db.createObjectStore(S_RESULTS, { keyPath: 'id' });
    results.createIndex('sessionId', 'sessionId');
    results.createIndex('profileKey', 'profileKey');
    results.createIndex('profileLesson', ['profileKey', 'lessonId']);
    const feedback = db.createObjectStore(S_FEEDBACK, { keyPath: 'id' });
    feedback.createIndex('resultId', 'resultId');
    feedback.createIndex('profileKey', 'profileKey');
    feedback.createIndex('sessionId', 'sessionId');
    const plans = db.createObjectStore(S_PLANS, { keyPath: 'id' });
    plans.createIndex('profileKey', 'profileKey');
    plans.createIndex('profileLesson', ['profileKey', 'lessonId']);
  }
}

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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Bản ghi đọc từ bộ nhớ ngoài: bỏ mục hỏng (không ném lỗi). */
export function sanitizeSession(raw: unknown): PerformanceSession | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.profileKey !== 'string' || typeof raw.lessonId !== 'string') return null;
  if (typeof raw.startedAt !== 'number' || typeof raw.status !== 'string' || !isObj(raw.input)) return null;
  return raw as unknown as PerformanceSession;
}

function sanitizeEvents(raw: unknown): PerformanceEvent[] {
  if (!isObj(raw) || !Array.isArray(raw.events)) return [];
  return (raw.events as unknown[]).filter((e): e is PerformanceEvent => isObj(e) && typeof e.k === 'string' && typeof e.t === 'number');
}

const byStart = (a: PerformanceSession, b: PerformanceSession) => a.startedAt - b.startedAt;
const byCreated = <T extends { createdAt: number }>(a: T, b: T) => a.createdAt - b.createdAt;
const lessonRange = (profileKey: string, lessonId?: string) => (lessonId === undefined ? null : IDBKeyRange.only([profileKey, lessonId]));

export class IndexedDbCoachStorage implements CoachStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(COACH_DB_NAME, COACH_DB_VERSION);
        req.onupgradeneeded = (e) => upgradeCoachDb(req.result, e.oldVersion);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error);
        };
      });
    }
    return this.dbPromise;
  }

  private async getAllBy<T>(store: string, index: string, key: IDBValidKey | IDBKeyRange): Promise<T[]> {
    const db = await this.db();
    return (await promisify(db.transaction(store).objectStore(store).index(index).getAll(key))) as T[];
  }

  async saveSession(rec: RecordedSession): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([S_SESSIONS, S_EVENTS], 'readwrite');
    tx.objectStore(S_SESSIONS).put(structuredClone(rec.session));
    tx.objectStore(S_EVENTS).put({ sessionId: rec.session.id, events: structuredClone(rec.events) });
    await txDone(tx);
  }

  async getSession(id: string): Promise<PerformanceSession | null> {
    const db = await this.db();
    return sanitizeSession(await promisify(db.transaction(S_SESSIONS).objectStore(S_SESSIONS).get(id)));
  }

  async getRecorded(id: string): Promise<RecordedSession | null> {
    const db = await this.db();
    const tx = db.transaction([S_SESSIONS, S_EVENTS]);
    const [s, ev] = await Promise.all([promisify(tx.objectStore(S_SESSIONS).get(id)), promisify(tx.objectStore(S_EVENTS).get(id))]);
    const session = sanitizeSession(s);
    return session ? { session, events: sanitizeEvents(ev) } : null;
  }

  async listSessions(profileKey: ProfileKey, lessonId?: string): Promise<PerformanceSession[]> {
    const raw = lessonId === undefined ? await this.getAllBy<unknown>(S_SESSIONS, 'profileKey', profileKey) : await this.getAllBy<unknown>(S_SESSIONS, 'profileLesson', lessonRange(profileKey, lessonId)!);
    return raw.map(sanitizeSession).filter((s): s is PerformanceSession => s !== null).sort(byStart);
  }

  async listOpenSessions(profileKey: ProfileKey): Promise<PerformanceSession[]> {
    return (await this.listSessions(profileKey)).filter((s) => s.status === 'recording' || s.status === 'paused');
  }

  async setSessionStatus(id: string, status: SessionStatus): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(S_SESSIONS, 'readwrite');
    const store = tx.objectStore(S_SESSIONS);
    const s = sanitizeSession(await promisify(store.get(id)));
    if (s) store.put({ ...s, status, updatedAt: Date.now() });
    await txDone(tx);
  }

  async saveResult(result: ScoringResult): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(S_RESULTS, 'readwrite');
    tx.objectStore(S_RESULTS).put(structuredClone(result));
    await txDone(tx);
  }

  async listResults(profileKey: ProfileKey, lessonId?: string): Promise<ScoringResult[]> {
    const raw = lessonId === undefined ? await this.getAllBy<ScoringResult>(S_RESULTS, 'profileKey', profileKey) : await this.getAllBy<ScoringResult>(S_RESULTS, 'profileLesson', lessonRange(profileKey, lessonId)!);
    return raw.filter((r) => isObj(r) && typeof r.total === 'number').sort(byCreated);
  }

  async resultsForSession(sessionId: string): Promise<ScoringResult[]> {
    return (await this.getAllBy<ScoringResult>(S_RESULTS, 'sessionId', sessionId)).sort(byCreated);
  }

  async saveFeedback(feedback: AIFeedback): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(S_FEEDBACK, 'readwrite');
    tx.objectStore(S_FEEDBACK).put(structuredClone(feedback));
    await txDone(tx);
  }

  async feedbackForResult(resultId: string): Promise<AIFeedback[]> {
    return (await this.getAllBy<AIFeedback>(S_FEEDBACK, 'resultId', resultId)).sort(byCreated);
  }

  async savePlan(plan: PracticePlan): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(S_PLANS, 'readwrite');
    tx.objectStore(S_PLANS).put(structuredClone(plan));
    await txDone(tx);
  }

  async listPlans(profileKey: ProfileKey, lessonId?: string): Promise<PracticePlan[]> {
    const raw = lessonId === undefined ? await this.getAllBy<PracticePlan>(S_PLANS, 'profileKey', profileKey) : await this.getAllBy<PracticePlan>(S_PLANS, 'profileLesson', lessonRange(profileKey, lessonId)!);
    return raw.sort(byCreated);
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(ALL_STORES, 'readwrite');
    tx.objectStore(S_SESSIONS).delete(id);
    tx.objectStore(S_EVENTS).delete(id);
    const results = tx.objectStore(S_RESULTS);
    for (const key of await promisify(results.index('sessionId').getAllKeys(id))) results.delete(key);
    const feedback = tx.objectStore(S_FEEDBACK);
    for (const key of await promisify(feedback.index('sessionId').getAllKeys(id))) feedback.delete(key);
    await txDone(tx);
  }

  async deleteProfile(profileKey: ProfileKey): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(ALL_STORES, 'readwrite');
    const sessions = tx.objectStore(S_SESSIONS);
    const ids = (await promisify(sessions.index('profileKey').getAllKeys(profileKey))) as string[];
    for (const id of ids) {
      sessions.delete(id);
      tx.objectStore(S_EVENTS).delete(id);
    }
    for (const name of [S_RESULTS, S_FEEDBACK, S_PLANS]) {
      const store = tx.objectStore(name);
      for (const key of await promisify(store.index('profileKey').getAllKeys(profileKey))) store.delete(key);
    }
    await txDone(tx);
  }

  async exportProfile(profileKey: ProfileKey, now = Date.now()): Promise<CoachExport> {
    const [sessions, results, plans] = await Promise.all([this.listSessions(profileKey), this.listResults(profileKey), this.listPlans(profileKey)]);
    const feedback = (await this.getAllBy<AIFeedback>(S_FEEDBACK, 'profileKey', profileKey)).sort(byCreated);
    return { format: 'vietpiano-coach-export', version: 2, exportedAt: now, profileKey, sessions, events: await eventsOf(this, sessions), results, feedback, plans };
  }
}

/** Cùng hành vi, giữ trong bộ nhớ (test, hoặc khi IndexedDB không dùng được). */
export class MemoryCoachStorage implements CoachStorage {
  private sessions = new Map<string, PerformanceSession>();
  private events = new Map<string, PerformanceEvent[]>();
  private results = new Map<string, ScoringResult>();
  private feedback = new Map<string, AIFeedback>();
  private plans = new Map<string, PracticePlan>();

  async saveSession(rec: RecordedSession) {
    this.sessions.set(rec.session.id, structuredClone(rec.session));
    this.events.set(rec.session.id, structuredClone(rec.events));
  }
  async getSession(id: string) {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }
  async getRecorded(id: string) {
    const s = this.sessions.get(id);
    return s ? { session: structuredClone(s), events: structuredClone(this.events.get(id) ?? []) } : null;
  }
  async listSessions(profileKey: ProfileKey, lessonId?: string) {
    return [...this.sessions.values()].filter((s) => s.profileKey === profileKey && (lessonId === undefined || s.lessonId === lessonId)).map((s) => structuredClone(s)).sort(byStart);
  }
  async listOpenSessions(profileKey: ProfileKey) {
    return (await this.listSessions(profileKey)).filter((s) => s.status === 'recording' || s.status === 'paused');
  }
  async setSessionStatus(id: string, status: SessionStatus) {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, status, updatedAt: Date.now() });
  }
  async saveResult(result: ScoringResult) {
    this.results.set(result.id, structuredClone(result));
  }
  async listResults(profileKey: ProfileKey, lessonId?: string) {
    return [...this.results.values()].filter((r) => r.profileKey === profileKey && (lessonId === undefined || r.lessonId === lessonId)).map((r) => structuredClone(r)).sort(byCreated);
  }
  async resultsForSession(sessionId: string) {
    return [...this.results.values()].filter((r) => r.sessionId === sessionId).map((r) => structuredClone(r)).sort(byCreated);
  }
  async saveFeedback(feedback: AIFeedback) {
    this.feedback.set(feedback.id, structuredClone(feedback));
  }
  async feedbackForResult(resultId: string) {
    return [...this.feedback.values()].filter((f) => f.resultId === resultId).map((f) => structuredClone(f)).sort(byCreated);
  }
  async savePlan(plan: PracticePlan) {
    this.plans.set(plan.id, structuredClone(plan));
  }
  async listPlans(profileKey: ProfileKey, lessonId?: string) {
    return [...this.plans.values()].filter((p) => p.profileKey === profileKey && (lessonId === undefined || p.lessonId === lessonId)).map((p) => structuredClone(p)).sort(byCreated);
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
    this.events.delete(id);
    for (const [k, r] of this.results) if (r.sessionId === id) this.results.delete(k);
    for (const [k, f] of this.feedback) if (f.sessionId === id) this.feedback.delete(k);
  }
  async deleteProfile(profileKey: ProfileKey) {
    for (const [k, s] of this.sessions)
      if (s.profileKey === profileKey) {
        this.sessions.delete(k);
        this.events.delete(k);
      }
    for (const map of [this.results, this.feedback, this.plans] as Map<string, { profileKey: string }>[]) for (const [k, v] of map) if (v.profileKey === profileKey) map.delete(k);
  }
  async exportProfile(profileKey: ProfileKey, now = Date.now()): Promise<CoachExport> {
    const sessions = await this.listSessions(profileKey);
    return {
      format: 'vietpiano-coach-export',
      version: 2,
      exportedAt: now,
      profileKey,
      sessions,
      events: await eventsOf(this, sessions),
      results: await this.listResults(profileKey),
      feedback: [...this.feedback.values()].filter((f) => f.profileKey === profileKey).map((f) => structuredClone(f)).sort(byCreated),
      plans: await this.listPlans(profileKey),
    };
  }
}

/** Thử IndexedDB, lỗi thì chuyển sang bộ nhớ tạm (dữ liệu chỉ sống trong phiên mở app). */
export class ResilientCoachStorage implements CoachStorage {
  private impl: CoachStorage;
  private readonly fallback = new MemoryCoachStorage();
  /** true khi đang dùng bộ nhớ tạm — UI báo "chưa lưu được lâu dài". */
  degraded = false;

  constructor(primary?: CoachStorage) {
    this.impl = primary ?? (typeof indexedDB === 'undefined' ? this.fallback : new IndexedDbCoachStorage());
    this.degraded = this.impl === this.fallback;
  }

  private async run<T>(fn: (s: CoachStorage) => Promise<T>): Promise<T> {
    try {
      return await fn(this.impl);
    } catch (err) {
      if (this.impl === this.fallback) throw err;
      console.warn('[VietPiano] IndexedDB lỗi, dữ liệu AI Coach chỉ lưu tạm trong bộ nhớ', err);
      this.impl = this.fallback;
      this.degraded = true;
      return fn(this.impl);
    }
  }

  saveSession(rec: RecordedSession) {
    return this.run((s) => s.saveSession(rec));
  }
  getSession(id: string) {
    return this.run((s) => s.getSession(id));
  }
  getRecorded(id: string) {
    return this.run((s) => s.getRecorded(id));
  }
  listSessions(profileKey: ProfileKey, lessonId?: string) {
    return this.run((s) => s.listSessions(profileKey, lessonId));
  }
  listOpenSessions(profileKey: ProfileKey) {
    return this.run((s) => s.listOpenSessions(profileKey));
  }
  setSessionStatus(id: string, status: SessionStatus) {
    return this.run((s) => s.setSessionStatus(id, status));
  }
  saveResult(result: ScoringResult) {
    return this.run((s) => s.saveResult(result));
  }
  listResults(profileKey: ProfileKey, lessonId?: string) {
    return this.run((s) => s.listResults(profileKey, lessonId));
  }
  resultsForSession(sessionId: string) {
    return this.run((s) => s.resultsForSession(sessionId));
  }
  saveFeedback(feedback: AIFeedback) {
    return this.run((s) => s.saveFeedback(feedback));
  }
  feedbackForResult(resultId: string) {
    return this.run((s) => s.feedbackForResult(resultId));
  }
  savePlan(plan: PracticePlan) {
    return this.run((s) => s.savePlan(plan));
  }
  listPlans(profileKey: ProfileKey, lessonId?: string) {
    return this.run((s) => s.listPlans(profileKey, lessonId));
  }
  deleteSession(id: string) {
    return this.run((s) => s.deleteSession(id));
  }
  deleteProfile(profileKey: ProfileKey) {
    return this.run((s) => s.deleteProfile(profileKey));
  }
  exportProfile(profileKey: ProfileKey, now?: number) {
    return this.run((s) => s.exportProfile(profileKey, now));
  }
}

export const coachStorage = new ResilientCoachStorage();

/** Id mới cho phiên / kết quả / kế hoạch (không cần mật mã). */
export function newId(prefix: string, now = Date.now(), random = Math.random): string {
  return `${prefix}-${now.toString(36)}-${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;
}

/** Khoá kết quả: chấm lại bằng phiên bản engine khác / chế độ khác → bản ghi mới. */
export function resultKey(sessionId: string, engineVersion: string, mode: string): string {
  return `${sessionId}|${engineVersion}|${mode}`;
}
