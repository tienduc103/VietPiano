import { describe, expect, it } from 'vitest';
import { scorePerformance, scoreWait, wrongNoteKey } from '../curriculum/scoring';
import type { Exercise } from '../curriculum/types';
import type { PracticeState } from '../practice/PracticeEngine';
import { buildCoachMessages, lessonReport, practiceReport } from './coachPrompt';
import { listModels, normalizeOllamaUrl, ollamaCandidates, ollamaProxyUrl, OllamaError, resolveOllama, streamChat } from './OllamaClient';

const ex = (id: string, title: string): Exercise => ({ kind: 'choice-quiz', id, title, questions: [], pass: { minScore: 70 } });

describe('báo cáo cho thầy AI', () => {
  it('buổi học: gộp tiêu chí, bỏ tiêu chí không đo, gộp lỗi theo tên nốt', () => {
    const a = ex('a', 'Chờ nốt');
    const b = ex('b', 'Biểu diễn');
    const lesson = { title: 'Buổi 1', exercises: [a, b], assessment: { passScore: 80 } } as never;
    const scores = {
      a: scoreWait(a, { correct: 8, wrong: 2, notes: 8, reached: 8, mistakes: [wrongNoteKey('E4', 'F4'), wrongNoteKey('E4', 'F4')] }),
      b: scorePerformance(
        b,
        { notes: 4, correct: 4, wrong: 0, missed: 0, extras: 0, pitchAccuracy: 1, timing: 0.5, duration: null as never, completion: 1, onTimeRatio: 0.5 },
        [],
      ),
    };
    const r = lessonReport(lesson, scores, 'letter');
    expect(r.kind).toBe('lesson');
    expect(r.exercises?.map((e) => e.title)).toEqual(['Chờ nốt', 'Biểu diễn']);
    expect(r.criteria.find((c) => c.label === 'Đúng trường độ')?.value).toBeNull();
    expect(r.criteria.find((c) => c.label === 'Hoàn thành')?.value).toBe(1);
    expect(r.mistakes).toEqual([{ text: expect.stringContaining('E4'), count: 2 }]);

    const [system, user] = buildCoachMessages(r, { name: 'An', age: 8, experience: 'new' }, 'kids');
    expect(system.role).toBe('system');
    expect(system.content).toContain('"con"');
    expect(user.content).toContain('An, 8 tuổi');
    expect(user.content).toContain('Đúng trường độ không đo');
    expect(user.content).toContain('(×2)');
    expect(user.content).toContain('cần 80 để đạt');
  });

  it('bài nhạc ở màn Luyện tập: lỗi theo từng nốt, thời gian chơi', () => {
    const state: PracticeState = {
      expected: [60, 62, 64, 62],
      index: 4,
      status: 'finished',
      results: ['correct', 'corrected', 'skipped', 'corrected'],
      correct: 3,
      wrong: 1,
      skipped: 1,
      lastPlayedMidi: null,
      lastEventTime: 0,
      startedAt: 1000,
      finishedAt: 31_000,
    };
    const r = practiceReport('Twinkle', state, 'letter');
    expect(r.score).toBe(75);
    expect(r.mistakes[0]).toEqual({ text: 'Đánh sai ở nốt D4', count: 2 });
    expect(r.mistakes).toContainEqual({ text: 'Bỏ qua nốt E4', count: 1 });
    const user = buildCoachMessages(r, null, 'adult')[1].content;
    expect(user).toContain('Bài nhạc: "Twinkle"');
    expect(user).toContain('30 giây');
    expect(user).not.toContain('Học viên:');
  });
});

describe('OllamaClient', () => {
  it('chuẩn hoá địa chỉ', () => {
    expect(normalizeOllamaUrl(' localhost:11434/ ')).toBe('http://localhost:11434');
    expect(normalizeOllamaUrl('https://pc.lan:8443/ollama/')).toBe('https://pc.lan:8443/ollama');
    expect(normalizeOllamaUrl('')).toBeNull();
    expect(normalizeOllamaUrl('ftp://x')).toBeNull();
    expect(normalizeOllamaUrl(' Auto ')).toBe('auto');
  });

  it('auto: thử proxy của app trước rồi tới localhost; địa chỉ tự nhập chỉ thử chính nó', () => {
    expect(ollamaProxyUrl('https://192.168.1.16:5173', '/')).toBe('https://192.168.1.16:5173/ollama');
    expect(ollamaProxyUrl('https://u.github.io', '/VietPiano/')).toBe('https://u.github.io/VietPiano/ollama');
    expect(ollamaCandidates('auto', 'https://pc/ollama')).toEqual(['https://pc/ollama', 'http://localhost:11434']);
    expect(ollamaCandidates('http://pc:11434', 'https://pc/ollama')).toEqual(['http://pc:11434']);
  });

  it('resolveOllama: bỏ qua proxy không có (404 hoặc trang HTML), lấy địa chỉ đầu tiên trả lời được', async () => {
    const tags = JSON.stringify({ models: [{ name: 'gemma4:12b' }] });
    const fetchFor = (map: Record<string, () => Response>) =>
      (async (url: string) => {
        const f = map[url];
        if (!f) throw new TypeError('Failed to fetch');
        return f();
      }) as unknown as typeof fetch;
    const urls = ['https://pc/ollama', 'http://localhost:11434'];
    // Có proxy → dùng proxy.
    expect(await resolveOllama(urls, { fetchImpl: fetchFor({ 'https://pc/ollama/api/tags': () => new Response(tags) }) })).toEqual({
      baseUrl: 'https://pc/ollama',
      models: ['gemma4:12b'],
    });
    // GitHub Pages: 404 → localhost.
    const r = await resolveOllama(urls, {
      fetchImpl: fetchFor({ 'https://pc/ollama/api/tags': () => new Response('<html>', { status: 404 }), 'http://localhost:11434/api/tags': () => new Response(tags) }),
    });
    expect(r.baseUrl).toBe('http://localhost:11434');
    // Server SPA trả index.html 200 → không phải JSON → bỏ qua.
    const spa = await resolveOllama(urls, {
      fetchImpl: fetchFor({ 'https://pc/ollama/api/tags': () => new Response('<!doctype html>'), 'http://localhost:11434/api/tags': () => new Response(tags) }),
    });
    expect(spa.baseUrl).toBe('http://localhost:11434');
    // Không đâu trả lời → lỗi kết nối.
    await expect(resolveOllama(urls, { fetchImpl: fetchFor({}) })).rejects.toMatchObject({ kind: 'network' });
  });

  it('stream NDJSON: ghép các mẩu, kể cả dòng bị cắt giữa hai chunk', async () => {
    const enc = new TextEncoder();
    const parts = ['{"message":{"content":"Chà"}}\n{"message":{"con', 'tent":"o con"}}\n', '{"done":true}'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });
    let sent: { url: string; body: unknown } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string) };
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const tokens: string[] = [];
    const full = await streamChat({ baseUrl: 'http://x', model: 'm', messages: [{ role: 'user', content: 'hi' }], onToken: (t) => tokens.push(t), fetchImpl });
    expect(full).toBe('Chào con');
    expect(tokens).toEqual(['Chà', 'o con']);
    expect(sent).toMatchObject({ url: 'http://x/api/chat', body: { model: 'm', stream: true } });
  });

  it('lỗi: không kết nối → network; model không có → thông báo của Ollama', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(listModels('http://x', { fetchImpl: down })).rejects.toMatchObject({ kind: 'network' });
    const missing = (async () => new Response(JSON.stringify({ error: 'model "abc" not found' }), { status: 404 })) as unknown as typeof fetch;
    const err = await streamChat({ baseUrl: 'http://x', model: 'abc', messages: [], fetchImpl: missing }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OllamaError);
    expect((err as OllamaError).message).toContain('not found');
  });

  it('liệt kê model', async () => {
    const ok = (async () => new Response(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'gemma2:9b' }] }))) as unknown as typeof fetch;
    expect(await listModels('http://x', { fetchImpl: ok })).toEqual(['qwen2.5:7b', 'gemma2:9b']);
  });
});
