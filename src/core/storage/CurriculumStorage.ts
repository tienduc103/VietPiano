/**
 * CurriculumStorage — tiến độ giáo trình theo từng người học (IndexedDB riêng "vietpiano-curriculum",
 * tách khỏi DB luyện tập để không phải nâng phiên bản DB cũ). Fallback bộ nhớ tạm nếu IndexedDB lỗi.
 */
import { sanitizeRecord, type LessonRecord } from '../curriculum/progress';

export interface CurriculumStorage {
  /** Mọi bản ghi của một người học, theo lessonId. */
  getAll(profileKey: string): Promise<Record<string, LessonRecord>>;
  put(record: LessonRecord): Promise<void>;
  /** Xoá tiến độ (một người học, hoặc tất cả). */
  clear(profileKey?: string): Promise<void>;
}

const DB_NAME = 'vietpiano-curriculum';
const DB_VERSION = 1;
const STORE = 'lessonRecords';

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

function byLesson(list: unknown[]): Record<string, LessonRecord> {
  const out: Record<string, LessonRecord> = {};
  for (const raw of list) {
    const r = sanitizeRecord(raw);
    if (r) out[r.lessonId] = r;
  }
  return out;
}

export class IndexedDbCurriculumStorage implements CurriculumStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'key' });
            store.createIndex('profileKey', 'profileKey');
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

  async getAll(profileKey: string): Promise<Record<string, LessonRecord>> {
    const db = await this.db();
    const index = db.transaction(STORE).objectStore(STORE).index('profileKey');
    return byLesson(await promisify(index.getAll(profileKey)));
  }

  async put(record: LessonRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await txDone(tx);
  }

  async clear(profileKey?: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (profileKey === undefined) store.clear();
    else for (const key of await promisify(store.index('profileKey').getAllKeys(profileKey))) store.delete(key);
    await txDone(tx);
  }
}

export class MemoryCurriculumStorage implements CurriculumStorage {
  private records = new Map<string, LessonRecord>();

  async getAll(profileKey: string) {
    return byLesson([...this.records.values()].filter((r) => r.profileKey === profileKey));
  }

  async put(record: LessonRecord) {
    this.records.set(record.key, structuredClone(record));
  }

  async clear(profileKey?: string) {
    if (profileKey === undefined) this.records.clear();
    else for (const [k, r] of this.records) if (r.profileKey === profileKey) this.records.delete(k);
  }
}

/** Thử IndexedDB, nếu lỗi thì tự chuyển sang bộ nhớ tạm (tiến độ chỉ sống trong phiên — có cảnh báo trên console). */
class ResilientCurriculumStorage implements CurriculumStorage {
  private impl: CurriculumStorage;
  private readonly fallback = new MemoryCurriculumStorage();

  constructor() {
    this.impl = typeof indexedDB === 'undefined' ? this.fallback : new IndexedDbCurriculumStorage();
  }

  get persistent(): boolean {
    return this.impl !== this.fallback;
  }

  private async run<T>(fn: (s: CurriculumStorage) => Promise<T>): Promise<T> {
    try {
      return await fn(this.impl);
    } catch (err) {
      if (this.impl === this.fallback) throw err;
      console.warn('[VietPiano] IndexedDB lỗi, tiến độ giáo trình chỉ lưu tạm trong bộ nhớ', err);
      this.impl = this.fallback;
      return fn(this.impl);
    }
  }

  getAll(profileKey: string) {
    return this.run((s) => s.getAll(profileKey));
  }
  put(record: LessonRecord) {
    return this.run((s) => s.put(record));
  }
  clear(profileKey?: string) {
    return this.run((s) => s.clear(profileKey));
  }
}

export const curriculumStorage = new ResilientCurriculumStorage();
