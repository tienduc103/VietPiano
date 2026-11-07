/**
 * Tiến độ lộ trình luyện của bản phối (5 bước mỗi cấp): bước xong khi chơi HẾT bài đúng tay + chế độ của bước
 * với kết quả ≥ PLAN_STEP_PASS. Lưu localStorage theo hồ sơ + bài (danh sách nhỏ, không cần IndexedDB).
 */
import type { PracticeHand } from '../../practice/handPractice';
import type { PracticeMode } from '../../settings/DeviceSettings';
import type { PracticePlanStep } from './happyBirthday';

/** Kết quả tối thiểu (độ chính xác / điểm 0..1) để tính là xong một bước. */
export const PLAN_STEP_PASS = 0.8;

/** Bước của lộ trình ứng với lần chơi này (đúng tay + chế độ); không có → -1. Đoạn cắt (luyện ô nhịp) không tính. */
export function planStepFor(plan: readonly PracticePlanStep[], hand: PracticeHand, mode: PracticeMode): number {
  return plan.findIndex((s) => s.hand === hand && s.mode === mode);
}

export function markPlanStep(done: readonly number[], step: number, result: number): number[] {
  if (step < 0 || result + 1e-9 < PLAN_STEP_PASS || done.includes(step)) return [...done];
  return [...done, step].sort((a, b) => a - b);
}

type Store = Record<string, Record<string, number[]>>;
const KEY = 'vietpiano.practicePlan.v1';

function read(storage: Pick<Storage, 'getItem'> | undefined): Store {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Store) : {};
  } catch {
    return {};
  }
}

const safeStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

export function loadPlanDone(profileId: string, lessonId: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): number[] {
  const list = read(storage)[profileId]?.[lessonId];
  return Array.isArray(list) ? list.filter((x): x is number => Number.isInteger(x) && x >= 0) : [];
}

export function savePlanDone(profileId: string, lessonId: string, done: readonly number[], storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage()): void {
  const all = read(storage);
  all[profileId] = { ...all[profileId], [lessonId]: [...done] };
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // bỏ qua (chế độ riêng tư / hết chỗ)
  }
}
