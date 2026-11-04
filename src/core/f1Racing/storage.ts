/** Cúp, kỷ lục, bảng xếp hạng gia đình và cài đặt của F1 Racing (localStorage, theo hồ sơ người học). */
import type { LearnerProfile } from '../profile/LearnerProfile';
import { CARS, DEFAULT_NAV, DIFFICULTIES, isCarId, type CarId, type F1Difficulty, type NavKeys } from './config';

export type TrophyId = 'bronze' | 'silver' | 'gold' | 'diamond';
export const TROPHY_ORDER: readonly TrophyId[] = ['bronze', 'silver', 'gold', 'diamond'];
export const TROPHY_INFO: Record<TrophyId, { icon: string; label: string; rule: string }> = {
  bronze: { icon: '🥉', label: 'Cúp Đồng', rule: 'Hoàn thành đường đua' },
  silver: { icon: '🥈', label: 'Cúp Bạc', rule: 'Độ chính xác từ 80%' },
  gold: { icon: '🥇', label: 'Cúp Vàng', rule: 'Độ chính xác từ 95%' },
  diamond: { icon: '💎', label: 'Cúp Kim cương', rule: 'Độ chính xác từ 95% và không va chạm' },
};

export function trophyFor(accuracy: number, collisions: number): TrophyId {
  if (accuracy >= 0.95) return collisions === 0 ? 'diamond' : 'gold';
  return accuracy >= 0.8 ? 'silver' : 'bronze';
}

export interface F1Run {
  profileId: string;
  difficulty: F1Difficulty;
  carId: CarId;
  timeMs: number;
  accuracy: number;
  correct: number;
  wrong: number;
  collisions: number;
  bestStreak: number;
  assistCount: number;
  trophy: TrophyId;
  achievedAt: number;
}

export interface F1Progress {
  version: 1;
  history: F1Run[];
  /** Ván tốt nhất: hồ sơ → độ khó. */
  best: Record<string, Partial<Record<F1Difficulty, F1Run>>>;
  /** Số cúp đã nhận: hồ sơ → độ khó → loại cúp. */
  trophies: Record<string, Partial<Record<F1Difficulty, Partial<Record<TrophyId, number>>>>>;
}

export interface F1Settings {
  carId: CarId;
  difficulty: F1Difficulty;
  nav: NavKeys;
  showNames: boolean;
  showKeyHint: boolean;
  musicOn: boolean;
  musicVolume: number;
  sfxOn: boolean;
  sfxVolume: number;
}

export const DEFAULT_F1_SETTINGS: F1Settings = {
  carId: CARS[0].id,
  difficulty: 'easy',
  nav: DEFAULT_NAV,
  showNames: true,
  showKeyHint: false,
  musicOn: true,
  musicVolume: 0.5,
  sfxOn: true,
  sfxVolume: 0.7,
};

const KEY = 'vietpiano.f1-racing.v1';
const SETTINGS_KEY = 'vietpiano.f1-racing.settings.v1';
const HISTORY_LIMIT = 200;
const DIFFS: readonly F1Difficulty[] = ['easy', 'medium', 'hard'];

const validDifficulty = (v: unknown): v is F1Difficulty => DIFFS.includes(v as F1Difficulty);
const validTrophy = (v: unknown): v is TrophyId => TROPHY_ORDER.includes(v as TrophyId);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validRun(r: unknown): r is F1Run {
  if (!r || typeof r !== 'object') return false;
  const x = r as Partial<F1Run>;
  return typeof x.profileId === 'string' && validDifficulty(x.difficulty) && isCarId(x.carId) && finite(x.timeMs) && finite(x.accuracy) && finite(x.collisions) && validTrophy(x.trophy);
}

export function sanitizeF1Progress(raw: unknown): F1Progress {
  const out: F1Progress = { version: 1, history: [], best: {}, trophies: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<F1Progress>;
  if (Array.isArray(r.history)) out.history = r.history.filter(validRun).slice(-HISTORY_LIMIT);
  if (r.best && typeof r.best === 'object') {
    for (const [id, levels] of Object.entries(r.best)) {
      if (!levels || typeof levels !== 'object') continue;
      out.best[id] = {};
      for (const d of DIFFS) if (validRun(levels[d])) out.best[id][d] = levels[d];
    }
  }
  if (r.trophies && typeof r.trophies === 'object') {
    for (const [id, levels] of Object.entries(r.trophies)) {
      if (!levels || typeof levels !== 'object') continue;
      out.trophies[id] = {};
      for (const d of DIFFS) {
        const counts = levels[d];
        if (!counts || typeof counts !== 'object') continue;
        const clean: Partial<Record<TrophyId, number>> = {};
        for (const t of TROPHY_ORDER) if (finite(counts[t]) && counts[t] > 0) clean[t] = counts[t];
        out.trophies[id][d] = clean;
      }
    }
  }
  return out;
}

export function loadF1Progress(): F1Progress {
  try {
    return sanitizeF1Progress(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return sanitizeF1Progress(null);
  }
}

/** So thời gian theo bước 0,1 giây (đúng độ chính xác hiển thị), để độ chính xác và số va chạm thật sự có tác dụng. */
const timeBucket = (ms: number) => Math.round(ms / 100);

/** Âm: `a` xếp trên `b`. Ưu tiên về đích nhanh, rồi độ chính xác cao, rồi ít va chạm. */
export function compareRuns(a: Pick<F1Run, 'timeMs' | 'accuracy' | 'collisions'>, b: Pick<F1Run, 'timeMs' | 'accuracy' | 'collisions'>): number {
  return timeBucket(a.timeMs) - timeBucket(b.timeMs) || b.accuracy - a.accuracy || a.collisions - b.collisions;
}

/** Mỗi chừng này mét đường cần một nốt đúng thì ván mới được lập kỷ lục và lên bảng xếp hạng. */
export const METRES_PER_REQUIRED_NOTE = 25;

/** Số nốt đúng tối thiểu của một độ khó: 20 / 40 / 60. Không đánh nốt mà xe vẫn chạy 100% → không được xếp hạng. */
export function minCorrectNotes(difficulty: F1Difficulty): number {
  return Math.ceil(DIFFICULTIES[difficulty].trackLength / METRES_PER_REQUIRED_NOTE);
}

/** Ván đủ nốt đúng để lập kỷ lục và lên bảng xếp hạng. */
export function qualifies(run: Pick<F1Run, 'correct' | 'difficulty'>): boolean {
  return run.correct >= minCorrectNotes(run.difficulty);
}

export interface RecordOutcome {
  progress: F1Progress;
  /** Ván này là kỷ lục cá nhân mới của hồ sơ ở độ khó này. */
  isRecord: boolean;
  /** Ván đủ nốt đúng tối thiểu; chưa đủ thì vẫn lưu lịch sử và cúp nhưng không lập kỷ lục. */
  qualified: boolean;
}

/** Kỷ lục cá nhân hợp lệ (đủ nốt đúng). Dữ liệu cũ có thể còn ván không đủ nốt → bỏ qua. */
export function personalBest(progress: F1Progress, profileId: string, difficulty: F1Difficulty): F1Run | undefined {
  const best = progress.best[profileId]?.[difficulty];
  return best && qualifies(best) ? best : undefined;
}

export function recordF1Run(progress: F1Progress, run: F1Run): RecordOutcome {
  const stored = progress.best[run.profileId]?.[run.difficulty];
  const previous = personalBest(progress, run.profileId, run.difficulty);
  const qualified = qualifies(run);
  const isRecord = qualified && (!previous || compareRuns(run, previous) < 0);
  const counts = progress.trophies[run.profileId]?.[run.difficulty] ?? {};
  const next: F1Progress = {
    version: 1,
    history: [...progress.history, run].slice(-HISTORY_LIMIT),
    best: { ...progress.best, [run.profileId]: { ...progress.best[run.profileId], [run.difficulty]: isRecord ? run : stored } },
    trophies: {
      ...progress.trophies,
      [run.profileId]: { ...progress.trophies[run.profileId], [run.difficulty]: { ...counts, [run.trophy]: (counts[run.trophy] ?? 0) + 1 } },
    },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Safari có thể không cho lưu cục bộ; ván chơi vẫn tiếp tục.
  }
  return { progress: next, isRecord, qualified };
}

/** Cúp cao nhất của hồ sơ ở một độ khó. */
export function topTrophy(progress: F1Progress, profileId: string, difficulty: F1Difficulty): TrophyId | null {
  const counts = progress.trophies[profileId]?.[difficulty];
  if (!counts) return null;
  for (let i = TROPHY_ORDER.length - 1; i >= 0; i--) if ((counts[TROPHY_ORDER[i]] ?? 0) > 0) return TROPHY_ORDER[i];
  return null;
}

export interface LeaderboardRow {
  profile: LearnerProfile;
  best: F1Run;
  top: TrophyId;
}

/** Bảng xếp hạng gia đình của một độ khó: mỗi hồ sơ một dòng (ván tốt nhất trong các ván đủ nốt đúng). */
export function f1Leaderboard(progress: F1Progress, profiles: readonly LearnerProfile[], difficulty: F1Difficulty): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const profile of profiles) {
    const best = personalBest(progress, profile.id, difficulty);
    if (best) rows.push({ profile, best, top: topTrophy(progress, profile.id, difficulty) ?? best.trophy });
  }
  return rows.sort((a, b) => compareRuns(a.best, b.best));
}

const clamp01 = (v: unknown, fallback: number) => (finite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const validMidi = (v: unknown, fallback: number) => (finite(v) && Number.isInteger(v) && v >= 21 && v <= 108 ? v : fallback);

export function sanitizeF1Settings(raw: unknown): F1Settings {
  const d = DEFAULT_F1_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Partial<F1Settings>;
  return {
    carId: isCarId(r.carId) ? r.carId : d.carId,
    difficulty: validDifficulty(r.difficulty) ? r.difficulty : d.difficulty,
    nav: { left: validMidi(r.nav?.left, d.nav.left), right: validMidi(r.nav?.right, d.nav.right) },
    showNames: r.showNames !== false,
    showKeyHint: r.showKeyHint === true,
    musicOn: r.musicOn !== false,
    musicVolume: clamp01(r.musicVolume, d.musicVolume),
    sfxOn: r.sfxOn !== false,
    sfxVolume: clamp01(r.sfxVolume, d.sfxVolume),
  };
}

export function loadF1Settings(): F1Settings {
  try {
    return sanitizeF1Settings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_F1_SETTINGS };
  }
}

export function saveF1Settings(settings: F1Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // không chặn trò chơi
  }
}

/** "1:23,4" hoặc "48,2 giây". */
export function formatRaceTime(ms: number): string {
  const tenths = Math.round(ms / 100);
  const min = Math.floor(tenths / 600);
  const sec = (tenths % 600) / 10;
  const secText = sec.toFixed(1).replace('.', ',');
  return min > 0 ? `${min}:${sec < 10 ? '0' : ''}${secText}` : `${secText} giây`;
}
