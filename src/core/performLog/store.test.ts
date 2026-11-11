import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { batches, BATCH, describeSendError, LogHttpError, PerformLogClient } from './client';
import { deviceEnv, isAutomated, playerOf } from './env';
import { FallbackLogQueue, IndexedDbLogQueue, LOG_LIMITS, MemoryLogQueue, newLogId, type LogQueue } from './queue';
import { AUTO_LOG_URL, logEndpoint, normalizeLogUrl, PERFORM_LOG_SETTINGS_KEY, PerformLogSettingsStore, sanitizeSettings } from './settings';
import type { PerformLogEntry, VisitEntry } from './types';

const ENV = deviceEnv({});

function visit(id: string, extra: Partial<VisitEntry> = {}): VisitEntry {
  return {
    v: 1,
    id,
    type: 'visit',
    at: '2026-11-08T10:00:00.000Z',
    app: 'test',
    device: { id: 'd-test', name: '' },
    player: playerOf(null),
    env: ENV,
    reason: 'open',
    ...extra,
  };
}

const perform = (id: string) => ({ ...visit(id), type: 'perform' }) as unknown as PerformLogEntry;

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('cài đặt nhật ký', () => {
  it('địa chỉ máy ghi: auto, thêm http:// + cổng mặc định, bỏ "/" và "/__vplog" cuối', () => {
    expect(normalizeLogUrl('')).toBe(AUTO_LOG_URL);
    expect(normalizeLogUrl(' Auto ')).toBe(AUTO_LOG_URL);
    expect(normalizeLogUrl('192.168.1.14')).toBe('http://192.168.1.14:8790');
    expect(normalizeLogUrl('http://192.168.1.14:9000/')).toBe('http://192.168.1.14:9000');
    expect(normalizeLogUrl('https://pc.local/__vplog')).toBe('https://pc.local');
    expect(normalizeLogUrl('http://localhost:5173/VietPiano/__vplog')).toBe('http://localhost:5173/VietPiano');
  });

  it('mặc định bật + auto; mã máy sinh một lần rồi giữ nguyên; tên máy cắt gọn', () => {
    const storage = memoryStorage();
    const store = new PerformLogSettingsStore(() => storage);
    const s = store.get();
    expect(s).toMatchObject({ enabled: true, url: AUTO_LOG_URL, deviceName: '' });
    expect(s.deviceId).toMatch(/^d-[a-z0-9]{8}$/);
    // Mở app lần sau: cùng mã máy.
    expect(new PerformLogSettingsStore(() => storage).get().deviceId).toBe(s.deviceId);
    let calls = 0;
    store.subscribe(() => calls++);
    store.update({ deviceName: '  iPad   của bé An  ', url: '192.168.1.14' });
    expect(store.get()).toMatchObject({ deviceName: 'iPad của bé An', url: 'http://192.168.1.14:8790', deviceId: s.deviceId });
    expect(JSON.parse(storage.data.get(PERFORM_LOG_SETTINGS_KEY)!)).toMatchObject({ deviceName: 'iPad của bé An' });
    expect(calls).toBe(1);
    expect(sanitizeSettings({ enabled: 'x', deviceId: 'BAD ID', deviceName: 5 })).toMatchObject({ enabled: true, deviceName: '' });
  });

  it('localStorage lỗi (Safari riêng tư) → vẫn chạy trong bộ nhớ', () => {
    const store = new PerformLogSettingsStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.get().enabled).toBe(true);
    expect(store.update({ enabled: false }).enabled).toBe(false);
  });

  it('địa chỉ gửi: auto = server của app; GitHub Pages / trình duyệt tự động → không gửi; địa chỉ riêng → /__vplog', () => {
    const lan = { origin: 'https://192.168.1.14:5173', hostname: '192.168.1.14', base: '/' };
    expect(logEndpoint(AUTO_LOG_URL, lan, false)).toBe('https://192.168.1.14:5173/__vplog');
    expect(logEndpoint(AUTO_LOG_URL, { ...lan, base: '/VietPiano/' }, false)).toBe('https://192.168.1.14:5173/VietPiano/__vplog');
    expect(logEndpoint(AUTO_LOG_URL, lan, true)).toBeNull();
    expect(logEndpoint(AUTO_LOG_URL, { origin: 'https://tienduc103.github.io', hostname: 'tienduc103.github.io', base: '/VietPiano/' }, false)).toBeNull();
    expect(logEndpoint('http://192.168.1.14:8790', lan, true)).toBe('http://192.168.1.14:8790/__vplog');
  });
});

describe('thông tin máy', () => {
  it('đọc từ navigator / screen / window; thiếu thì trống', () => {
    const env = deviceEnv({
      navigator: { userAgent: 'UA', platform: 'iPad', language: 'vi-VN', maxTouchPoints: 5, hardwareConcurrency: 6, requestMIDIAccess: () => null },
      screen: { width: 1180, height: 820 },
      window: { innerWidth: 1180, innerHeight: 760, devicePixelRatio: 2, matchMedia: () => ({ matches: true }) },
      location: { origin: 'https://x.github.io', pathname: '/VietPiano/' },
    });
    expect(env).toMatchObject({ ua: 'UA', platform: 'iPad', screen: '1180x820@2', viewport: '1180x760', standalone: true, touchPoints: 5, cores: 6, memoryGb: null, webMidi: true, page: 'https://x.github.io/VietPiano/' });
    expect(ENV).toMatchObject({ ua: '', screen: '', webMidi: false, standalone: false });
    expect(isAutomated({ navigator: { webdriver: true } })).toBe(true);
    expect(isAutomated({})).toBe(false);
    expect(playerOf({ id: 'p', name: 'An', age: 7, experience: 'new' })).toEqual({ id: 'p', name: 'An', age: 7, experience: 'new' });
  });
});

async function queueContract(q: LogQueue) {
  const ids = [1, 2, 3].map((k) => newLogId(1_700_000_000_000 + k));
  await q.add(visit(ids[1]));
  await q.add(perform(ids[0]));
  await q.add(visit(ids[2]));
  expect(await q.counts()).toEqual({ total: 3, pending: 3, perform: 1 });
  // Cũ trước (theo mã = thời điểm).
  expect((await q.unsent(2)).map((e) => e.id)).toEqual([ids[0], ids[1]]);
  await q.markSent([ids[0], ids[1]]);
  expect((await q.unsent(10)).map((e) => e.id)).toEqual([ids[2]]);
  expect((await q.all()).map((e) => e.id)).toEqual(ids);
  expect(await q.counts()).toEqual({ total: 3, pending: 1, perform: 1 });
  await q.clear();
  expect(await q.counts()).toEqual({ total: 0, pending: 0, perform: 0 });
}

describe('hàng đợi log', () => {
  it('mã log tăng dần theo thời gian', () => {
    expect(newLogId(1000) < newLogId(2000)).toBe(true);
  });

  it('IndexedDB: thêm, lấy bản chưa gửi, đánh dấu đã gửi, xoá', async () => {
    await queueContract(new IndexedDbLogQueue(new IDBFactory()));
  });

  it('bộ nhớ: cùng hành vi', async () => {
    await queueContract(new MemoryLogQueue());
  });

  it('quá giới hạn loại → xoá bản cũ nhất của loại đó', async () => {
    for (const q of [new IndexedDbLogQueue(new IDBFactory()), new MemoryLogQueue()]) {
      const ids = Array.from({ length: LOG_LIMITS.visit + 3 }, (_, k) => newLogId(1_700_000_000_000 + k));
      for (const id of ids) await q.add(visit(id));
      // Bản Biểu diễn cũ hơn mọi lượt mở app vẫn giữ: giới hạn tính riêng từng loại.
      const old = newLogId(1_600_000_000_000);
      await q.add(perform(old));
      const all = await q.all();
      expect(all.filter((e) => e.type === 'visit').map((e) => e.id)).toEqual(ids.slice(3));
      expect(all.filter((e) => e.type === 'perform').map((e) => e.id)).toEqual([old]);
    }
  });

  it('IndexedDB lỗi → chuyển sang bộ nhớ', async () => {
    const broken: LogQueue = {
      add: () => Promise.reject(new Error('x')),
      unsent: () => Promise.reject(new Error('x')),
      markSent: () => Promise.reject(new Error('x')),
      all: () => Promise.reject(new Error('x')),
      counts: () => Promise.reject(new Error('x')),
      clear: () => Promise.reject(new Error('x')),
    };
    await queueContract(new FallbackLogQueue(broken));
    await queueContract(new FallbackLogQueue(null));
  });
});

describe('PerformLogClient', () => {
  function client(opts: { enabled?: boolean; endpoint?: string | null; respond?: (body: string) => { status: number; json?: unknown } } = {}) {
    const queue = new MemoryLogQueue();
    const sent: string[] = [];
    const settings = { enabled: opts.enabled ?? true, url: AUTO_LOG_URL, deviceId: 'd-test', deviceName: '' };
    const timers: (() => void)[] = [];
    const c = new PerformLogClient({
      queue: () => queue,
      fetch: () => async (_url, init) => {
        const body = String(init?.body ?? '');
        if (init?.method === 'POST') sent.push(body);
        const r = opts.respond?.(body) ?? { status: 200, json: { ok: true, app: 'vietpiano-perform-log', dir: 'logs/perform-log' } };
        return new Response(r.json === undefined ? 'not json' : JSON.stringify(r.json), { status: r.status });
      },
      settings: () => settings,
      endpoint: () => (opts.endpoint === undefined ? 'http://pc:8790/__vplog' : opts.endpoint),
      now: () => 123,
      schedule: (fn) => timers.push(fn),
    });
    return { c, queue, sent, settings, timers };
  }

  it('lưu rồi hẹn gửi; gửi NDJSON; máy ghi trả ok → đánh dấu đã gửi', async () => {
    const { c, sent, timers } = client();
    const a = visit(newLogId(1));
    const b = visit(newLogId(2));
    await c.record(a);
    await c.record(b);
    expect(c.getStatus()).toMatchObject({ total: 2, pending: 2 });
    expect(timers).toHaveLength(1); // hai lần lưu liền nhau → một lần gửi
    timers[0]();
    await c.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].trim().split('\n').map((l) => JSON.parse(l).id)).toEqual([a.id, b.id]);
    expect(c.getStatus()).toMatchObject({ total: 2, pending: 0, lastSentAt: 123, lastError: null, endpoint: 'http://pc:8790/__vplog', sending: false });
  });

  it('tắt nhật ký → không lưu; không có địa chỉ gửi → chỉ lưu trên máy', async () => {
    const off = client({ enabled: false });
    await off.c.record(visit(newLogId(1)));
    expect((await off.queue.counts()).total).toBe(0);

    const local = client({ endpoint: null });
    await local.c.record(visit(newLogId(1)));
    await local.c.flush();
    expect(local.sent).toHaveLength(0);
    expect(local.c.getStatus()).toMatchObject({ pending: 1, endpoint: null });
  });

  it('lỗi gửi → giữ trên máy, không tự thử lại địa chỉ đó; "Gửi ngay" (force) thử lại', async () => {
    let status = 404;
    const { c, sent } = client({ respond: () => ({ status, json: status === 200 ? { ok: true } : undefined }) });
    await c.record(visit(newLogId(1)));
    await c.flush();
    expect(c.getStatus()).toMatchObject({ pending: 1, lastError: 'Máy chủ không có máy ghi log (HTTP 404).' });
    await c.flush();
    expect(sent).toHaveLength(1);
    status = 200;
    await c.flush(true);
    expect(sent).toHaveLength(2);
    expect(c.getStatus()).toMatchObject({ pending: 0, lastError: null });
  });

  it('địa chỉ trả lời không phải máy ghi → báo lỗi, không đánh dấu đã gửi', async () => {
    const { c } = client({ respond: () => ({ status: 200 }) });
    await c.record(visit(newLogId(1)));
    await c.flush();
    expect(c.getStatus()).toMatchObject({ pending: 1, lastError: 'Địa chỉ trả lời không phải máy ghi log của VietPiano.' });
  });

  it('thử kết nối + xuất file + xoá', async () => {
    const { c } = client();
    expect(await c.test('http://pc:8790/__vplog')).toEqual({ ok: true, text: 'Kết nối tốt — máy ghi lưu vào logs/perform-log.' });
    expect((await c.test(null)).ok).toBe(false);
    await c.record(visit('a'));
    await c.record(visit('b'));
    const text = await c.exportText();
    expect(text.trim().split('\n').map((l) => JSON.parse(l).id)).toEqual(['a', 'b']);
    await c.clear();
    expect(await c.exportText()).toBe('');
    expect(c.getStatus().total).toBe(0);
  });

  it('chia lần gửi theo số bản / dung lượng; mô tả lỗi', () => {
    const many = Array.from({ length: BATCH + 5 }, (_, k) => visit(`v${k}`));
    expect(batches(many).map((b) => b.ids.length)).toEqual([BATCH, 5]);
    expect(batches([]).length).toBe(0);
    expect(describeSendError(new LogHttpError(403))).toContain('PERFLOG_ORIGINS');
    expect(describeSendError(new TypeError('Failed to fetch'))).toContain('Không kết nối được');
  });
});
