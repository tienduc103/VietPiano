/**
 * Lưu tiến độ "Khám phá âm thanh" ở localStorage, theo hồ sơ (như "5 ngón · 8 nốt").
 * Dữ liệu chỉ nằm trên máy; Safari chặn lưu → trả về dữ liệu rỗng, bài vẫn chạy.
 */
import { sanitizeProgress, type SoundExploreProgress } from './progress';

export const STORAGE_KEY = 'vietpiano.sound-explore.v1';
const GUEST = 'guest';

function readAll(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function loadExploreProgress(profileId: string | null): SoundExploreProgress {
  return sanitizeProgress(readAll()[profileId ?? GUEST]);
}

export function saveExploreProgress(profileId: string | null, progress: SoundExploreProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [profileId ?? GUEST]: progress }));
  } catch {
    // không chặn bài học
  }
}

/** Xoá dữ liệu của một hồ sơ (gỡ hồ sơ / hoàn nguyên). */
export function clearExploreProgress(profileId: string | null): void {
  try {
    const all = readAll();
    delete all[profileId ?? GUEST];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // bỏ qua
  }
}
