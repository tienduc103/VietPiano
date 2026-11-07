import { describe, expect, it } from 'vitest';
import { referenceFromLesson } from '../reference/fromLesson';
import { scorePerformance } from '../scoring/ScoringEngine';
import { testLesson } from '../testing/lessons';
import { synthPerformance, type SynthOptions } from '../testing/synth';
import type { InputCapabilities } from '../types';
import { activeStep, applyAttempt, createPlan, dismissPlan, planProgress, setStepBpm, skipStep } from './plan';
import { recommendPractice } from './recommend';

const CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true };
const MELODY = 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | E4 G4 E4 C4 | D4 F4 D4 B3 | C4 E4 G4 E4 | C4/w';
const ref = referenceFromLesson(testLesson(MELODY));
const score = (opts: SynthOptions) =>
  scorePerformance({ reference: ref, performance: synthPerformance(ref, { jitterMs: 8, ...opts }), session: { id: 's', profileKey: 'p', lessonId: 'test' }, capabilities: CAPS, now: 5 });

describe('recommendPractice', () => {
  it('lỗi dồn vào một đoạn → gợi ý luyện riêng đoạn đó trước, có số liệu', () => {
    const r = score({ mods: { 'm:20': { midi: 50 }, 'm:21': { skip: true }, 'm:22': { midi: 70 }, 'm:23': { shiftMs: 250 } } });
    const recs = recommendPractice(r, ref);
    expect(recs[0]).toMatchObject({ id: 'R1', kind: 'section', measures: [6, 6], action: { type: 'coach-section', measures: [6, 6], tempoPercent: 60 } });
    expect(recs[0].reason).toMatch(/^Ô 6 làm mất [\d,]+ điểm \(\d+ lỗi\)/);
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it('sai nốt rải rác nhiều ô → luyện đọc nốt (trò Bóng bay); lệch nhịp → metronome chậm', () => {
    const r = score({ mods: { 'm:1': { midi: 63 }, 'm:9': { midi: 61 }, 'm:17': { midi: 54 }, 'm:26': { midi: 73 }, 'm:5': { shiftMs: 200 }, 'm:13': { shiftMs: -200 } } });
    const recs = recommendPractice(r, ref);
    const kinds = recs.map((x) => x.kind);
    expect(kinds).toContain('note-reading');
    expect(recs.find((x) => x.kind === 'note-reading')!.action).toMatchObject({ type: 'game', game: 'balloon-pop' });
    expect(kinds).toContain('slow-metronome');
    expect(recs.map((x) => x.priority)).toEqual(recs.map((_, i) => i + 1));
  });

  it('chơi đúng → không gợi ý', () => {
    expect(recommendPractice(score({ velocity: (n) => n.velocityTarget }), ref)).toEqual([]);
  });
});

describe('PracticePlan', () => {
  const r = score({ mods: { 'm:20': { midi: 50 }, 'm:21': { skip: true } } });
  const rec = recommendPractice(r, ref)[0];
  const plan0 = createPlan(rec, ref, { id: 'plan', profileKey: 'p', lessonId: 'test', now: 1, sourceResultId: r.id, sourceScore: r.total });

  it('7 bước, bước 1 đang làm, tempo theo % mục tiêu, đoạn nới ở bước 5', () => {
    expect(plan0.steps.map((s) => s.kind)).toEqual(['isolate', 'slow', 'consistency', 'tempo-up', 'extend', 'full', 'rescore']);
    expect(activeStep(plan0)!.kind).toBe('isolate');
    expect(plan0.steps.map((s) => s.bpm)).toEqual([36, 42, 42, 48, 54, 60, 60]);
    expect(plan0.steps[4].measures).toEqual([5, 7]);
    expect(plan0.steps[5].measures).toBeNull();
  });

  it('đạt điểm → sang bước sau; đúng liên tiếp 3 lần mới qua bước 3 (trượt thì đếm lại); tăng tempo tới mục tiêu', () => {
    let p = applyAttempt(plan0, { resultId: 'a', score: 85, at: 2 });
    expect(activeStep(p)!.kind).toBe('slow');
    p = applyAttempt(p, { resultId: 'b', score: 70, at: 3 });
    expect(activeStep(p)!.kind).toBe('slow');
    p = applyAttempt(p, { resultId: 'c', score: 90, at: 4 });
    expect(activeStep(p)!.kind).toBe('consistency');
    for (const s of [95, 92, 60, 91, 93]) p = applyAttempt(p, { resultId: `x${s}`, score: s, at: 5 });
    expect(activeStep(p)!.kind).toBe('consistency');
    p = applyAttempt(p, { resultId: 'y', score: 96, at: 6 });
    expect(activeStep(p)!.kind).toBe('tempo-up');
    const bpms: number[] = [];
    while (activeStep(p)?.kind === 'tempo-up') {
      bpms.push(activeStep(p)!.bpm);
      p = applyAttempt(p, { resultId: 't', score: 90, at: 7 });
    }
    expect(bpms).toEqual([48, 54, 60]);
    expect(activeStep(p)!.kind).toBe('extend');
  });

  it('bỏ qua bước, đổi tempo, chấm lại cuối → xong kèm điểm cuối; dừng kế hoạch', () => {
    let p = skipStep(plan0, 'isolate', 2);
    expect(activeStep(p)!.kind).toBe('slow');
    p = setStepBpm(p, 'slow', 39.6, 3);
    expect(p.steps[1].bpm).toBe(40);
    for (const id of ['slow', 'consistency', 'tempo-up', 'extend', 'full']) p = skipStep(p, id, 4);
    expect(activeStep(p)!.kind).toBe('rescore');
    p = applyAttempt(p, { resultId: 'final', score: 88, at: 9 });
    expect(p.status).toBe('done');
    expect(p.finalScore).toBe(88);
    expect(planProgress(p)).toBe(1);
    expect(dismissPlan(plan0, 3).status).toBe('dismissed');
    expect(activeStep(dismissPlan(plan0, 3))).toBeNull();
  });
});
