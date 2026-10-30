/**
 * Cài đặt gần nhất + kỷ lục trò Bóng bay ở localStorage. Kỷ lục theo hồ sơ người học, khoá
 * `<biến thể chế độ>:<độ khó>:<tốc độ>` (dùng lại bản ghi kiểu trò chơi tự do `games/arcade.ts`).
 * Lỗi đọc/ghi (chế độ riêng tư, bộ nhớ đầy) → bỏ qua, trò vẫn chạy.
 */
import { applyArcadeResult, sanitizeArcadeRecords, type ArcadeRecords } from '../games/arcade';
import { BALLOON_DIFFICULTIES, BALLOON_SPEEDS, type BalloonDifficulty, type BalloonSpeed } from './BalloonPopGame';
import { BALLOON_MODES, LETTERS, MODE_INFO, type BalloonLabelStyle, type BalloonMode, type HandChoice, type Letter } from './notes';

export interface BalloonSettings {
  mode: BalloonMode;
  /** Tay luyện (chế độ 1 tay / 7 nốt); chế độ khác bỏ qua. */
  hand: HandChoice;
  difficulty: BalloonDifficulty;
  speed: BalloonSpeed;
  /** Tên nốt CDEFGAB hay Đô Rê Mi Pha Sol La Si (trên bóng + phím đàn). */
  labelStyle: BalloonLabelStyle;
  /** Tô phím cần đánh trên piano ảo. */
  showTargetKey: boolean;
  /** Ngón tay + bàn tay cần đánh. */
  showFinger: boolean;
  /** Tên nốt trên phím đàn. */
  showKeyLabels: boolean;
  /** Tên nốt trên quả bóng (tắt → bóng hiện "?", đọc theo màu / phím tô). */
  showBalloonNames: boolean;
  /** Nốt bị ẩn tên — cả trên bóng lẫn phím đàn (ẩn từng nốt để tự nhớ). */
  hiddenLetters: Letter[];
  /** Tiếng nổ bóng + tiếng nốt khi bấm piano ảo. */
  sound: boolean;
}

export const DEFAULT_BALLOON_SETTINGS: BalloonSettings = {
  mode: 'one-hand',
  hand: 'right',
  difficulty: 'easy',
  speed: 'medium',
  labelStyle: 'solfege',
  showTargetKey: true,
  showFinger: true,
  showKeyLabels: true,
  showBalloonNames: true,
  hiddenLetters: [],
  sound: true,
};

const SETTINGS_KEY = 'vietpiano-balloon-pop-settings';

/** Tay hợp lệ của chế độ (chế độ không chọn tay → 'both'). */
export function handFor(mode: BalloonMode, hand: unknown): HandChoice {
  const hands = MODE_INFO[mode].hands;
  if (hands.length === 0) return 'both';
  return hands.includes(hand as HandChoice) ? (hand as HandChoice) : hands[0];
}

export function sanitizeBalloonSettings(raw: unknown): BalloonSettings {
  const d = DEFAULT_BALLOON_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, hiddenLetters: [] };
  const s = raw as Partial<Record<keyof BalloonSettings, unknown>>;
  const bool = (k: keyof BalloonSettings) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : (d[k] as boolean));
  const mode = BALLOON_MODES.includes(s.mode as BalloonMode) ? (s.mode as BalloonMode) : d.mode;
  return {
    mode,
    hand: handFor(mode, s.hand),
    difficulty: BALLOON_DIFFICULTIES.includes(s.difficulty as BalloonDifficulty) ? (s.difficulty as BalloonDifficulty) : d.difficulty,
    speed: BALLOON_SPEEDS.includes(s.speed as BalloonSpeed) ? (s.speed as BalloonSpeed) : d.speed,
    labelStyle: s.labelStyle === 'letter' || s.labelStyle === 'solfege' ? s.labelStyle : d.labelStyle,
    showTargetKey: bool('showTargetKey'),
    showFinger: bool('showFinger'),
    showKeyLabels: bool('showKeyLabels'),
    showBalloonNames: bool('showBalloonNames'),
    hiddenLetters: Array.isArray(s.hiddenLetters) ? LETTERS.filter((l) => (s.hiddenLetters as unknown[]).includes(l)) : [],
    sound: bool('sound'),
  };
}

export function loadBalloonSettings(): BalloonSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitizeBalloonSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeBalloonSettings(null);
  }
}

export function saveBalloonSettings(s: BalloonSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}

/** Biến thể nội dung: chế độ (+ tay nếu chế độ có chọn tay). */
export function variantId(s: Pick<BalloonSettings, 'mode' | 'hand'>): string {
  return MODE_INFO[s.mode].hands.length ? `${s.mode}-${s.hand}` : s.mode;
}

export const balloonKey = (s: Pick<BalloonSettings, 'mode' | 'hand' | 'difficulty' | 'speed'>) => `${variantId(s)}:${s.difficulty}:${s.speed}`;
const recordsKey = (profileKey: string) => `vietpiano-balloon-pop:${profileKey}`;

export function loadBalloonRecords(profileKey: string): ArcadeRecords {
  try {
    const raw = localStorage.getItem(recordsKey(profileKey));
    return raw ? sanitizeArcadeRecords(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Ghi kết quả một ván, trả về bản ghi mới. */
export function saveBalloonResult(profileKey: string, records: ArcadeRecords, key: string, result: { score: number; stars: number }): ArcadeRecords {
  const next = applyArcadeResult(records, key, result);
  try {
    localStorage.setItem(recordsKey(profileKey), JSON.stringify(next));
  } catch {
    // chỉ mất kỷ lục
  }
  return next;
}

/** Tổng sao thu được (mọi biến thể × độ khó × tốc độ). */
export function totalBalloonStars(records: ArcadeRecords): number {
  return Object.entries(records).reduce((sum, [, r]) => sum + r.bestStars, 0);
}
