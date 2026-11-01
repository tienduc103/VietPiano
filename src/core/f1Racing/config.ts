/**
 * VietPiano F1 Racing — cấu hình thuần: độ khó, 5 mẫu xe, nốt luyện tập, phím điều hướng.
 * Mọi xe có cùng hiệu năng: `CarDef` chỉ khác hình dáng và màu sắc.
 */
import { isBlackKey } from '../music/notes';

export type F1Difficulty = 'easy' | 'medium' | 'hard';
export type CarId = 'red-flash' | 'blue-storm' | 'golden-star' | 'green-bolt' | 'purple-rocket';

export const LANE_COUNT = 3;
/** Thời gian chuyển sang làn kề (giây): xe trượt dần, không dịch chuyển tức thời. */
export const LANE_CHANGE_SEC = 0.25;
/** Chiều dài xe theo đơn vị thế giới (m). */
export const CAR_LENGTH = 8;
/** Nửa bề ngang xe, tính theo bề rộng làn. */
export const CAR_HALF_WIDTH = 0.26;

export const SPEED_STEP = 10;
export const STREAK_FOR_ASSIST = 10;
export const ASSIST_MS = 3000;
/** Miễn va chạm sau mỗi lần va chạm. */
export const IMMUNITY_MS = 1500;
export const COUNTDOWN_MS = 3000;

export interface DifficultyConfig {
  id: F1Difficulty;
  label: string;
  icon: string;
  summary: string;
  /** Tổng quãng đường (m). */
  trackLength: number;
  /** Tốc độ thật ở 100%: quyết định thời gian về đích tối thiểu. */
  maxSpeedMps: number;
  /** Nốt thấp nhất / cao nhất của tầm luyện tập. */
  lowMidi: number;
  highMidi: number;
  /** Khoảng trống giữa hai cụm chướng ngại (m), tính từ lúc xe đã qua cụm trước. */
  gapMin: number;
  gapMax: number;
  /** Xác suất một cụm chặn 2 làn. */
  twoLaneChance: number;
  /** Xác suất một cụm là xe đối thủ. */
  rivalChance: number;
  /** Có cho bật tên nốt + gợi ý phím. */
  helpAvailable: boolean;
}

export const DIFFICULTIES: Record<F1Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Dễ',
    icon: '🌱',
    summary: '500 m · nốt Đô4–Sol4 · ít chướng ngại · bật được tên nốt và gợi ý phím',
    trackLength: 500,
    maxSpeedMps: 10,
    lowMidi: 60,
    highMidi: 67,
    gapMin: 50,
    gapMax: 75,
    twoLaneChance: 0,
    rivalChance: 0,
    helpAvailable: true,
  },
  medium: {
    id: 'medium',
    label: 'Trung bình',
    icon: '🌻',
    summary: '1.000 m · nốt Đô4–Đô5 · chướng ngại dày hơn · cần chuyển làn linh hoạt',
    trackLength: 1000,
    maxSpeedMps: 12.5,
    lowMidi: 60,
    highMidi: 72,
    gapMin: 30,
    gapMax: 44,
    twoLaneChance: 0.25,
    rivalChance: 0,
    helpAvailable: false,
  },
  hard: {
    id: 'hard',
    label: 'Khó',
    icon: '🏆',
    summary: '1.500 m · nốt Sol3–Mi5 · nhiều chướng ngại · có xe đối thủ di chuyển',
    trackLength: 1500,
    maxSpeedMps: 15,
    lowMidi: 55,
    highMidi: 76,
    gapMin: 24,
    gapMax: 34,
    twoLaneChance: 0.45,
    rivalChance: 0.28,
    helpAvailable: false,
  },
};

export const DIFFICULTY_ORDER: readonly F1Difficulty[] = ['easy', 'medium', 'hard'];

/** Nốt luyện tập của một độ khó: các phím trắng trong tầm (đọc nốt không có dấu hoá). */
export function practiceNotes(difficulty: F1Difficulty): number[] {
  const { lowMidi, highMidi } = DIFFICULTIES[difficulty];
  const out: number[] = [];
  for (let m = lowMidi; m <= highMidi; m++) if (!isBlackKey(m)) out.push(m);
  return out;
}

export interface NavKeys {
  left: number;
  right: number;
}

export const DEFAULT_NAV: NavKeys = { left: 48, right: 50 };

/** Phím dự phòng khi phím điều hướng trùng tầm luyện tập: đều thấp hơn nốt thấp nhất của mọi độ khó (G3 = 55). */
const NAV_FALLBACKS = [48, 50, 47, 52, 45, 53, 43, 41, 40, 38, 36];

export interface ResolvedNav extends NavKeys {
  /** Có phím bị đổi so với lựa chọn của người chơi. */
  relocated: boolean;
}

/**
 * Tách phím điều hướng khỏi tầm nốt luyện tập: phím nằm trong [lowMidi, highMidi] (kể cả phím đen),
 * hoặc hai phím trùng nhau → tự đổi sang phím dự phòng, không để một phím mang hai nghĩa.
 */
export function resolveNavKeys(nav: NavKeys, difficulty: F1Difficulty): ResolvedNav {
  const { lowMidi, highMidi } = DIFFICULTIES[difficulty];
  const inRange = (m: number) => m >= lowMidi && m <= highMidi;
  let { left, right } = nav;
  if (inRange(left)) left = NAV_FALLBACKS.find((m) => m !== right && !inRange(m))!;
  if (inRange(right) || right === left) right = NAV_FALLBACKS.find((m) => m !== left && !inRange(m) && m > left) ?? NAV_FALLBACKS.find((m) => m !== left && !inRange(m))!;
  return { left, right, relocated: left !== nav.left || right !== nav.right };
}

/** Bàn phím ảo đủ cả nốt luyện tập và phím điều hướng; hai đầu là phím trắng. */
export function keyboardSpan(difficulty: F1Difficulty, nav: NavKeys): { from: number; to: number } {
  const { lowMidi, highMidi } = DIFFICULTIES[difficulty];
  let from = Math.min(lowMidi, nav.left, nav.right);
  let to = Math.max(highMidi, nav.left, nav.right);
  if (isBlackKey(from)) from -= 1;
  if (isBlackKey(to)) to += 1;
  return { from, to };
}

export type WingStyle = 'flat' | 'swept' | 'delta' | 'twin' | 'arrow';
export type LiveryMark = 'flash' | 'wave' | 'star' | 'bolt' | 'rocket';

export interface CarDef {
  id: CarId;
  name: string;
  body: string;
  bodyDark: string;
  accent: string;
  /** Màu lửa động cơ và quầng sáng. */
  flame: string;
  wing: WingStyle;
  mark: LiveryMark;
  /** Thân rộng / hẹp: chỉ khác hình vẽ, không ảnh hưởng va chạm. */
  podWidth: number;
}

export const CARS: readonly CarDef[] = [
  { id: 'red-flash', name: 'Red Flash', body: '#ef4444', bodyDark: '#991b1b', accent: '#ffffff', flame: '#fb923c', wing: 'swept', mark: 'flash', podWidth: 1 },
  { id: 'blue-storm', name: 'Blue Storm', body: '#2563eb', bodyDark: '#1e3a8a', accent: '#7dd3fc', flame: '#38bdf8', wing: 'flat', mark: 'wave', podWidth: 1.08 },
  { id: 'golden-star', name: 'Golden Star', body: '#f59e0b', bodyDark: '#b45309', accent: '#fef08a', flame: '#fde047', wing: 'delta', mark: 'star', podWidth: 0.95 },
  { id: 'green-bolt', name: 'Green Bolt', body: '#16a34a', bodyDark: '#14532d', accent: '#bef264', flame: '#a3e635', wing: 'twin', mark: 'bolt', podWidth: 1.04 },
  { id: 'purple-rocket', name: 'Purple Rocket', body: '#9333ea', bodyDark: '#581c87', accent: '#f0abfc', flame: '#e879f9', wing: 'arrow', mark: 'rocket', podWidth: 0.9 },
];

export const findCar = (id: string): CarDef => CARS.find((c) => c.id === id) ?? CARS[0];
export const isCarId = (id: unknown): id is CarId => CARS.some((c) => c.id === id);
