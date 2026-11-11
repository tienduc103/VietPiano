/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — hàng đợi log trên máy: IndexedDB riêng "vietpiano-perform-log"
 * (lượt Biểu diễn có thể vài chục KB → không để localStorage). Giữ cả bản đã gửi để tải file ở Cài đặt; quá giới hạn
 * thì xoá bản cũ nhất theo loại. Mã log bắt đầu bằng thời điểm (base36) → thứ tự khoá = thứ tự thời gian.
 */
import type { PerformLogEntry } from './types';
import { randomId } from './settings';

export interface StoredLog {
  id: string;
  type: PerformLogEntry['type'];
  /** 0 = chưa gửi tới máy ghi, 1 = đã gửi. */
  sent: 0 | 1;
  entry: PerformLogEntry;
}

export interface LogCounts {
  total: number;
  pending: number;
  perform: number;
}

export interface LogQueue {
  add(entry: PerformLogEntry): Promise<void>;
  /** Bản chưa gửi, cũ trước. */
  unsent(limit: number): Promise<PerformLogEntry[]>;
  markSent(ids: readonly string[]): Promise<void>;
  /** Mọi bản, cũ trước. */
  all(): Promise<PerformLogEntry[]>;
  counts(): Promise<LogCounts>;
  clear(): Promise<void>;
}

/** Giữ tối đa bấy nhiêu bản mỗi loại (cũ nhất bị xoá trước). */
export const LOG_LIMITS: Record<PerformLogEntry['type'], number> = { perform: 150, visit: 40 };

/** Mã log tăng dần theo thời gian (độ dài cố định → so chuỗi = so thời điểm). */
export function newLogId(now = Date.now()): string {
  return `${Math.max(0, Math.floor(now)).toString(36).padStart(9, '0')}-${randomId(6)}`;
}

const toStored = (entry: PerformLogEntry): StoredLog => ({ id: entry.id, type: entry.type, sent: 0, entry });

export class MemoryLogQueue implements LogQueue {
  private readonly items = new Map<string, StoredLog>();

  async add(entry: PerformLogEntry): Promise<void> {
    this.items.set(entry.id, toStored(entry));
    for (const type of ['perform', 'visit'] as const) {
      const ids = [...this.items.values()].filter((x) => x.type === type).map((x) => x.id).sort();
      ids.slice(0, Math.max(0, ids.length - LOG_LIMITS[type])).forEach((id) => this.items.delete(id));
    }
  }

  private sorted(): StoredLog[] {
    return [...this.items.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async unsent(limit: number): Promise<PerformLogEntry[]> {
    return this.sorted()
      .filter((x) => x.sent === 0)
      .slice(0, limit)
      .map((x) => x.entry);
  }

  async markSent(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const x = this.items.get(id);
      if (x) x.sent = 1;
    }
  }

  async all(): Promise<PerformLogEntry[]> {
    return this.sorted().map((x) => x.entry);
  }

  async counts(): Promise<LogCounts> {
    const xs = [...this.items.values()];
    return { total: xs.length, pending: xs.filter((x) => x.sent === 0).length, perform: xs.filter((x) => x.type === 'perform').length };
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

const DB_NAME = 'vietpiano-perform-log';
const DB_VERSION = 1;
const STORE = 'entries';

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

export class IndexedDbLogQueue implements LogQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('sent', 'sent');
          store.createIndex('type', 'type');
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

  async add(entry: PerformLogEntry): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(toStored(entry));
    // Quá giới hạn loại này → xoá bản cũ nhất (chỉ duyệt khoá, không đọc nội dung log).
    const byType = store.index('type');
    const count = await promisify(byType.count(IDBKeyRange.only(entry.type)));
    let excess = count - LOG_LIMITS[entry.type];
    if (excess > 0) {
      await new Promise<void>((resolve, reject) => {
        const cursorReq = byType.openKeyCursor(IDBKeyRange.only(entry.type));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || excess <= 0) return resolve();
          store.delete(cursor.primaryKey);
          excess--;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    }
    await txDone(tx);
  }

  async unsent(limit: number): Promise<PerformLogEntry[]> {
    const db = await this.db();
    const rows = (await promisify(db.transaction(STORE).objectStore(STORE).index('sent').getAll(IDBKeyRange.only(0), limit))) as StoredLog[];
    return rows.map((r) => r.entry);
  }

  async markSent(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const id of ids) {
      const row = (await promisify(store.get(id))) as StoredLog | undefined;
      if (row && row.sent === 0) store.put({ ...row, sent: 1 });
    }
    await txDone(tx);
  }

  async all(): Promise<PerformLogEntry[]> {
    const db = await this.db();
    const rows = (await promisify(db.transaction(STORE).objectStore(STORE).getAll())) as StoredLog[];
    return rows.map((r) => r.entry);
  }

  async counts(): Promise<LogCounts> {
    const db = await this.db();
    const store = db.transaction(STORE).objectStore(STORE);
    const [total, pending, perform] = await Promise.all([
      promisify(store.count()),
      promisify(store.index('sent').count(IDBKeyRange.only(0))),
      promisify(store.index('type').count(IDBKeyRange.only('perform'))),
    ]);
    return { total, pending, perform };
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txDone(tx);
  }
}

/** IndexedDB lỗi (Safari riêng tư, bị chặn…) → chuyển sang bộ nhớ tạm, không làm hỏng luồng học. */
export class FallbackLogQueue implements LogQueue {
  private memory: MemoryLogQueue | null = null;

  constructor(private readonly primary: LogQueue | null) {}

  private async run<T>(op: (q: LogQueue) => Promise<T>): Promise<T> {
    if (this.primary && !this.memory) {
      try {
        return await op(this.primary);
      } catch {
        this.memory = new MemoryLogQueue();
      }
    }
    this.memory ??= new MemoryLogQueue();
    return op(this.memory);
  }

  add(entry: PerformLogEntry) {
    return this.run((q) => q.add(entry));
  }
  unsent(limit: number) {
    return this.run((q) => q.unsent(limit));
  }
  markSent(ids: readonly string[]) {
    return this.run((q) => q.markSent(ids));
  }
  all() {
    return this.run((q) => q.all());
  }
  counts() {
    return this.run((q) => q.counts());
  }
  clear() {
    return this.run((q) => q.clear());
  }
}
