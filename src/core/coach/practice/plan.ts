/**
 * Kế hoạch luyện sửa lỗi theo chuỗi (M6, máy trạng thái thuần):
 *   1 tách đoạn (1–4 ô, 60%) → 2 chơi chậm (70%) → 3 đúng nhiều lần liên tiếp (3 lần ≥ 90) → 4 tăng tempo từng bước (+10% mỗi lần đạt)
 *   → 5 nới đoạn (±1 ô, 90%) → 6 cả bài (100%) → 7 chấm lại cả bài và so với điểm ban đầu.
 * Mỗi lần ghi trong Coach gắn `planId` + `planStepId` → `applyAttempt` cập nhật bước đang làm. Người dùng bỏ qua / đổi tempo / dừng kế hoạch.
 */
import type { PlanStep, PlanStepKind, PracticePlan, PracticeRecommendation, ScoreReference } from '../types';

export interface PlanOptions {
  id: string;
  profileKey: string;
  lessonId: string;
  now: number;
  sourceResultId: string;
  sourceScore: number;
}

const STEP_TITLE: Record<PlanStepKind, string> = {
  isolate: 'Tách đoạn, chơi thật chậm',
  slow: 'Chơi chậm cho chắc',
  consistency: 'Đúng nhiều lần liên tiếp',
  'tempo-up': 'Tăng tempo từng bước',
  extend: 'Ghép vào đoạn dài hơn',
  full: 'Chơi cả bài',
  rescore: 'Chấm lại và so sánh',
};

export const PLAN_STEP_TITLE = STEP_TITLE;

function step(kind: PlanStepKind, measures: [number, number] | null, bpm: number, passScore: number, requiredPasses = 1): PlanStep {
  return { id: kind, kind, title: STEP_TITLE[kind], measures, bpm, requiredPasses, passScore, passes: 0, status: 'todo', attempts: [] };
}

export function createPlan(rec: PracticeRecommendation, ref: ScoreReference, opts: PlanOptions): PracticePlan {
  const first = ref.printedMeasures[0] ?? 1;
  const last = ref.printedMeasures[ref.printedMeasures.length - 1] ?? first;
  const target = ref.targetBpm;
  const m: [number, number] = rec.measures ? [Math.max(first, rec.measures[0]), Math.min(last, Math.max(rec.measures[0], Math.min(rec.measures[1], rec.measures[0] + 3)))] : [first, Math.min(last, first + 3)];
  const at = (pct: number) => Math.max(30, Math.round((target * pct) / 100));
  const wide: [number, number] = [Math.max(first, m[0] - 1), Math.min(last, m[1] + 1)];
  const steps: PlanStep[] = [
    step('isolate', m, at(Math.min(60, rec.tempoPercent ?? 60)), 80),
    step('slow', m, at(70), 85),
    step('consistency', m, at(70), 90, 3),
    step('tempo-up', m, at(80), 85),
    step('extend', wide, at(90), 85),
    step('full', null, at(100), 80),
    step('rescore', null, at(100), 0),
  ];
  steps[0].status = 'active';
  return {
    id: opts.id,
    profileKey: opts.profileKey,
    lessonId: opts.lessonId,
    createdAt: opts.now,
    updatedAt: opts.now,
    sourceResultId: opts.sourceResultId,
    sourceScore: opts.sourceScore,
    recommendationId: rec.id,
    title: rec.title,
    targetBpm: target,
    steps,
    status: 'active',
  };
}

export function activeStep(plan: PracticePlan): PlanStep | null {
  return plan.status === 'active' ? (plan.steps.find((s) => s.status === 'active') ?? null) : null;
}

function advance(plan: PracticePlan, steps: PlanStep[], now: number): PracticePlan {
  const next = steps.findIndex((s) => s.status === 'todo');
  if (next >= 0) steps[next] = { ...steps[next], status: 'active' };
  return { ...plan, steps, updatedAt: now, status: next >= 0 ? 'active' : 'done' };
}

/** Ghi một lần chấm vào bước đang làm của kế hoạch. */
export function applyAttempt(plan: PracticePlan, attempt: { resultId: string; score: number; at: number }): PracticePlan {
  const idx = plan.steps.findIndex((s) => s.status === 'active');
  if (plan.status !== 'active' || idx < 0) return plan;
  const steps = plan.steps.map((s) => ({ ...s, attempts: [...s.attempts] }));
  const s = steps[idx];
  const passed = attempt.score >= s.passScore;
  s.attempts.push({ ...attempt, passed });
  if (s.kind === 'rescore') {
    s.status = 'done';
    return { ...advance(plan, steps, attempt.at), finalScore: attempt.score };
  }
  if (s.kind === 'tempo-up') {
    if (passed) {
      if (s.bpm >= plan.targetBpm) s.status = 'done';
      else s.bpm = Math.min(plan.targetBpm, Math.round(s.bpm + plan.targetBpm * 0.1));
    }
    return s.status === 'done' ? advance(plan, steps, attempt.at) : { ...plan, steps, updatedAt: attempt.at };
  }
  // Đúng liên tiếp: trượt một lần là đếm lại.
  s.passes = passed ? s.passes + 1 : 0;
  if (s.passes >= s.requiredPasses) {
    s.status = 'done';
    return advance(plan, steps, attempt.at);
  }
  return { ...plan, steps, updatedAt: attempt.at };
}

export function skipStep(plan: PracticePlan, stepId: string, now: number): PracticePlan {
  const steps = plan.steps.map((s) => (s.id === stepId && (s.status === 'active' || s.status === 'todo') ? { ...s, status: 'skipped' as const } : s));
  if (!steps.some((s) => s.status === 'active')) return advance(plan, steps, now);
  return { ...plan, steps, updatedAt: now };
}

/** Đổi tempo của một bước (người dùng thấy quá nhanh / quá chậm). */
export function setStepBpm(plan: PracticePlan, stepId: string, bpm: number, now: number): PracticePlan {
  const v = Math.max(30, Math.min(240, Math.round(bpm)));
  return { ...plan, steps: plan.steps.map((s) => (s.id === stepId ? { ...s, bpm: v } : s)), updatedAt: now };
}

export function dismissPlan(plan: PracticePlan, now: number): PracticePlan {
  return { ...plan, status: 'dismissed', updatedAt: now };
}

/** Tiến độ 0..1 (bước xong hoặc bỏ qua / tổng). */
export function planProgress(plan: PracticePlan): number {
  return plan.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length / plan.steps.length;
}
