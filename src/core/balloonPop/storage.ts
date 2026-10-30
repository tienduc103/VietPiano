/**
 * Cài đặt gần nhất + kỷ lục trò Bóng bay ở localStorage. Kỷ lục theo hồ sơ người học, khoá
 * `<biến thể chế độ>:<độ khó>:<tốc độ>` (dùng lại bản ghi kiểu trò chơi tự do `games/arcade.ts`).
 * Lỗi đọc/ghi (chế độ riêng tư, bộ nhớ đầy) → bỏ qua, trò vẫn chạy.
 */
import { applyArcadeResult, sanitizeArcadeRecords, type ArcadeRecords } from '../games/arcade';
import { BALLOON_DIFFICULTIES, BALLOON_SPEEDS, type BalloonDifficulty, type BalloonSpeed } from './BalloonPopGame';
import { BALLOON_MODES, LETTERS, MODE_INFO, type BalloonLabelStyle, type BalloonMode, type BalloonNote, type HandChoice, type Letter } from './notes';

/** Kiểu chơi: Thường (đủ số bóng, mạng, tăng tốc theo mốc) / Tìm nốt (chọn nốt, tốc độ theo đúng sai, sai 20 lần là hết). */
export type BalloonGameType = 'classic' | 'hunt';
export const BALLOON_GAME_TYPES: readonly BalloonGameType[] = ['classic', 'hunt'];
export const GAME_TYPE_LABEL: Record<BalloonGameType, string> = { classic: '🎈 Thường', hunt: '🔎 Tìm nốt' };

/** Tập nốt kiểu Tìm nốt: nốt của chế độ có tên đã chọn; không nốt nào trùng → cả tập của chế độ. */
export function huntPool(pool: readonly BalloonNote[], letters: readonly Letter[]): BalloonNote[] {
  const picked = pool.filter((n) => letters.includes(n.letter));
  return picked.length > 0 ? picked : [...pool];
}

/**
 * Cách hiện nốt trên bóng (một nút xoay vòng): tên Đô Rê Mi…, tên CDEFGAB, hình nốt trên khuông (trường độ ngẫu nhiên),
 * hoặc "?" — mỗi quả bay lên kèm tiếng nốt để nghe đoán.
 */
export type BalloonDisplay = 'solfege' | 'letter' | 'staff' | 'ear';
export const BALLOON_DISPLAYS: readonly BalloonDisplay[] = ['solfege', 'letter', 'staff', 'ear'];
export const DISPLAY_LABEL: Record<BalloonDisplay, string> = { solfege: 'Đô Rê Mi Pha Sol La Si', letter: 'C D E F G A B', staff: '♩ Hình nốt', ear: '? Nghe đoán nốt' };

/** Khoá của khuông nhạc trên bóng (chế độ Hình nốt) — khoá không vẽ trên bóng, chỉ chọn trong cài đặt. */
export type BalloonClef = 'treble' | 'bass' | 'alto';
export const BALLOON_CLEFS: readonly BalloonClef[] = ['treble', 'bass', 'alto'];
export const BALLOON_CLEF_LABEL: Record<BalloonClef, string> = { treble: 'Khoá Sol', bass: 'Khoá Fa', alto: 'Khoá Đô' };

/** Chế độ hiển thị kế tiếp; chuyển sang chế độ tên chữ thì tên phím đàn đổi theo. */
export function nextDisplay(s: Pick<BalloonSettings, 'display' | 'labelStyle'>): Pick<BalloonSettings, 'display' | 'labelStyle'> {
  const display = BALLOON_DISPLAYS[(BALLOON_DISPLAYS.indexOf(s.display) + 1) % BALLOON_DISPLAYS.length];
  return { display, labelStyle: display === 'letter' || display === 'solfege' ? display : s.labelStyle };
}

export interface BalloonSettings {
  game: BalloonGameType;
  /** Kiểu Tìm nốt: tên nốt cần đánh. */
  huntLetters: Letter[];
  mode: BalloonMode;
  /** Tay luyện (chế độ 1 tay / 7 nốt); chế độ khác bỏ qua. */
  hand: HandChoice;
  difficulty: BalloonDifficulty;
  speed: BalloonSpeed;
  /** Cách hiện nốt trên bóng. */
  display: BalloonDisplay;
  /** Khoá đọc hình nốt trên bóng. */
  staffClef: BalloonClef;
  /** Tên nốt CDEFGAB hay Đô Rê Mi Pha Sol La Si trên phím đàn (theo chế độ tên chữ gần nhất). */
  labelStyle: BalloonLabelStyle;
  /** Tô phím cần đánh trên piano ảo. */
  showTargetKey: boolean;
  /** Ngón tay + bàn tay cần đánh. */
  showFinger: boolean;
  /** Tên nốt trên phím đàn. */
  showKeyLabels: boolean;
  /** Nốt bị ẩn tên — cả trên bóng lẫn phím đàn (ẩn từng nốt để tự nhớ). */
  hiddenLetters: Letter[];
  /** Tiếng nổ bóng + tiếng nốt khi bấm piano ảo. */
  sound: boolean;
}

export const DEFAULT_BALLOON_SETTINGS: BalloonSettings = {
  game: 'classic',
  huntLetters: [...LETTERS],
  mode: 'one-hand',
  hand: 'right',
  difficulty: 'easy',
  speed: 'medium',
  display: 'solfege',
  staffClef: 'treble',
  labelStyle: 'solfege',
  showTargetKey: true,
  showFinger: true,
  showKeyLabels: true,
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
  if (!raw || typeof raw !== 'object') return { ...d, huntLetters: [...d.huntLetters], hiddenLetters: [] };
  const s = raw as Partial<Record<keyof BalloonSettings, unknown>>;
  const bool = (k: keyof BalloonSettings) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : (d[k] as boolean));
  const mode = BALLOON_MODES.includes(s.mode as BalloonMode) ? (s.mode as BalloonMode) : d.mode;
  const labelStyle = s.labelStyle === 'letter' || s.labelStyle === 'solfege' ? s.labelStyle : d.labelStyle;
  const huntLetters = Array.isArray(s.huntLetters) ? LETTERS.filter((l) => (s.huntLetters as unknown[]).includes(l)) : [];
  return {
    game: BALLOON_GAME_TYPES.includes(s.game as BalloonGameType) ? (s.game as BalloonGameType) : d.game,
    huntLetters: huntLetters.length > 0 ? huntLetters : [...d.huntLetters],
    mode,
    hand: handFor(mode, s.hand),
    difficulty: BALLOON_DIFFICULTIES.includes(s.difficulty as BalloonDifficulty) ? (s.difficulty as BalloonDifficulty) : d.difficulty,
    speed: BALLOON_SPEEDS.includes(s.speed as BalloonSpeed) ? (s.speed as BalloonSpeed) : d.speed,
    display: BALLOON_DISPLAYS.includes(s.display as BalloonDisplay) ? (s.display as BalloonDisplay) : labelStyle,
    staffClef: BALLOON_CLEFS.includes(s.staffClef as BalloonClef) ? (s.staffClef as BalloonClef) : d.staffClef,
    labelStyle,
    showTargetKey: bool('showTargetKey'),
    showFinger: bool('showFinger'),
    showKeyLabels: bool('showKeyLabels'),
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

/** Khoá kỷ lục; kiểu Tìm nốt tách riêng theo tập nốt đã chọn. */
export const balloonKey = (s: Pick<BalloonSettings, 'mode' | 'hand' | 'difficulty' | 'speed'> & Partial<Pick<BalloonSettings, 'game' | 'huntLetters'>>) =>
  `${variantId(s)}${s.game === 'hunt' ? `:hunt-${(s.huntLetters ?? []).join('')}` : ''}:${s.difficulty}:${s.speed}`;
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
