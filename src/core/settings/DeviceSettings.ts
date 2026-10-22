/**
 * DeviceSettings — cài đặt micro và hiển thị, lưu trong localStorage
 * (dữ liệu nhỏ, đọc đồng bộ khi khởi động).
 */
import type { NoteLabelStyle } from '../music/notes';
import { DEFAULT_RECOGNIZER_CONFIG } from '../audio/NoteRecognizer';

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface DeviceSettings {
  /** Tần số chuẩn A4 (Clavinova cho phép chỉnh 414.8–466.8 Hz, mặc định 440). */
  a4: number;
  /** Ngưỡng RMS coi là có âm thanh. Thấp hơn = nhạy hơn. */
  noiseGate: number;
  /** Độ tin cậy YIN tối thiểu. */
  minConfidence: number;
  /** Thời gian cao độ phải ổn định (ms). */
  stableMs: number;
  /** Tỉ lệ tăng năng lượng để coi là nốt được đánh lại. */
  onsetRatio: number;
  /** Chấp nhận đúng nốt sai quãng tám. */
  octaveTolerant: boolean;
  showNoteNames: boolean;
  labelStyle: NoteLabelStyle;
  theme: ThemeSetting;
  showKeyboard: boolean;
  /** Chế độ khuông nhạc tự chạy theo nhịp (không xét đúng/sai cao độ). */
  tempoMode: boolean;
  /** Tốc độ chế độ chạy theo nhịp, % so với nhịp độ gợi ý của bài. */
  tempoPercent: number;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  a4: 440,
  noiseGate: DEFAULT_RECOGNIZER_CONFIG.noiseGate,
  minConfidence: DEFAULT_RECOGNIZER_CONFIG.minConfidence,
  stableMs: DEFAULT_RECOGNIZER_CONFIG.stableMs,
  onsetRatio: DEFAULT_RECOGNIZER_CONFIG.onsetRatio,
  octaveTolerant: false,
  showNoteNames: true,
  labelStyle: 'letter',
  theme: 'system',
  showKeyboard: true,
  tempoMode: false,
  tempoPercent: 100,
};

export const TEMPO_PERCENT_MIN = 40;
export const TEMPO_PERCENT_MAX = 160;

export const NOISE_GATE_MIN = 0.0005;
export const NOISE_GATE_MAX = 0.05;

/**
 * Thanh trượt "độ nhạy" 0–100 ánh xạ theo thang log sang noise gate:
 * 0 → 0.05 (kém nhạy), 100 → 0.0005 (rất nhạy).
 */
export function sensitivityToNoiseGate(sensitivity: number): number {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  return NOISE_GATE_MAX * Math.pow(NOISE_GATE_MIN / NOISE_GATE_MAX, s);
}

export function noiseGateToSensitivity(gate: number): number {
  const g = Math.min(NOISE_GATE_MAX, Math.max(NOISE_GATE_MIN, gate));
  // `|| 0` đổi -0 thành 0.
  return Math.round((Math.log(g / NOISE_GATE_MAX) / Math.log(NOISE_GATE_MIN / NOISE_GATE_MAX)) * 100) || 0;
}

/** Noise gate đề xuất từ mức nhiễu nền đo được khi hiệu chuẩn. */
export function noiseGateFromAmbient(ambientRms: number): number {
  return Math.min(NOISE_GATE_MAX, Math.max(0.002, ambientRms * 3));
}

const STORAGE_KEY = 'vietpiano.settings.v1';

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): DeviceSettings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DeviceSettings>;
    return sanitize({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: DeviceSettings, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Safari private mode hoặc hết dung lượng: bỏ qua, cài đặt chỉ sống trong phiên.
  }
}

function sanitize(s: DeviceSettings): DeviceSettings {
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  return {
    a4: num(s.a4, 440, 400, 480),
    noiseGate: num(s.noiseGate, DEFAULT_SETTINGS.noiseGate, NOISE_GATE_MIN, NOISE_GATE_MAX),
    minConfidence: num(s.minConfidence, DEFAULT_SETTINGS.minConfidence, 0.5, 0.99),
    stableMs: num(s.stableMs, DEFAULT_SETTINGS.stableMs, 20, 500),
    onsetRatio: num(s.onsetRatio, DEFAULT_SETTINGS.onsetRatio, 1.1, 3),
    octaveTolerant: Boolean(s.octaveTolerant),
    showNoteNames: Boolean(s.showNoteNames),
    labelStyle: s.labelStyle === 'solfege' ? 'solfege' : 'letter',
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    showKeyboard: Boolean(s.showKeyboard),
    tempoMode: Boolean(s.tempoMode),
    tempoPercent: Math.round(num(s.tempoPercent, 100, TEMPO_PERCENT_MIN, TEMPO_PERCENT_MAX)),
  };
}

export function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
