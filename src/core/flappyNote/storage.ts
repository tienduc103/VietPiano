/**
 * Cài đặt gần nhất + kỷ lục Flappy Note ở localStorage. Kỷ lục theo hồ sơ người học, khoá
 * `<levelId>:<difficulty>` (dùng lại bản ghi kiểu trò chơi tự do `games/arcade.ts`).
 * Lỗi đọc/ghi (chế độ riêng tư, bộ nhớ đầy) → bỏ qua, trò vẫn chạy.
 */
import { applyArcadeResult, sanitizeArcadeRecords, type ArcadeRecords } from '../games/arcade';
import type { GameRecord } from '../curriculum/progress';
import type { FlappyDifficulty, FlappyMode } from './FlappyNoteGame';
import { FLAPPY_LEVELS, findLevel } from './levels';

export interface FlappySettings {
  levelId: string;
  mode: FlappyMode;
  /** Giai điệu của chế độ Chuỗi nốt (theo màn). */
  melodyId: string;
  difficulty: FlappyDifficulty;
  showName: boolean;
  showFinger: boolean;
  /** Tô phím cần đánh trên piano ảo. */
  highlightKey: boolean;
  /** Hiện 3 nốt tiếp theo. */
  showUpcoming: boolean;
  /** Tiếng hiệu ứng (qua ống, va chạm) + tiếng nốt khi bấm piano ảo. */
  sound: boolean;
}

export const DEFAULT_FLAPPY_SETTINGS: FlappySettings = {
  levelId: FLAPPY_LEVELS[0].id,
  mode: 'random',
  melodyId: '',
  difficulty: 'easy',
  showName: true,
  showFinger: true,
  highlightKey: true,
  showUpcoming: true,
  sound: true,
};

const DIFFICULTIES: readonly FlappyDifficulty[] = ['easy', 'normal', 'hard'];
const SETTINGS_KEY = 'vietpiano-flappy-note-settings';

export function sanitizeFlappySettings(raw: unknown): FlappySettings {
  const d = DEFAULT_FLAPPY_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const s = raw as Partial<Record<keyof FlappySettings, unknown>>;
  const level = findLevel(String(s.levelId)) ?? FLAPPY_LEVELS[0];
  const melody = level.melodies.find((m) => m.id === s.melodyId) ?? level.melodies[0];
  const bool = (k: keyof FlappySettings) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : (d[k] as boolean));
  return {
    levelId: level.id,
    // Màn không có giai điệu → chỉ chơi ngẫu nhiên.
    mode: s.mode === 'sequence' && melody ? 'sequence' : 'random',
    melodyId: melody?.id ?? '',
    difficulty: DIFFICULTIES.includes(s.difficulty as FlappyDifficulty) ? (s.difficulty as FlappyDifficulty) : d.difficulty,
    showName: bool('showName'),
    showFinger: bool('showFinger'),
    highlightKey: bool('highlightKey'),
    showUpcoming: bool('showUpcoming'),
    sound: bool('sound'),
  };
}

export function loadFlappySettings(): FlappySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitizeFlappySettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_FLAPPY_SETTINGS };
  }
}

export function saveFlappySettings(s: FlappySettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}

export const flappyKey = (levelId: string, difficulty: FlappyDifficulty) => `${levelId}:${difficulty}`;
const recordsKey = (profileKey: string) => `vietpiano-flappy-note:${profileKey}`;

export function loadFlappyRecords(profileKey: string): ArcadeRecords {
  try {
    const raw = localStorage.getItem(recordsKey(profileKey));
    return raw ? sanitizeArcadeRecords(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Ghi kết quả một ván, trả về bản ghi mới. */
export function saveFlappyResult(profileKey: string, records: ArcadeRecords, key: string, result: { score: number; stars: number }): ArcadeRecords {
  const next = applyArcadeResult(records, key, result);
  try {
    localStorage.setItem(recordsKey(profileKey), JSON.stringify(next));
  } catch {
    // chỉ mất kỷ lục
  }
  return next;
}

/** Số sao tốt nhất của màn qua mọi độ khó. */
export function bestStarsOfLevel(records: ArcadeRecords, levelId: string): GameRecord | undefined {
  const all = DIFFICULTIES.map((d) => records[flappyKey(levelId, d)]).filter((r): r is GameRecord => !!r);
  if (all.length === 0) return undefined;
  return { plays: all.reduce((a, r) => a + r.plays, 0), bestScore: Math.max(...all.map((r) => r.bestScore)), bestStars: Math.max(...all.map((r) => r.bestStars)) };
}

/** Tổng sao thu được (sao tốt nhất của mỗi màn × độ khó) — phần thưởng hiện ở màn chọn. */
export function totalStars(records: ArcadeRecords): number {
  return FLAPPY_LEVELS.reduce((sum, l) => sum + DIFFICULTIES.reduce((a, d) => a + (records[flappyKey(l.id, d)]?.bestStars ?? 0), 0), 0);
}

export const MAX_TOTAL_STARS = FLAPPY_LEVELS.length * DIFFICULTIES.length * 3;

/** Danh hiệu theo tổng sao (phần thưởng). */
export const FLAPPY_RANKS: readonly { stars: number; icon: string; title: string }[] = [
  { stars: 0, icon: '🥚', title: 'Trứng nhạc' },
  { stars: 3, icon: '🐣', title: 'Chim non' },
  { stars: 9, icon: '🐤', title: 'Chim sẻ tập bay' },
  { stars: 18, icon: '🐦', title: 'Hoạ mi' },
  { stars: 30, icon: '🦜', title: 'Vẹt nhạc sĩ' },
  { stars: 45, icon: '🦅', title: 'Đại bàng piano' },
];

/** Danh hiệu hiện tại + danh hiệu kế tiếp (nếu còn). */
export function rankFor(total: number): { current: (typeof FLAPPY_RANKS)[number]; next?: (typeof FLAPPY_RANKS)[number] } {
  const i = FLAPPY_RANKS.filter((r) => total >= r.stars).length - 1;
  return { current: FLAPPY_RANKS[Math.max(0, i)], next: FLAPPY_RANKS[i + 1] };
}
