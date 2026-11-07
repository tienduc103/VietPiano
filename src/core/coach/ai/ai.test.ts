import { describe, expect, it } from 'vitest';
import { progressReport } from '../progress/compare';
import { recommendPractice } from '../practice/recommend';
import { referenceFromLesson } from '../reference/fromLesson';
import { scorePerformance } from '../scoring/ScoringEngine';
import { DEFAULT_COACH_SETTINGS, loadCoachSettings, saveCoachSettings, sanitizeCoachSettings } from '../settings';
import { testLesson } from '../testing/lessons';
import { synthPerformance, type SynthOptions } from '../testing/synth';
import type { InputCapabilities, ScoringResult } from '../types';
import { ruleBasedFeedback } from './fallback';
import { buildAiPayload, cleanText } from './payload';
import { buildAiMessages, COACH_FEEDBACK_SCHEMA } from './prompt';
import { AiTimeoutError, OllamaProvider, type AiProvider } from './provider';
import { requestCoachFeedback } from './teacher';
import { coerceFeedback, parseFeedbackJson, verifyFeedback } from './verify';

const CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true };
const ref = referenceFromLesson({ ...testLesson('C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4'), title: 'Gam Đô <b>trưởng</b>' });
const score = (opts: SynthOptions, at = 5): ScoringResult =>
  scorePerformance({ reference: ref, performance: synthPerformance(ref, { jitterMs: 6, velocity: (n) => n.velocityTarget, ...opts }), session: { id: `s${at}`, profileKey: 'p', lessonId: 'test' }, capabilities: CAPS, now: at });
const result = score({ mods: { 'm:5': { midi: 70 }, 'm:6': { skip: true }, 'm:9': { shiftMs: 230 } } });
const learner = { name: 'Bé <An>', age: 8, experience: 'beginner' as const };
const payload = buildAiPayload(result, ref, { learner, recommendations: recommendPractice(result, ref), source: 'midi', hand: 'both' });

describe('payload gửi AI', () => {
  it('chỉ số liệu tóm tắt có mã; không có log MIDI; không gửi tên khi chưa bật', () => {
    expect(payload.score.total).toBe(result.total);
    expect(payload.issues[0].ref).toMatch(/^I\d+$/);
    expect(payload.issues.length).toBeLessThanOrEqual(8);
    expect(payload.learner).toEqual({ ageGroup: 'Thiếu nhi', level: 'Mới làm quen' });
    expect(payload.lesson.title).toBe('Gam Đô b trưởng /b');
    const json = JSON.stringify(payload);
    expect(json).not.toContain('onMs');
    expect(json).not.toContain('"events"');
    expect(json).not.toContain('Bé');
  });

  it('bật gửi tên → tên đã lọc ký tự lạ; lịch sử chỉ có khi đã có lần trước', () => {
    const withName = buildAiPayload(result, ref, { learner, shareName: true, recommendations: [], source: 'midi', hand: 'both' });
    expect(withName.learner?.name).toBe('Bé An');
    expect(withName.history).toBeUndefined();
    const prev = score({ mods: { 'm:5': { midi: 70 }, 'm:6': { skip: true } } }, 1);
    const hist = buildAiPayload(result, ref, { learner: null, recommendations: [], source: 'midi', hand: 'both', progress: progressReport([prev], 5, result) });
    expect(hist.history).toMatchObject({ attempts: 1, previousTotal: prev.total });
    expect(cleanText('a\u0000b{c}`d`')).toBe('a b c d');
  });

  it('prompt: hệ thống + dữ liệu JSON; schema bắt buộc đủ trường', () => {
    const msgs = buildAiMessages(payload, 'kids');
    expect(msgs[0].content).toContain('xưng "cô"');
    expect(msgs[0].content).toContain('KHÔNG chấm lại');
    expect(JSON.parse(msgs[1].content.split('\n').slice(1).join('\n')).score.total).toBe(result.total);
    expect(COACH_FEEDBACK_SCHEMA.required).toContain('priorities');
  });
});

describe('xác minh câu trả lời AI', () => {
  const fallback = ruleBasedFeedback(result, payload);
  const wrongIssue = result.issues.find((i) => i.type === 'wrong-note')!;

  it('câu trả lời đúng số liệu được giữ nguyên', () => {
    const ai = {
      summary: `Bạn đạt ${result.total}/100. Ô 2 có nốt sai và nốt thiếu.`,
      strengths: ['Nhịp điệu khá đều.'],
      priorities: [{ issueRef: wrongIssue.id, title: 'Sai nốt ở ô 2', explanation: wrongIssue.message, fix: 'Chơi chậm ô 2, đọc tên nốt A4 trước khi đánh.' }],
      practiceSection: { fromMeasure: 2, toMeasure: 3 },
      practiceTempo: 45,
      nextExercise: { recommendationRef: 'R1', text: 'Luyện riêng đoạn có lỗi ở tempo chậm.' },
      comparison: null,
    };
    const v = verifyFeedback(coerceFeedback(ai)!, payload, fallback);
    expect(v.removed).toEqual([]);
    expect(v.replaced).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.content.practiceTempo).toBe(45);
  });

  it('bỏ câu bịa ô nhịp / số liệu / tên nốt / mã lỗi; thay trường trống bằng câu theo quy tắc', () => {
    const ai = {
      summary: 'Ô 4 bạn đánh sai rất nhiều. Bạn sớm 999 ms ở nốt G7.',
      strengths: ['Ô 9 bạn chơi rất hay.'],
      priorities: [
        { issueRef: 'I99', title: 'Lỗi bịa', explanation: 'x', fix: 'y' },
        { issueRef: wrongIssue.id, title: 'Sai nốt', explanation: 'Cần A4, bạn đánh F#5 ở ô 2.', fix: 'Tập chậm.' },
      ],
      practiceSection: { fromMeasure: 1, toMeasure: 1 },
      practiceTempo: 200,
      nextExercise: { recommendationRef: 'R9', text: 'Tập lại.' },
      comparison: 'Tốt hơn lần trước 20 điểm.',
    };
    const v = verifyFeedback(coerceFeedback(ai)!, payload, fallback);
    expect(v.ok).toBe(false);
    expect(v.content.summary).toBe(fallback.summary);
    expect(v.replaced).toEqual(expect.arrayContaining(['summary', 'strengths', 'practiceTempo', 'practiceSection']));
    expect(v.content.priorities.map((p) => p.issueRef)).toEqual([wrongIssue.id]);
    // "F#5" không có trong dữ liệu → câu giải thích bị bỏ, dùng câu của engine.
    expect(v.content.priorities[0].explanation).toBe(wrongIssue.message);
    expect(v.content.practiceTempo).toBe(fallback.practiceTempo);
    expect(v.content.nextExercise).toEqual({ text: 'Tập lại.' });
    expect(v.content.comparison).toBeNull();
    expect(v.removed.join('\n')).toContain('I99');
    expect(v.removed.join('\n')).toContain('không có lịch sử');
  });

  it('nhận cả "Ô 4", "ô nhịp 6", "ô 2–3" (chữ có dấu, viết hoa)', () => {
    const v = verifyFeedback(coerceFeedback({ summary: 'Ô nhịp 4 sai. ô 2–3 cần luyện. Ô 2 có lỗi.', strengths: [], priorities: [] })!, payload, fallback);
    expect(v.content.summary).toBe('ô 2–3 cần luyện. Ô 2 có lỗi.');
  });

  it('tách JSON trong ```json, JSON hỏng → null, sai kiểu bị bỏ', () => {
    expect(parseFeedbackJson('Đây:\n```json\n{"summary":"a"}\n```')).toEqual({ summary: 'a' });
    expect(parseFeedbackJson('không có JSON')).toBeNull();
    expect(parseFeedbackJson('{"summary": ')).toBeNull();
    const c = coerceFeedback({ summary: 5, strengths: ['a', 7, '', 'b'], priorities: 'x', practiceSection: { fromMeasure: 1.5, toMeasure: 2 }, practiceTempo: 'nhanh' })!;
    expect(c).toMatchObject({ summary: '', strengths: ['a', 'b'], priorities: [], practiceSection: null, practiceTempo: null, nextExercise: null, comparison: null });
  });

  it('nhận xét theo quy tắc: có số liệu thật, ưu tiên lỗi mất nhiều điểm, đoạn + tempo luyện', () => {
    expect(fallback.summary).toContain(`${result.total}/100`);
    expect(fallback.priorities.length).toBeGreaterThan(0);
    expect(fallback.priorities.every((p) => payload.issues.some((i) => i.ref === p.issueRef))).toBe(true);
    expect(fallback.practiceSection).not.toBeNull();
    expect(fallback.practiceTempo).toBe(42);
    expect(verifyFeedback(fallback, payload, fallback).removed).toEqual([]);
  });
});

function fakeProvider(answers: (string | Error)[]): AiProvider & { calls: number } {
  const p = {
    id: 'fake',
    label: 'fake',
    model: 'm',
    calls: 0,
    status: async () => ({ ok: true }),
    chatJson: async () => {
      const a = answers[Math.min(p.calls++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return p;
}

describe('requestCoachFeedback', () => {
  const base = { payload, result, audience: 'adult' as const, timeoutMs: 1000, retries: 1, id: 'fb1', now: () => 7 };
  const good = JSON.stringify({ summary: `Bạn đạt ${result.total}/100.`, strengths: [], priorities: [], practiceSection: null, practiceTempo: null, nextExercise: null, comparison: null });

  it('không có provider (AI tắt) → nhận xét theo quy tắc', async () => {
    const fb = await requestCoachFeedback({ ...base, provider: null });
    expect(fb.source).toBe('rules');
    expect(fb.content.summary).toContain('/100');
  });

  it('AI trả JSON hợp lệ → nguồn AI + model; JSON hỏng lần đầu → thử lại', async () => {
    const p = fakeProvider(['nói lan man không JSON', good]);
    const fb = await requestCoachFeedback({ ...base, provider: p });
    expect(p.calls).toBe(2);
    expect(fb).toMatchObject({ source: 'ai', model: 'm', resultId: result.id });
  });

  it('hết lượt thử / hết giờ / mất kết nối → theo quy tắc, có ghi lỗi; mất kết nối không thử lại', async () => {
    const t = await requestCoachFeedback({ ...base, provider: fakeProvider([new AiTimeoutError(1000)]) });
    expect(t).toMatchObject({ source: 'rules', error: 'AI không trả lời trong 1 giây' });
    const net = fakeProvider([Object.assign(new Error('Không kết nối được Ollama'), { kind: 'network' })]);
    const n = await requestCoachFeedback({ ...base, provider: net, retries: 3 });
    expect(n.source).toBe('rules');
    expect(net.calls).toBe(1);
  });
});

describe('OllamaProvider', () => {
  const tags = (models: string[]) => new Response(JSON.stringify({ models: models.map((name) => ({ name })) }), { status: 200 });

  it('trạng thái: tìm địa chỉ theo thứ tự, báo model đã tải chưa', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.startsWith('http://proxy')) throw new TypeError('fail');
      return tags(['gemma4:12b', 'llama3:latest']);
    }) as unknown as typeof fetch;
    const p = new OllamaProvider({ candidates: () => ['http://proxy/ollama', 'http://localhost:11434'], model: 'llama3', fetchImpl });
    const st = await p.status();
    expect(st).toMatchObject({ ok: true, baseUrl: 'http://localhost:11434', modelAvailable: true });
    expect(calls).toEqual(['http://proxy/ollama/api/tags', 'http://localhost:11434/api/tags']);
  });

  it('chat: gửi format = schema, text/plain, không stream; Ollama cũ (400) → thử lại "json"', async () => {
    const bodies: { format: unknown; stream: boolean }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tags')) return tags(['m']);
      const body = JSON.parse(String(init!.body));
      bodies.push(body);
      expect((init!.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
      if (typeof body.format === 'object') return new Response(JSON.stringify({ error: 'invalid format' }), { status: 400 });
      return new Response(JSON.stringify({ message: { content: '{"summary":"ok"}' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new OllamaProvider({ candidates: () => ['http://x'], model: 'm', fetchImpl });
    expect(await p.chatJson({ messages: [], schema: COACH_FEEDBACK_SCHEMA, timeoutMs: 1000 })).toBe('{"summary":"ok"}');
    expect(bodies.map((b) => [typeof b.format, b.stream])).toEqual([
      ['object', false],
      ['string', false],
    ]);
  });

  it('hết giờ → AiTimeoutError', async () => {
    const fetchImpl = ((url: string, init?: RequestInit) =>
      url.endsWith('/api/tags')
        ? Promise.resolve(tags(['m']))
        : new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const p = new OllamaProvider({ candidates: () => ['http://x'], model: 'm', fetchImpl });
    await expect(p.chatJson({ messages: [], timeoutMs: 30 })).rejects.toBeInstanceOf(AiTimeoutError);
  });
});

describe('cài đặt Coach', () => {
  it('sanitize: giá trị hỏng → mặc định, kẹp khoảng', () => {
    expect(sanitizeCoachSettings(null)).toEqual(DEFAULT_COACH_SETTINGS);
    expect(sanitizeCoachSettings({ mode: 'x', aiTimeoutSec: 9999, aiRetries: -2, tempoPercent: 10, historyWindow: 7, aiShareName: 'yes' })).toMatchObject({
      mode: 'technical',
      aiTimeoutSec: 300,
      aiRetries: 0,
      tempoPercent: 40,
      historyWindow: 5,
      aiShareName: false,
    });
  });

  it('lưu / đọc localStorage; JSON hỏng → mặc định', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveCoachSettings({ ...DEFAULT_COACH_SETTINGS, mode: 'performance', aiShareName: true }, store);
    expect(loadCoachSettings(store)).toMatchObject({ mode: 'performance', aiShareName: true });
    mem.set('vietpiano.coach.settings.v1', '{hỏng');
    expect(loadCoachSettings(store)).toEqual(DEFAULT_COACH_SETTINGS);
  });
});
