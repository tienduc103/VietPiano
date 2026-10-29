/**
 * AiNoteStorage — nhận xét AI cho bài trong Thư viện, theo người học + bài (IndexedDB riêng "vietpiano-ai-notes",
 * tách khỏi DB luyện tập để không phải nâng phiên bản DB cũ). Fallback bộ nhớ tạm nếu IndexedDB lỗi.
 * Nhận xét của buổi giáo trình nằm trong `LessonRecord.aiNotes` (CurriculumStorage).
 */
import { mergeAiNote, sanitizeAiNotes, type AiNote } from '../feedback/aiNotes';

export interface AiNoteStorage {
  /** Nhận xét của một bài, cũ → mới. */
  get(profileKey: string, lessonId: string): Promise<AiNote[]>;
  /** Thêm / ghi đè (cùng `at`) một nhận xét; trả về danh sách sau khi lưu. */
  add(profileKey: string, lessonId: string, note: AiNote): Promise<AiNote[]>;
  /** Xoá (một người học, hoặc tất cả). */
  clear(profileKey?: string): Promise<void>;
}

interface NoteRecord {
  /** `${profileKey}|${lessonId}` */
  key: string;
  profileKey: string;
  lessonId: string;
  notes: AiNote[];
}

const DB_NAME = 'vietpiano-ai-notes';
const DB_VERSION = 1;
const STORE = 'libraryNotes';

const keyOf = (profileKey: string, lessonId: string) => `${profileKey}|${lessonId}`;

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

export class IndexedDbAiNoteStorage implements AiNoteStorage {
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

  async get(profileKey: string, lessonId: string): Promise<AiNote[]> {
    const db = await this.db();
    const rec = (await promisify(db.transaction(STORE).objectStore(STORE).get(keyOf(profileKey, lessonId)))) as NoteRecord | undefined;
    return sanitizeAiNotes(rec?.notes);
  }

  async add(profileKey: string, lessonId: string, note: AiNote): Promise<AiNote[]> {
    const db = await this.db();
    // Đọc + ghi trong cùng một giao dịch → hai lần lưu liền nhau không ghi đè mất của nhau.
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const key = keyOf(profileKey, lessonId);
    const prev = (await promisify(store.get(key))) as NoteRecord | undefined;
    const notes = mergeAiNote(sanitizeAiNotes(prev?.notes), note);
    store.put({ key, profileKey, lessonId, notes } satisfies NoteRecord);
    await txDone(tx);
    return notes;
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

export class MemoryAiNoteStorage implements AiNoteStorage {
  private records = new Map<string, NoteRecord>();

  async get(profileKey: string, lessonId: string) {
    return structuredClone(this.records.get(keyOf(profileKey, lessonId))?.notes ?? []);
  }

  async add(profileKey: string, lessonId: string, note: AiNote) {
    const key = keyOf(profileKey, lessonId);
    const notes = mergeAiNote(this.records.get(key)?.notes ?? [], note);
    this.records.set(key, { key, profileKey, lessonId, notes: structuredClone(notes) });
    return notes;
  }

  async clear(profileKey?: string) {
    if (profileKey === undefined) this.records.clear();
    else for (const [k, r] of this.records) if (r.profileKey === profileKey) this.records.delete(k);
  }
}

/** Thử IndexedDB, nếu lỗi thì tự chuyển sang bộ nhớ tạm (nhận xét chỉ sống trong phiên). */
class ResilientAiNoteStorage implements AiNoteStorage {
  private impl: AiNoteStorage;
  private readonly fallback = new MemoryAiNoteStorage();

  constructor() {
    this.impl = typeof indexedDB === 'undefined' ? this.fallback : new IndexedDbAiNoteStorage();
  }

  private async run<T>(fn: (s: AiNoteStorage) => Promise<T>): Promise<T> {
    try {
      return await fn(this.impl);
    } catch (err) {
      if (this.impl === this.fallback) throw err;
      console.warn('[VietPiano] IndexedDB lỗi, nhận xét AI chỉ lưu tạm trong bộ nhớ', err);
      this.impl = this.fallback;
      return fn(this.impl);
    }
  }

  get(profileKey: string, lessonId: string) {
    return this.run((s) => s.get(profileKey, lessonId));
  }
  add(profileKey: string, lessonId: string, note: AiNote) {
    return this.run((s) => s.add(profileKey, lessonId, note));
  }
  clear(profileKey?: string) {
    return this.run((s) => s.clear(profileKey));
  }
}

export const aiNoteStorage: AiNoteStorage = new ResilientAiNoteStorage();
