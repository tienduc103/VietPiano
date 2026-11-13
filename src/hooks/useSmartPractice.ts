/**
 * Glue React cho AI Smart Practice: một service dùng chung (dữ liệu kết quả của Coach) + cài đặt / cờ tính năng.
 */
import { useCallback, useState } from 'react';
import { coachStorage } from '../core/coach/storage/CoachStorage';
import { SmartPracticeService } from '../core/smartPractice/service';
import { smartPracticeStore, type TechniqueSettings } from '../core/smartPractice/store';

export const smartPractice = new SmartPracticeService(coachStorage, smartPracticeStore);

export function useTechniqueSettings(): [TechniqueSettings, (patch: Partial<TechniqueSettings>) => void] {
  const [s, setS] = useState<TechniqueSettings>(() => smartPracticeStore.loadSettings());
  const update = useCallback((patch: Partial<TechniqueSettings>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      smartPracticeStore.saveSettings(next);
      return next;
    });
  }, []);
  return [s, update];
}
