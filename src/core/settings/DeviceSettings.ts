/**
 * DeviceSettings — cài đặt micro và hiển thị, lưu trong localStorage
 * (dữ liệu nhỏ, đọc đồng bộ khi khởi động).
 */
import type { NoteLabelStyle } from '../music/notes';
import { DEFAULT_RECOGNIZER_CONFIG } from '../audio/NoteRecognizer';
import { sanitizePosition, type FloatingPosition } from './floatingPosition';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, LOCAL_OLLAMA_URL, normalizeOllamaUrl } from '../feedback/OllamaClient';

export type ThemeSetting = 'system' | 'light' | 'dark';
/** wait = chờ đánh đúng mới chuyển; count = mỗi nốt nghe thấy chuyển một nốt; tempo = chạy theo nhịp. */
export type PracticeMode = 'wait' | 'count' | 'tempo';
/** Giao diện giáo trình: auto = theo tuổi hồ sơ người học (≤ 11 tuổi → Kids). */
export type UiModeSetting = 'auto' | 'kids' | 'adult';
/** Nguồn nốt cho giáo trình: auto = đàn MIDI nếu đã nối, không thì micro. Bàn phím ảo luôn dùng được. */
export type InputSourceSetting = 'auto' | 'microphone' | 'midi';
/** Cô giáo giọng nói: kids = chỉ ở giao diện Kids (bé chưa biết đọc), always = mọi giao diện, off = tắt. */
export type VoiceTeacherSetting = 'kids' | 'always' | 'off';

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
  /** Nút micro nổi ở mọi màn hình: bấm bật/tắt micro, hiện nốt đang nghe khi micro bật. */
  showFloatingNote: boolean;
  /** Vị trí nút nổi "Tải lại bản mới nhất" do người dùng kéo tới; null = góc trên bên trái. */
  reloadButtonPos: FloatingPosition | null;
  practiceMode: PracticeMode;
  /** Tốc độ chế độ chạy theo nhịp, % so với nhịp độ gợi ý của bài. */
  tempoPercent: number;
  /** Nhận nốt từ đàn nối dây MIDI (Web MIDI, Chrome/Edge máy tính); tự kết nối khi mở app. */
  midiEnabled: boolean;
  uiMode: UiModeSetting;
  inputSource: InputSourceSetting;
  /** Tiếng metronome khi dùng micro (mặc định tắt: micro có thể nghe nhầm tiếng click — dùng tai nghe thì bật). */
  metronomeWithMic: boolean;
  /** Nhận xét sau mỗi bài bằng AI cục bộ (Ollama trên máy này). Mặc định tắt. */
  aiCoachEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  voiceTeacher: VoiceTeacherSetting;
  /** Nút loa trên màn học: tạm tắt tiếng (vẫn hiện chữ hướng dẫn). */
  voiceMuted: boolean;
  /** Tốc độ đọc (1 = bình thường). */
  voiceRate: number;
  /** Tự đọc hướng dẫn: lời dặn, nốt cần đánh, nhắc khi bé chưa đánh. */
  voiceAutoRead: boolean;
  /** Khen khi đúng, chúc mừng khi xong. */
  voiceEncourage: boolean;
  /** Nhắc lại sau chừng này giây bé chưa thao tác; 0 = không nhắc. */
  voiceRemindSec: number;
  /** Tên giọng đã chọn; '' = tự chọn (giọng nữ miền Bắc nếu có). */
  voiceName: string;
  /** Cho dùng giọng trực tuyến của trình duyệt (gửi câu đọc lên máy chủ của Microsoft / Google). Mặc định tắt. */
  voiceAllowOnline: boolean;
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
  showFloatingNote: true,
  reloadButtonPos: null,
  practiceMode: 'wait',
  tempoPercent: 100,
  midiEnabled: false,
  uiMode: 'auto',
  inputSource: 'auto',
  metronomeWithMic: false,
  aiCoachEnabled: false,
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  voiceTeacher: 'kids',
  voiceMuted: false,
  voiceRate: 0.85,
  voiceAutoRead: true,
  voiceEncourage: true,
  voiceRemindSec: 10,
  voiceName: '',
  voiceAllowOnline: false,
};

export const VOICE_RATE_MIN = 0.5;
export const VOICE_RATE_MAX = 1.3;
export const VOICE_REMIND_MAX_SEC = 60;

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
    const parsed = JSON.parse(raw) as Partial<DeviceSettings> & { tempoMode?: unknown };
    // Bản v1.04 lưu cờ tempoMode thay vì practiceMode.
    if (parsed.practiceMode === undefined && parsed.tempoMode === true) parsed.practiceMode = 'tempo';
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
    showFloatingNote: Boolean(s.showFloatingNote),
    reloadButtonPos: sanitizePosition(s.reloadButtonPos),
    practiceMode: sanitizeMode(s),
    tempoPercent: Math.round(num(s.tempoPercent, 100, TEMPO_PERCENT_MIN, TEMPO_PERCENT_MAX)),
    midiEnabled: s.midiEnabled === true,
    uiMode: s.uiMode === 'kids' || s.uiMode === 'adult' ? s.uiMode : 'auto',
    inputSource: s.inputSource === 'microphone' || s.inputSource === 'midi' ? s.inputSource : 'auto',
    metronomeWithMic: s.metronomeWithMic === true,
    aiCoachEnabled: s.aiCoachEnabled === true,
    ollamaUrl: sanitizeOllamaUrl(s.ollamaUrl),
    ollamaModel: typeof s.ollamaModel === 'string' && s.ollamaModel.trim() ? s.ollamaModel.trim().slice(0, 100) : DEFAULT_OLLAMA_MODEL,
    voiceTeacher: s.voiceTeacher === 'always' || s.voiceTeacher === 'off' ? s.voiceTeacher : 'kids',
    voiceMuted: s.voiceMuted === true,
    voiceRate: Math.round(num(s.voiceRate, DEFAULT_SETTINGS.voiceRate, VOICE_RATE_MIN, VOICE_RATE_MAX) * 100) / 100,
    voiceAutoRead: s.voiceAutoRead !== false,
    voiceEncourage: s.voiceEncourage !== false,
    voiceRemindSec: sanitizeRemind(s.voiceRemindSec),
    voiceName: typeof s.voiceName === 'string' ? s.voiceName.slice(0, 200) : '',
    voiceAllowOnline: s.voiceAllowOnline === true,
  };
}

/** 0 = không nhắc, còn lại 5–60 giây. */
function sanitizeRemind(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_SETTINGS.voiceRemindSec;
  return v <= 0 ? 0 : Math.round(Math.min(VOICE_REMIND_MAX_SEC, Math.max(5, v)));
}

function sanitizeMode({ practiceMode: m }: DeviceSettings): PracticeMode {
  return m === 'count' || m === 'tempo' ? m : 'wait';
}

export function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Địa chỉ cũ mặc định (localhost) → "auto": auto vẫn thử localhost, thêm proxy của app cho iPad trong LAN. */
function sanitizeOllamaUrl(raw: unknown): string {
  const u = typeof raw === 'string' ? normalizeOllamaUrl(raw) : null;
  return !u || u === LOCAL_OLLAMA_URL ? DEFAULT_OLLAMA_URL : u;
}
