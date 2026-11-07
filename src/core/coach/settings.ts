/**
 * Cài đặt riêng của AI Piano Coach (localStorage, như cài đặt các trò chơi) — địa chỉ / model Ollama dùng chung Cài đặt → AI.
 * Đọc từ bộ nhớ ngoài luôn qua `sanitizeCoachSettings` (giá trị hỏng → mặc định).
 */
import type { CoachMode } from './types';
import type { PedalRule } from './scoring/analyzePedal';

export type CoachInputSetting = 'auto' | 'midi' | 'virtual' | 'microphone';

export interface CoachSettings {
  mode: CoachMode;
  input: CoachInputSetting;
  /** Tempo ghi bài, % tempo gợi ý của bài. */
  tempoPercent: number;
  metronome: boolean;
  /** Đếm vào một ô trước khi ghi. */
  countIn: boolean;
  pedalRule: PedalRule;
  /** Cửa sổ so sánh tiến bộ (3 / 5 / 10 lần gần nhất). */
  historyWindow: 3 | 5 | 10;
  aiTimeoutSec: number;
  aiRetries: number;
  /** Gửi tên học viên cho AI (mặc định tắt — chỉ gửi nhóm tuổi + trình độ). */
  aiShareName: boolean;
  lastLessonId: string | null;
}

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  mode: 'technical',
  input: 'auto',
  tempoPercent: 100,
  metronome: true,
  countIn: true,
  pedalRule: 'auto',
  historyWindow: 5,
  aiTimeoutSec: 60,
  aiRetries: 1,
  aiShareName: false,
  lastLessonId: null,
};

export const COACH_SETTINGS_KEY = 'vietpiano.coach.settings.v1';

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);

export function sanitizeCoachSettings(raw: unknown): CoachSettings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_COACH_SETTINGS;
  return {
    mode: s.mode === 'performance' || s.mode === 'progress' ? s.mode : 'technical',
    input: s.input === 'midi' || s.input === 'virtual' || s.input === 'microphone' ? s.input : 'auto',
    tempoPercent: clampInt(s.tempoPercent, 40, 150, d.tempoPercent),
    metronome: typeof s.metronome === 'boolean' ? s.metronome : d.metronome,
    countIn: typeof s.countIn === 'boolean' ? s.countIn : d.countIn,
    pedalRule: s.pedalRule === 'none-expected' ? 'none-expected' : 'auto',
    historyWindow: s.historyWindow === 3 || s.historyWindow === 10 ? s.historyWindow : 5,
    aiTimeoutSec: clampInt(s.aiTimeoutSec, 10, 300, d.aiTimeoutSec),
    aiRetries: clampInt(s.aiRetries, 0, 3, d.aiRetries),
    aiShareName: s.aiShareName === true,
    lastLessonId: typeof s.lastLessonId === 'string' && s.lastLessonId.length <= 200 ? s.lastLessonId : null,
  };
}

export function loadCoachSettings(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): CoachSettings {
  try {
    const raw = storage?.getItem(COACH_SETTINGS_KEY);
    return sanitizeCoachSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_COACH_SETTINGS };
  }
}

export function saveCoachSettings(s: CoachSettings, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try {
    storage?.setItem(COACH_SETTINGS_KEY, JSON.stringify(sanitizeCoachSettings(s)));
  } catch {
    // bộ nhớ đầy / bị chặn: giữ cài đặt trong phiên
  }
}
