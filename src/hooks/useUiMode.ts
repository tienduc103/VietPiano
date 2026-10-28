import { resolveUiMode } from '../core/curriculum/uiMode';
import type { UiMode } from '../core/curriculum/types';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

/** Kids / Adult Mode của giáo trình (theo cài đặt, "tự động" theo tuổi hồ sơ đang chọn). */
export function useUiMode(): UiMode {
  const setting = useSettings((s) => s.settings.uiMode);
  const age = useProfiles((s) => activeProfile(s)?.age ?? null);
  return resolveUiMode(setting, age);
}
