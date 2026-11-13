import { describe, expect, it } from 'vitest';
import type { AiProvider } from '../coach/ai/provider';
import { referenceFromLesson } from '../coach/reference/fromLesson';
import { scorePerformance } from '../coach/scoring/ScoringEngine';
import { synthPerformance, type SynthOptions } from '../coach/testing/synth';
import type { InputCapabilities, PerformanceSession, ScoringResult } from '../coach/types';
import { SmartPracticeService, type ResultSource } from '../smartPractice/service';
import { activeFatigue, sanitizeData, SmartPracticeStore, MAX_FEEDBACK } from '../smartPractice/store';
import { aiRankToday, buildRankPayload, verifyRank } from './aiRank';
import { exerciseById } from './catalog';
import { buildDashboard } from './dashboard';
import { isRemedialId, resolveLesson, scoringWeightsFor } from './lessons';
import { recommendToday, type RecommendInput } from './recommend';
import { getSkillProgress, weakestSkill } from './skills';

const MIDI: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: false, polyphonic: true };
const DAY = 86_400_000;
const NOW = new Date(2026, 10, 11, 18, 0, 0).getTime();

/** Một lượt luyện bài kỹ thuật `id` ở thời điểm `at` (chấm thật bằng Scoring Engine với trọng số của bài). */
function play(id: string, at: number, opts: SynthOptions = {}, bpm?: number): ScoringResult {
  const ex = exerciseById(id)!;
  const target = bpm ?? ex.lesson.tempo ?? 60;
  const ref = referenceFromLesson(ex.lesson, { targetBpm: target });
  const r = scorePerformance({
    reference: ref,
    performance: synthPerformance(ref, { jitterMs: 8, seed: at % 9973, bpm: target, ...opts }),
    session: { id: `s-${id}-${at}`, profileKey: 'p1', lessonId: ex.lesson.id },
    capabilities: MIDI,
    weights: ex.scoringConfig.weights,
    now: at,
  });
  return r;
}

class MemoryResults implements ResultSource {
  constructor(public results: ScoringResult[] = [], public sessions: PerformanceSession[] = []) {}
  async listResults(profileKey: string, lessonId?: string) {
    return this.results.filter((r) => r.profileKey === profileKey && (!lessonId || r.lessonId === lessonId));
  }
  async listSessions(profileKey: string) {
    return this.sessions.filter((s) => s.profileKey === profileKey);
  }
}

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

function baseInput(results: ScoringResult[], extra: Partial<RecommendInput> = {}): RecommendInput {
  return {
    now: NOW,
    results,
    skills: getSkillProgress(results, NOW),
    passages: [],
    sourceTitle: (id) => exerciseById(id)?.title,
    sourceTempo: () => 60,
    sourceGroupCount: (id) => referenceFromLesson(exerciseById(id)!.lesson).groups.length,
    remedials: [],
    feedback: [],
    fatigue: false,
    ...extra,
  };
}

describe('hồ sơ kỹ năng', () => {
  it('không có dữ liệu → mọi kỹ năng "chưa đo"', () => {
    const p = getSkillProgress([], NOW);
    expect(Object.values(p).every((s) => s.proficiency === null && s.confidence === 'low')).toBe(true);
    expect(weakestSkill(p)).toBeNull();
  });

  it('chuyển ngón: đo ở nốt luồn ngón cái; chậm ở Fa nhiều lượt → kỹ năng chuyển ngón yếu nhất', () => {
    const slow = { mods: { 'm:3': { shiftMs: 400 } } };
    const rs = [0, 1, 2, 3].map((k) => play('tech-l3-run8-up-rh', NOW - k * DAY, slow));
    const p = getSkillProgress(rs, NOW);
    expect(p.transition.proficiency).toBe(0);
    expect(p.notes.proficiency).toBeGreaterThan(0.95);
    expect(p.transition.confidence).toBe('medium');
    expect(weakestSkill(p)?.skillId).toBe('transition');
    // Không đo được → không chấm (bài một tay: không có phối hợp hai tay).
    expect(p.coordination.proficiency).toBeNull();
  });

  it('xu hướng: 7 ngày gần đây tốt hơn trước → trend dương', () => {
    const wrong = { mods: { 'm:1': { midi: 61 }, 'm:4': { midi: 68 } } };
    const old = [10, 12, 14].map((d) => play('tech-l1-5f-updown-rh', NOW - d * DAY, wrong));
    const recent = [1, 2].map((d) => play('tech-l1-5f-updown-rh', NOW - d * DAY));
    expect(getSkillProgress([...old, ...recent], NOW).notes.trend!).toBeGreaterThan(0.1);
  });
});

describe('đề xuất 3 bài hôm nay (luật)', () => {
  it('người mới: khởi động bằng bài đầu tiên, có bài để học, chỉ bài có thật và đủ tiên quyết', () => {
    const plan = recommendToday(baseInput([]));
    expect(plan.items.length).toBeGreaterThanOrEqual(2);
    expect(plan.items[0].slot).toBe('warmup');
    expect(plan.level).toBe(1);
    for (const it of plan.items) {
      const ex = exerciseById(it.exerciseId!)!;
      expect(ex).toBeDefined();
      expect(ex.prerequisites).toEqual([]);
      expect(it.reason.length).toBeGreaterThan(10);
    }
    expect(new Set(plan.items.map((i) => i.lessonId)).size).toBe(plan.items.length);
  });

  it('đoạn khó đã phát hiện → bài 2 là bài bổ trợ có lý do kèm bằng chứng', () => {
    const svcResults = [0, 1, 2].map((k) => play('tech-l3-run8-updown-rh', NOW - (k + 1) * 3_600_000, { mods: { 'm:3': { shiftMs: 400 } } }));
    const ref = referenceFromLesson(exerciseById('tech-l3-run8-updown-rh')!.lesson);
    const passages = new SmartPracticeService(new MemoryResults(svcResults));
    return passages.recentPassages('p1', NOW).then((ps) => {
      expect(ps).toHaveLength(1);
      const plan = recommendToday(baseInput(svcResults, { passages: ps }));
      const improve = plan.items.find((i) => i.slot === 'improve')!;
      expect(isRemedialId(improve.lessonId)).toBe(true);
      expect(improve.reason).toContain('E4 – F4');
      expect(improve.reason).toContain('3/3');
      expect(improve.evidence[0]).toBe(`passage:${ps[0].id}`);
      expect(resolveLesson(improve.lessonId)?.notes.length).toBe(3);
      expect(improve.remedial?.endGroup).toBeLessThan(ref.groups.length);
    });
  });

  it('báo mỏi → chỉ còn khởi động nhẹ + lời nhắc nghỉ', () => {
    const plan = recommendToday(baseInput([], { fatigue: true }));
    expect(plan.fatigue).toBe(true);
    expect(plan.items.map((i) => i.slot)).toEqual(['warmup']);
    expect(plan.note).toContain('nghỉ');
  });

  it('"Không phù hợp" → không đề xuất lại bài đó; "Đổi bài" → chọn bài khác', () => {
    const first = recommendToday(baseInput([]));
    const id = first.items[0].lessonId;
    const again = recommendToday(baseInput([], { feedback: [{ at: NOW - DAY, lessonId: id, slot: 'warmup', action: 'unsuitable' }] }));
    expect(again.items.some((i) => i.lessonId === id)).toBe(false);
    const swapped = recommendToday(baseInput([], { skip: new Set([first.items[1].lessonId]) }));
    expect(swapped.items.some((i) => i.lessonId === first.items[1].lessonId)).toBe(false);
  });

  it('bài đã đạt → khởi động bằng bài đó; bài mới đủ tiên quyết được đề xuất nâng cao', () => {
    const rs = [play('tech-l1-fingers-rh', NOW - 2 * DAY), play('tech-l1-fingers-rh', NOW - DAY)];
    const plan = recommendToday(baseInput(rs));
    expect(plan.items[0].exerciseId).toBe('tech-l1-fingers-rh');
    const unlocked = plan.items.filter((i) => i.slot !== 'warmup').map((i) => i.exerciseId);
    expect(unlocked).toContain('tech-l1-5f-updown-rh');
  });

  it('thời lượng mong muốn ngắn → bớt bài cuối, vẫn còn ít nhất một bài', () => {
    const full = recommendToday(baseInput([]));
    const short = recommendToday(baseInput([], { minutesAvailable: full.items[0].minutes }));
    expect(short.items).toHaveLength(1);
    expect(short.items[0].lessonId).toBe(full.items[0].lessonId);
  });

  it('bài luyện ≥ 5 lượt hôm nay không được đề xuất thêm', () => {
    const rs = [1, 2, 3, 4, 5].map((k) => play('tech-l1-fingers-rh', NOW - k * 60_000));
    expect(recommendToday(baseInput(rs)).items.some((i) => i.exerciseId === 'tech-l1-fingers-rh')).toBe(false);
  });
});

describe('AI xếp hạng (tầng 2) — chỉ trong danh sách hợp lệ, có xác minh', () => {
  const plan = recommendToday(baseInput([]));
  const payload = buildRankPayload(plan, 'adult', null);

  it('id lạ, thứ tự sai, số liệu bịa → bị bỏ; câu hợp lệ được dùng', () => {
    const v = verifyRank(
      {
        order: ['T2', 'T1'],
        reasons: [
          { ref: 'T1', text: 'Bài khởi động nhẹ giúp làm quen số ngón.' },
          { ref: 'T2', text: 'Bạn đã sai 47 lần ở bài này.' },
          { ref: 'T9', text: 'Bài không có trong danh sách.' },
        ],
      },
      payload,
    );
    expect(v.order).toBeNull();
    expect(v.reasons.T1).toBeDefined();
    expect(v.reasons.T2).toBeUndefined();
    expect(v.removed.join(' ')).toContain('T9');
  });

  it('AI lỗi / tắt → giữ nguyên đề xuất theo luật', async () => {
    const broken: AiProvider = { id: 'x', label: 'x', model: 'm', status: async () => ({ ok: false }), chatJson: async () => Promise.reject(new Error('mất kết nối')) };
    const r = await aiRankToday(plan, broken, { audience: 'adult', ageGroup: null });
    expect(r.source).toBe('rules');
    expect(r.plan).toEqual(plan);
    expect((await aiRankToday(plan, null, { audience: 'adult', ageGroup: null })).source).toBe('rules');
  });

  it('AI trả lời hợp lệ → chỉ đổi lý do / thứ tự, giữ bài + tempo + thời lượng', async () => {
    const good: AiProvider = {
      id: 'x',
      label: 'x',
      model: 'm',
      status: async () => ({ ok: true }),
      chatJson: async () => JSON.stringify({ order: payload.items.map((i) => i.ref), reasons: [{ ref: 'T1', text: 'Khởi động thật nhẹ nhàng cho các ngón.' }] }),
    };
    const r = await aiRankToday(plan, good, { audience: 'kids', ageGroup: '6-8' });
    expect(r.source).toBe('ai');
    expect(r.plan.items.map((i) => [i.lessonId, i.bpm, i.minutes])).toEqual(plan.items.map((i) => [i.lessonId, i.bpm, i.minutes]));
    expect(r.plan.items[0].reason).toBe('Khởi động thật nhẹ nhàng cho các ngón.');
  });
});

describe('kho Smart Practice + service dùng chung', () => {
  it('sanitize bỏ mục hỏng, giới hạn dung lượng, xuất / xoá theo hồ sơ', () => {
    const d = sanitizeData({ remedials: [{ id: 'xx' }, { id: 'rem:a:1-3', sourceId: 'a', startGroup: 1, endGroup: 3, createdAt: 1 }], feedback: [{ at: 1, lessonId: 'a', slot: 'w', action: 'hack' }], fatigue: 'x' }, 'p');
    expect(d.remedials.map((r) => r.id)).toEqual(['rem:a:1-3']);
    expect(d.feedback).toEqual([]);
    const s = new SmartPracticeStore(memStorage());
    for (let i = 0; i < MAX_FEEDBACK + 20; i++) s.addFeedback('p', { at: i, lessonId: 'a', slot: 'w', action: 'start' });
    expect(s.load('p').feedback).toHaveLength(MAX_FEEDBACK);
    expect(s.load('q').feedback).toHaveLength(0);
    expect(JSON.parse(s.export('p')).kind).toBe('vietpiano-smart-practice');
    s.clear('p');
    expect(s.load('p').feedback).toHaveLength(0);
    s.reportFatigue('p', NOW - 3_600_000);
    expect(activeFatigue(s.load('p'), NOW)).not.toBeNull();
    expect(activeFatigue(s.load('p'), NOW + 13 * 3_600_000)).toBeNull();
    expect(s.loadSettings()).toEqual({ enabled: true, adaptiveTempo: true, aiRank: true });
  });

  it('service: phát hiện đoạn khó → tạo bài bổ trợ → luyện đạt → quay về bài gốc; không đổi điểm', async () => {
    const slow = { mods: { 'm:3': { shiftMs: 400 } } };
    const src = new MemoryResults([0, 1, 2].map((k) => play('tech-l3-run8-updown-rh', NOW - (10 - k) * 3_600_000, slow)));
    const store = new SmartPracticeStore(memStorage());
    const svc = new SmartPracticeService(src, store);
    const [p] = await svc.detectDifficultPassages('p1', 'tech-l3-run8-updown-rh');
    expect(p.noteNames).toEqual(['E4', 'F4']);
    const made = svc.createRemedialExercise('p1', p, 0, { now: NOW });
    expect(made?.lesson.notes.map((n) => n.pitch)).toEqual(['D4', 'E4', 'F4']);
    expect(store.load('p1').remedials).toHaveLength(1);
    // Luyện bài bổ trợ (chấm thật) hai lượt đạt.
    const remRef = referenceFromLesson(made!.lesson, { targetBpm: 42 });
    const remResults = [1, 2].map((k) =>
      scorePerformance({ reference: remRef, performance: synthPerformance(remRef, { bpm: 42, seed: k }), session: { id: `rs${k}`, profileKey: 'p1', lessonId: made!.lesson.id }, capabilities: MIDI, now: NOW - (5 - k) * 3_600_000 }),
    );
    const totals = remResults.map((r) => r.total);
    src.results.push(...remResults);
    const outcome = await svc.evaluateRemedialOutcome('p1', made!.remedial.id);
    expect(outcome?.next).toBe('extend');
    const bigger = svc.createRemedialExercise('p1', p, 2, { now: NOW });
    expect(bigger?.lesson.notes.map((n) => n.pitch)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    expect(store.load('p1').remedials.find((r) => r.id === made!.remedial.id)?.status).toBe('dismissed');
    expect(remResults.map((r) => r.total)).toEqual(totals);
    // Bài gốc chơi lại đúng → đoạn khó không còn lỗi.
    src.results.push(play('tech-l3-run8-updown-rh', NOW - 3_600_000), play('tech-l3-run8-updown-rh', NOW - 1_800_000));
    const after = await svc.evaluateRemedialOutcome('p1', made!.remedial.id);
    expect(after?.errorRateBefore).toBe(1);
    expect(after?.errorRateAfter).toBe(0);
    expect(after?.verdict).toBe('improved');
  });

  it('service: đầu vào không hợp lệ → rỗng / null, không ném lỗi', async () => {
    const svc = new SmartPracticeService(new MemoryResults(), new SmartPracticeStore(memStorage()));
    expect(await svc.detectDifficultPassages('', 'x')).toEqual([]);
    expect(await svc.detectDifficultPassages('p1', 'khong-co')).toEqual([]);
    expect(svc.createRemedialExercise('p1', { sourceId: 'tech-l1-fingers-rh', startGroup: 99, endGroup: 99 }, 0)).toBeNull();
    expect(await svc.getAdaptiveTempo('p1', 'khong-co')).toBeNull();
    expect((await svc.getAdaptiveTempo('p1', 'tech-l1-fingers-rh'))?.action).toBe('start');
  });

  it('analyzePerformance lấy nguyên điểm của engine và liệt kê tiêu chí không đo được', () => {
    const r = play('tech-l1-fingers-rh', NOW);
    const a = new SmartPracticeService(new MemoryResults()).analyzePerformance(r);
    expect(a.total).toBe(r.total);
    expect(a.unavailable.map((u) => u.criterion)).toContain('pedal');
  });
});

describe('tra bài + trọng số + dashboard', () => {
  it('Coach tra được bài kỹ thuật, bài Thư viện, bài bổ trợ; trọng số theo mục tiêu bài', () => {
    expect(resolveLesson('tech-l2-legato-rh')?.title).toContain('Legato');
    expect(resolveLesson('song-happy-birthday-beginner')).toBeDefined();
    expect(resolveLesson('rem:tech-l2-legato-rh:1-3')?.notes).toHaveLength(3);
    expect(resolveLesson('khong-co')).toBeUndefined();
    expect(scoringWeightsFor('tech-l2-legato-rh')?.duration).toBe(45);
    expect(scoringWeightsFor('rem:tech-l2-legato-rh:1-3')?.duration).toBe(45);
    expect(scoringWeightsFor('song-happy-birthday-beginner')).toBeUndefined();
  });

  it('dashboard: số bài, tỉ lệ hoàn thành, tempo ổn định, lọc theo cấp / thời gian', () => {
    const rs = [play('tech-l1-fingers-rh', NOW - 2 * DAY), play('tech-l1-fingers-rh', NOW - DAY), play('tech-l3-run8-up-rh', NOW - DAY, { mods: { 'm:3': { midi: 66 }, 'm:5': { midi: 70 } } })];
    const sessions = rs.map((r) => ({ id: r.sessionId, profileKey: 'p1', startedAt: r.createdAt - 90_000, endedAt: r.createdAt, updatedAt: r.createdAt }) as PerformanceSession);
    const d = buildDashboard(rs, sessions, [], NOW);
    expect(d.exercisesPracticed).toBe(2);
    expect(d.sessions).toBe(3);
    expect(d.minutes).toBe(5);
    expect(d.passedExercises).toBe(1);
    expect(d.stableTempos.map((t) => t.exerciseId)).toEqual(['tech-l1-fingers-rh']);
    expect(d.series.length).toBe(2);
    const l3 = buildDashboard(rs, sessions, [], NOW, { level: 3 });
    expect(l3.exercisesPracticed).toBe(1);
    expect(l3.passedExercises).toBe(0);
    expect(buildDashboard(rs, sessions, [], NOW, { from: NOW - DAY / 2 }).sessions).toBe(0);
  });
});
