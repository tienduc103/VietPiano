import { describe, expect, it } from 'vitest';
import { HAPPY_BIRTHDAY_LESSONS } from '../lessons/arrangements/happyBirthday';
import { chordMidis } from '../lessons/types';
import { PerformanceTracker } from './PerformanceTracker';
import { performanceBreakdown, performancePlan, planResultsOnScore, weakestSpan, SYNC_MS } from './performPlan';

const [beginner, intermediate, advanced] = HAPPY_BIRTHDAY_LESSONS;
/** 60 bpm: 1 phách = 1000 ms; đếm vào 3 phách → phách 0 ở t = 3000. */
const at = (beat: number) => 3000 + beat * 1000;

function run(plan: ReturnType<typeof performancePlan>, play: (n: (typeof plan)[number], i: number) => { midi: number; time: number } | null) {
  const t = new PerformanceTracker(plan, { bpm: 60, countInBeats: 3, debounceSamePitch: true });
  t.start(0);
  const events = plan.map((n, i) => play(n, i)).filter((e): e is { midi: number; time: number } => e !== null);
  for (const e of events.sort((a, b) => a.time - b.time)) t.handleNoteOn(e.midi, e.time);
  t.tick(at(t.totalBeats + 1));
  return t;
}

describe('Biểu diễn — danh sách nốt cần chấm', () => {
  it('hai tay (đàn MIDI): giai điệu + hoà âm tay phải + mọi nốt tay trái, xếp theo phách', () => {
    const plan = performancePlan(intermediate, 'both', false);
    const right = intermediate.notes.flatMap(chordMidis).length;
    const left = intermediate.accompaniment!.flatMap((c) => c.midis).length;
    expect(plan).toHaveLength(right + left);
    expect(plan.every((n, i) => i === 0 || plan[i - 1].startBeat <= n.startBeat)).toBe(true);
    expect(plan.filter((n) => n.kind === 'melody').map((n) => n.pitch)).toEqual(intermediate.notes.map((n) => n.pitch));
    expect(new Set(plan.map((n) => n.hand))).toEqual(new Set(['right', 'left']));
    // Ô in: ô lấy đà = 0, ô cuối = 8.
    expect(plan[0].measure).toBe(0);
    expect(plan.at(-1)!.measure).toBe(8);
    // Sắc thái theo giai điệu đang vang (tay trái cũng có).
    expect(plan.find((n) => n.kind === 'left' && n.measure === 5)?.dynamic).toBe('mf');
  });

  it('micro: hai tay → chỉ giai điệu; tay trái → chỉ nốt đệm đơn; tay phải → giai điệu', () => {
    expect(performancePlan(intermediate, 'both', true).map((n) => n.kind)).toEqual(intermediate.notes.map(() => 'melody'));
    const left = performancePlan(intermediate, 'left', true);
    expect(left.every((n) => n.kind === 'left')).toBe(true);
    expect(left.map((n) => n.pitch)).toEqual(['C3', 'B2', 'B2', 'C3', 'G3', 'C4', 'C3', 'A2', 'C3', 'C3', 'G3', 'C4']);
    expect(performancePlan(advanced, 'right', false).some((n) => n.kind === 'harmony')).toBe(true);
    expect(performancePlan(beginner, 'right', false).every((n) => n.kind === 'melody')).toBe(true);
  });
});

describe('Biểu diễn — chấm điểm hai tay', () => {
  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: chơi đúng hết, đúng phách → 100 điểm, hai tay 100%, đồng bộ 100%, không ô lỗi', (_id, l) => {
    const plan = performancePlan(l, 'both', false);
    const t = run(plan, (n) => ({ midi: n.midi, time: at(n.startBeat) + (n.hand === 'left' ? 5 : 12) }));
    const b = performanceBreakdown(plan, t.getState(), t.result(), 150, 500);
    expect(t.getState().status).toBe('finished');
    // Không có Note Off, không có lực gõ (bàn phím ảo) → trường độ / mạnh nhẹ "không đo", chia lại trọng số.
    expect(b.criteria.find((c) => c.key === 'duration')!.value).toBeNull();
    expect(b.score).toBe(100);
    expect(b.hands.right!.pitchAccuracy).toBe(1);
    expect(b.hands.left!.pitchAccuracy).toBe(1);
    expect(b.sync).toBe(1);
    expect(b.measures).toEqual([]);
  });

  it('cố ý đánh sai tay trái ô 3 + bỏ một nốt tay phải ô 6 → điểm tay trái giảm, ô 3 và ô 6 được chỉ ra', () => {
    const plan = performancePlan(intermediate, 'both', false);
    const t = run(plan, (n) => {
      if (n.hand === 'left' && n.measure === 3) return { midi: n.midi + 1, time: at(n.startBeat) };
      if (n.kind === 'melody' && n.measure === 6 && n.pitch === 'A4') return null;
      return { midi: n.midi, time: at(n.startBeat) };
    });
    const b = performanceBreakdown(plan, t.getState(), t.result(), 150, 500);
    expect(b.hands.left!.pitchAccuracy).toBeLessThan(1);
    expect(b.hands.right!.pitchAccuracy).toBeLessThan(1);
    expect(b.hands.left!.wrong).toBe(plan.filter((n) => n.hand === 'left' && n.measure === 3).length);
    expect(b.hands.right!.missed).toBe(1);
    expect(b.measures.map((m) => m.measure)).toEqual([3, 6]);
    expect(b.score).toBeLessThan(100);
    expect(weakestSpan(b.measures)).toEqual({ from: 3, to: 3 });
  });

  it('tay trái chậm hơn tay phải ~150 ms ở mọi phách → độ đồng bộ hai tay thấp, vẫn đúng nốt', () => {
    const plan = performancePlan(beginner, 'both', false);
    const t = run(plan, (n) => ({ midi: n.midi, time: at(n.startBeat) + (n.hand === 'left' ? SYNC_MS + 70 : 0) }));
    const b = performanceBreakdown(plan, t.getState(), t.result(), 150, 500);
    expect(b.hands.left!.pitchAccuracy).toBe(1);
    expect(b.sync).toBe(0);
  });

  it('tô khuông: chùm nốt có một phím sai → cả chùm tô sai; chưa chấm hết chùm → chưa tô', () => {
    const plan = performancePlan(intermediate, 'both', false);
    const results = plan.map(() => 'correct' as const);
    const melodyIdx = plan.findIndex((n) => n.kind === 'harmony');
    const chord = plan[melodyIdx].scoreIndex;
    const r1 = planResultsOnScore(plan, results.map((r, i) => (i === melodyIdx ? 'wrong' : r)), 'melody', intermediate.notes.length);
    expect(r1[chord]).toBe('wrong');
    expect(r1.filter((r) => r === 'correct')).toHaveLength(intermediate.notes.length - 1);
    const r2 = planResultsOnScore(plan, results.map((r, i) => (i === melodyIdx ? 'pending' : r)), 'melody', intermediate.notes.length);
    expect(r2[chord]).toBe('pending');
    const acc = planResultsOnScore(plan, results, 'accompaniment', intermediate.accompaniment!.length);
    // Ô lấy đà tay trái nghỉ → không tô.
    expect(acc[0]).toBe('pending');
    expect(acc.slice(1).every((r) => r === 'correct')).toBe(true);
  });

  it('gợi ý đoạn luyện lại: ô nhiều lỗi nhất + ô liền kề có lỗi', () => {
    expect(weakestSpan([])).toBeNull();
    expect(weakestSpan([{ measure: 5, total: 4 }, { measure: 6, total: 1 }, { measure: 2, total: 1 }])).toEqual({ from: 5, to: 6 });
    expect(weakestSpan([{ measure: 5, total: 4 }, { measure: 4, total: 2 }])).toEqual({ from: 4, to: 5 });
    expect(weakestSpan([{ measure: 7, total: 3 }])).toEqual({ from: 7, to: 7 });
  });
});
