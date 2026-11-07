import { describe, expect, it } from 'vitest';
import { referenceFromLesson } from '../reference/fromLesson';
import { scorePerformance } from '../scoring/ScoringEngine';
import { testLesson } from '../testing/lessons';
import { synthPerformance, type SynthOptions } from '../testing/synth';
import type { InputCapabilities, ScoringResult } from '../types';
import { issueFamily, progressReport, progressText, skillProfile } from './compare';

const CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true };
const ref = referenceFromLesson(testLesson('C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4'));
const attempt = (at: number, opts: SynthOptions): ScoringResult =>
  scorePerformance({ reference: ref, performance: synthPerformance(ref, { jitterMs: 6, velocity: (n) => n.velocityTarget, ...opts }), session: { id: `s${at}`, profileKey: 'p', lessonId: 'test' }, capabilities: CAPS, now: at });

describe('progressReport', () => {
  // Lỗi ở ô 2 lặp lại ba lần, giảm dần số lỗi; tempo tăng dần.
  const h1 = attempt(1, { bpm: 50, mods: { 'm:4': { midi: 66 }, 'm:5': { midi: 70 }, 'm:6': { skip: true } } });
  const h2 = attempt(2, { bpm: 55, mods: { 'm:4': { midi: 66 }, 'm:5': { midi: 70 } } });
  const cur = attempt(3, { bpm: 60, mods: { 'm:4': { midi: 66 } } });

  it('so với lần trước + trung bình, xu hướng, lỗi tái diễn, tempo đạt, giảm lỗi', () => {
    const rep = progressReport([h1, h2], 5, cur);
    expect(rep.attempts).toBe(2);
    expect(rep.previousTotal).toBe(h2.total);
    expect(rep.deltaVsPrevious).toBe(cur.total - h2.total);
    expect(rep.averageTotal).toBeCloseTo((h1.total + h2.total) / 2, 1);
    expect(rep.criteria.find((c) => c.key === 'notes')!.trend).toBe('up');
    expect(rep.recurring[0]).toMatchObject({ family: 'notes', measure: 2, count: 3 });
    expect(rep.recurring[0].label).toBe('sai / thiếu nốt ở ô 2 (3/3 lần)');
    expect(rep.errors).toEqual({ first: 3, last: 1, reduction: 0.67 });
    expect(rep.slope).toBeGreaterThan(0);
    expect(rep.best).toBe(Math.max(h1.total, h2.total, cur.total));
  });

  it('cửa sổ 3/5/10 lần chỉ lấy các lần gần nhất; chưa có lịch sử → không có số so sánh', () => {
    const many = Array.from({ length: 8 }, (_, i) => attempt(10 + i, {}));
    expect(progressReport(many, 3, cur).attempts).toBe(3);
    const first = progressReport([], 5, cur);
    expect(first).toMatchObject({ attempts: 0, previousTotal: null, averageTotal: null, deltaVsPrevious: null, errors: null });
  });

  it('nhóm lỗi + hồ sơ kỹ năng + báo cáo văn bản', () => {
    expect(issueFamily('late')).toBe('timing');
    expect(issueFamily('pedal-not-changed')).toBe('pedal');
    expect(issueFamily('chord-wrong-note')).toBe('notes');
    const skill = skillProfile([h1, h2, cur]);
    expect(skill).toMatchObject({ results: 3, lessons: 1 });
    expect(skill.topFamilies[0]).toMatchObject({ family: 'notes', results: 3 });
    const text = progressText('Bé An', [h1, h2, cur], { test: 'Gam Đô' }, 0);
    expect(text).toContain('Bé An');
    expect(text).toContain('Gam Đô: 3 lần');
    expect(text).toContain('Lỗi lặp lại: sai / thiếu nốt ở ô 2');
  });
});
