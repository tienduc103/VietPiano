import type { UiModeSetting } from '../settings/DeviceSettings';
import type { UiMode } from './types';

/** Tuổi tối đa mặc định dùng Kids Mode (cùng mốc nhóm "Thiếu nhi" của hồ sơ người học). */
export const KIDS_MAX_AGE = 11;

/** Kids / Adult Mode: theo cài đặt, "auto" thì theo tuổi hồ sơ (chưa có hồ sơ → Adult). Cùng một engine, chỉ khác trình bày. */
export function resolveUiMode(setting: UiModeSetting, age: number | null): UiMode {
  if (setting !== 'auto') return setting;
  return age !== null && age <= KIDS_MAX_AGE ? 'kids' : 'adult';
}
