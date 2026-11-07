import { describe, expect, it } from 'vitest';
import { practicePlan } from './index';
import { loadPlanDone, markPlanStep, PLAN_STEP_PASS, planStepFor, savePlanDone } from './planProgress';

describe('lộ trình luyện của bản phối', () => {
  const plan = practicePlan('song-happy-birthday-beginner');

  it('bước ứng với tay + chế độ vừa chơi; không có bước khớp → -1', () => {
    expect(planStepFor(plan, 'right', 'wait')).toBe(0);
    expect(planStepFor(plan, 'left', 'wait')).toBe(1);
    expect(planStepFor(plan, 'both', 'tempo')).toBe(2);
    expect(planStepFor(plan, 'both', 'perform')).toBe(4);
    expect(planStepFor(plan, 'left', 'perform')).toBe(-1);
  });

  it('chỉ đánh dấu xong khi đạt từ 80%, không trùng, giữ thứ tự', () => {
    expect(markPlanStep([], 2, PLAN_STEP_PASS - 0.01)).toEqual([]);
    expect(markPlanStep([], 2, PLAN_STEP_PASS)).toEqual([2]);
    expect(markPlanStep([2], 0, 1)).toEqual([0, 2]);
    expect(markPlanStep([0, 2], 2, 1)).toEqual([0, 2]);
    expect(markPlanStep([1], -1, 1)).toEqual([1]);
  });

  it('lưu theo hồ sơ + bài; dữ liệu hỏng → rỗng', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    savePlanDone('p1', 'song-happy-birthday-beginner', [0, 3], storage);
    savePlanDone('p2', 'song-happy-birthday-beginner', [1], storage);
    expect(loadPlanDone('p1', 'song-happy-birthday-beginner', storage)).toEqual([0, 3]);
    expect(loadPlanDone('p2', 'song-happy-birthday-beginner', storage)).toEqual([1]);
    expect(loadPlanDone('p1', 'song-happy-birthday-advanced', storage)).toEqual([]);
    store.set('vietpiano.practicePlan.v1', '{hỏng');
    expect(loadPlanDone('p1', 'song-happy-birthday-beginner', storage)).toEqual([]);
  });
});
