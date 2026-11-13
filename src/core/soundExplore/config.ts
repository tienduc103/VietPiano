/**
 * "Khám phá âm thanh — Cao độ và Trường độ": cấu hình bài (ngưỡng phân loại, vùng cao / thấp, mức độ khó).
 *
 * Ngưỡng ngắn / dài ở đây là NGƯỠNG CỦA TRÒ CHƠI cho bé 4–6 tuổi, không phải định nghĩa nhạc lý.
 * Mọi giá trị chỉnh được ở giao diện phụ huynh và lưu theo hồ sơ (`storage.ts`).
 */

/** Mức 1 Khám phá · 2 Làm quen · 3 Thử thách (docs/sound-explore.md). */
export type ExploreLevel = 1 | 2 | 3;

export interface SoundExploreSettings {
  /** Mức độ khó; phụ huynh chọn tay hoặc chấp nhận gợi ý — KHÔNG tự tăng chỉ vì chơi lâu. */
  level: ExploreLevel;
  /** Nhấn ngắn hơn ngưỡng này = chạm vội / nảy phím → bỏ qua, không tính. */
  shortMinMs: number;
  /** Âm ngắn: shortMinMs … shortMaxMs. */
  shortMaxMs: number;
  /** Âm dài: từ longMinMs trở lên. Khoảng giữa shortMaxMs … longMinMs = chưa rõ → chỉ mời thử lại. */
  longMinMs: number;
  /** Nốt ≤ lowMax là vùng THẤP (bé tự đánh). */
  lowMax: number;
  /** Nốt ≥ highMin là vùng CAO (bé tự đánh). Giữa hai vùng = "ở giữa" → gợi ý đi xa hơn, không báo sai. */
  highMin: number;
  /** Khu vườn: 2 hay 4 lựa chọn (cao-dài / thấp-ngắn → thêm cao-ngắn / thấp-dài). 'auto' = theo kết quả. */
  gardenChoices: 'auto' | 2 | 4;
  /** Giảm chuyển động (mặc định theo `prefers-reduced-motion` của máy). */
  reducedMotion: boolean;
  /** Lật giao diện: bàn phím ở trên, cảnh ở dưới (màn hình đặt thấp / đàn đặt trên). */
  flipLayout: boolean;
  /** Tiếng hiệu ứng khi hoàn thành (chuông nhỏ). Không có âm báo thất bại. */
  effectSounds: boolean;
  /** Âm lượng hiệu ứng 0–1, luôn nhỏ hơn tiếng đàn. */
  effectVolume: number;
}

export const DEFAULT_SETTINGS: SoundExploreSettings = {
  level: 1,
  shortMinMs: 150,
  shortMaxMs: 700,
  longMinMs: 1500,
  lowMax: 57, // La3
  highMin: 72, // Đô5
  gardenChoices: 'auto',
  reducedMotion: false,
  flipLayout: false,
  effectSounds: true,
  effectVolume: 0.35,
};

/** Bàn phím ảo của bài: Đô3 … Đô6 (đủ rộng để thấy rõ trái thấp – phải cao). */
export const KEYBOARD_FROM = 48;
export const KEYBOARD_TO = 84;

/** Dải dùng để quy đổi cao độ → độ cao nhân vật (ngoài dải thì kẹp ở mép). */
export const PITCH_SPAN = { min: 36, max: 96 } as const;

/** Tham số riêng từng mức (phần không phụ thuộc phụ huynh). */
export interface LevelProfile {
  /** Nghe cao / thấp: nốt mẫu vùng thấp và vùng cao. */
  listenLow: readonly number[];
  listenHigh: readonly number[];
  /** Nghe so sánh: khoảng cách hai nốt liên tiếp (nửa cung), null = chưa dùng câu so sánh. */
  compareInterval: readonly number[] | null;
  /** Nghe chuỗi ba nốt lên / xuống (mức 3). */
  threeNoteRuns: boolean;
  /** Trường độ mẫu khi nghe (giây): ngắn, dài. */
  demoShortSec: number;
  demoLongSec: number;
  /** Đường bay theo giai điệu: số nốt. */
  pathLength: number;
  /** Nhắc lời dặn khi bé đang chờ (mức 1 nhắc liên tục, mức 3 chỉ khi cần). */
  remindAfterMs: number | null;
}

export const LEVEL_PROFILES: Record<ExploreLevel, LevelProfile> = {
  1: {
    listenLow: [48, 50, 52],
    listenHigh: [81, 83, 84],
    compareInterval: null,
    threeNoteRuns: false,
    demoShortSec: 0.3,
    demoLongSec: 2.2,
    pathLength: 3,
    remindAfterMs: 12000,
  },
  2: {
    listenLow: [53, 55, 57],
    listenHigh: [72, 74, 76],
    compareInterval: [7, 9, 12],
    threeNoteRuns: false,
    demoShortSec: 0.4,
    demoLongSec: 1.6,
    pathLength: 3,
    remindAfterMs: 20000,
  },
  3: {
    listenLow: [55, 57, 59],
    listenHigh: [67, 69, 71],
    compareInterval: [4, 5, 7],
    threeNoteRuns: true,
    demoShortSec: 0.4,
    demoLongSec: 1.5,
    pathLength: 4,
    remindAfterMs: null,
  },
};

export const LEVEL_LABEL: Record<ExploreLevel, string> = { 1: 'Mức 1 · Khám phá', 2: 'Mức 2 · Làm quen', 3: 'Mức 3 · Thử thách' };

const num = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : def;

/** Dữ liệu lưu cũ / hỏng → cài đặt hợp lệ. Bảo đảm thứ tự shortMin < shortMax < longMin, lowMax < highMin. */
export function sanitizeSettings(raw: unknown): SoundExploreSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const level = r.level === 2 || r.level === 3 ? r.level : 1;
  const shortMinMs = num(r.shortMinMs, 30, 400, d.shortMinMs);
  const shortMaxMs = Math.max(shortMinMs + 100, num(r.shortMaxMs, 200, 1500, d.shortMaxMs));
  const longMinMs = Math.max(shortMaxMs + 200, num(r.longMinMs, 600, 5000, d.longMinMs));
  const lowMax = num(r.lowMax, 36, 70, d.lowMax);
  const highMin = Math.max(lowMax + 3, num(r.highMin, 50, 96, d.highMin));
  const gardenChoices = r.gardenChoices === 2 || r.gardenChoices === 4 ? r.gardenChoices : 'auto';
  const effectVolume = typeof r.effectVolume === 'number' && Number.isFinite(r.effectVolume) ? Math.min(1, Math.max(0, r.effectVolume)) : d.effectVolume;
  return {
    level,
    shortMinMs,
    shortMaxMs,
    longMinMs,
    lowMax,
    highMin,
    gardenChoices,
    reducedMotion: r.reducedMotion === true,
    flipLayout: r.flipLayout === true,
    effectSounds: r.effectSounds !== false,
    effectVolume,
  };
}
