/**
 * Lưu kết quả từng lần chơi Săn nốt + cài đặt gần nhất, ở localStorage theo hồ sơ người học
 * (như kỷ lục trò chơi tự do `games/arcade.ts`). Lỗi đọc/ghi (chế độ riêng tư…) → bỏ qua, trò vẫn chạy.
 */
import type { HunterMode, HunterSummary } from './NoteHunterGame';
import { clampBpm } from './MusicTransport';
import { TARGET_RANGES } from './songs';

export interface HunterRun {
  /** Thời điểm kết thúc (Date.now()). */
  at: number;
  songId: string;
  mode: HunterMode;
  bpm: number;
  targets: number[];
  summary: HunterSummary;
}

export const MAX_RUNS = 50;

const runsKey = (profileId: string | null) => `vietpiano-note-hunter-runs:${profileId ?? 'default'}`;
const SETTINGS_KEY = 'vietpiano-note-hunter-settings';

/** Thêm lần chơi mới lên đầu, giữ tối đa `max`. */
export function appendRun(runs: readonly HunterRun[], run: HunterRun, max = MAX_RUNS): HunterRun[] {
  return [run, ...runs].slice(0, max);
}

export function loadRuns(profileId: string | null): HunterRun[] {
  try {
    const raw = localStorage.getItem(runsKey(profileId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list.filter((r) => r && typeof r === 'object' && typeof r.songId === 'string' && r.summary) as HunterRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(profileId: string | null, run: HunterRun): HunterRun[] {
  const runs = appendRun(loadRuns(profileId), run);
  try {
    localStorage.setItem(runsKey(profileId), JSON.stringify(runs));
  } catch {
    // hết chỗ / bị chặn — bỏ qua
  }
  return runs;
}

export type HunterInputSetting = 'auto' | 'midi' | 'microphone' | 'virtual';

export interface HunterSettings {
  songId: string;
  rangeId: string;
  targets: number[];
  bpm: number;
  mode: HunterMode;
  showNames: boolean;
  keyLabels: boolean;
  input: HunterInputSetting;
  /** Dùng tai nghe: loa không lọt vào micro → không cần lọc tiếng vọng. */
  headphones: boolean;
}

export const DEFAULT_HUNTER_SETTINGS: HunterSettings = {
  songId: 'hunter-do-mi-sol',
  rangeId: TARGET_RANGES[0].id,
  targets: [60],
  bpm: 80,
  mode: 'wait',
  showNames: true,
  keyLabels: true,
  input: 'auto',
  headphones: false,
};

const MODES: readonly HunterMode[] = ['wait', 'note', 'rhythm'];
const INPUTS: readonly HunterInputSetting[] = ['auto', 'midi', 'microphone', 'virtual'];

export function sanitizeHunterSettings(raw: unknown): HunterSettings {
  const d = DEFAULT_HUNTER_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const s = raw as Partial<Record<keyof HunterSettings, unknown>>;
  const range = TARGET_RANGES.find((r) => r.id === s.rangeId) ?? TARGET_RANGES[0];
  const targets = Array.isArray(s.targets) ? [...new Set(s.targets.filter((m): m is number => Number.isInteger(m) && m >= range.from && m <= range.to))] : d.targets;
  return {
    songId: typeof s.songId === 'string' ? s.songId : d.songId,
    rangeId: range.id,
    targets: targets.sort((a, b) => a - b),
    bpm: typeof s.bpm === 'number' ? clampBpm(s.bpm) : d.bpm,
    mode: MODES.includes(s.mode as HunterMode) ? (s.mode as HunterMode) : d.mode,
    showNames: typeof s.showNames === 'boolean' ? s.showNames : d.showNames,
    keyLabels: typeof s.keyLabels === 'boolean' ? s.keyLabels : d.keyLabels,
    input: INPUTS.includes(s.input as HunterInputSetting) ? (s.input as HunterInputSetting) : d.input,
    headphones: typeof s.headphones === 'boolean' ? s.headphones : d.headphones,
  };
}

export function loadHunterSettings(): HunterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitizeHunterSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_HUNTER_SETTINGS };
  }
}

export function saveHunterSettings(s: HunterSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}
