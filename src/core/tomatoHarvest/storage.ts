import type { LearnerProfile } from '../profile/LearnerProfile';
import type { TomatoDifficulty } from './TomatoHarvestGame';

export interface TomatoResult {
  id: string;
  profileId: string;
  difficulty: TomatoDifficulty;
  score: number;
  stars: 1 | 2 | 3;
  accuracy: number;
  durationMs: number;
  goldenHarvested: number;
  correct: number;
  wrong: number;
  achievedAt: number;
}

export interface TomatoBest {
  stars: 1 | 2 | 3;
  accuracy: number;
  durationMs: number;
  score: number;
  achievedAt: number;
}

export interface TomatoProgress {
  version: 1;
  history: TomatoResult[];
  best: Record<string, Partial<Record<TomatoDifficulty, TomatoBest>>>;
}

export interface TomatoAudioSettings {
  music: boolean;
  nature: boolean;
}

const KEY = 'vietpiano.tomato-harvest.v1';
const AUDIO_KEY = 'vietpiano.tomato-harvest.audio.v1';
const EMPTY: TomatoProgress = { version: 1, history: [], best: {} };

const validDifficulty = (v: unknown): v is TomatoDifficulty => v === 'easy' || v === 'medium' || v === 'hard';

export function sanitizeTomatoProgress(raw: unknown): TomatoProgress {
  if (!raw || typeof raw !== 'object') return structuredClone(EMPTY);
  const r = raw as Partial<TomatoProgress>;
  const history = Array.isArray(r.history)
    ? r.history.filter((x): x is TomatoResult => !!x && typeof x === 'object' && typeof x.profileId === 'string' && validDifficulty(x.difficulty) && typeof x.score === 'number').slice(-100)
    : [];
  const best: TomatoProgress['best'] = {};
  if (r.best && typeof r.best === 'object') {
    for (const [profileId, levels] of Object.entries(r.best)) {
      if (!levels || typeof levels !== 'object') continue;
      best[profileId] = {};
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const b = levels[difficulty];
        if (b && typeof b === 'object' && [1, 2, 3].includes(b.stars) && Number.isFinite(b.accuracy) && Number.isFinite(b.durationMs)) best[profileId][difficulty] = b;
      }
    }
  }
  return { version: 1, history, best };
}

export function loadTomatoProgress(): TomatoProgress {
  try {
    return sanitizeTomatoProgress(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return structuredClone(EMPTY);
  }
}

function better(a: TomatoBest, b: TomatoBest): boolean {
  return a.stars > b.stars || (a.stars === b.stars && (a.accuracy > b.accuracy || (a.accuracy === b.accuracy && a.durationMs < b.durationMs)));
}

export function recordTomatoResult(progress: TomatoProgress, result: Omit<TomatoResult, 'id'>): TomatoProgress {
  const entry: TomatoResult = { ...result, id: `${result.profileId}:${result.difficulty}:${result.achievedAt}` };
  const candidate: TomatoBest = { stars: result.stars, accuracy: result.accuracy, durationMs: result.durationMs, score: result.score, achievedAt: result.achievedAt };
  const previous = progress.best[result.profileId]?.[result.difficulty];
  const next = {
    version: 1 as const,
    history: [...progress.history, entry].slice(-100),
    best: {
      ...progress.best,
      [result.profileId]: {
        ...progress.best[result.profileId],
        [result.difficulty]: !previous || better(candidate, previous) ? candidate : previous,
      },
    },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Trò chơi vẫn chạy khi Safari không cho lưu cục bộ.
  }
  return next;
}

export function tomatoLeaderboard(progress: TomatoProgress, profiles: LearnerProfile[], difficulty: TomatoDifficulty) {
  return profiles
    .map((profile) => ({ profile, best: progress.best[profile.id]?.[difficulty] }))
    .filter((row): row is { profile: LearnerProfile; best: TomatoBest } => !!row.best)
    .sort((a, b) => b.best.stars - a.best.stars || b.best.accuracy - a.best.accuracy || a.best.durationMs - b.best.durationMs);
}

export function loadTomatoAudio(): TomatoAudioSettings {
  try {
    const r = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? '{}') as Partial<TomatoAudioSettings>;
    return { music: r.music !== false, nature: r.nature !== false };
  } catch {
    return { music: true, nature: true };
  }
}

export function saveTomatoAudio(settings: TomatoAudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    // không chặn trò chơi
  }
}

export const TOMATO_DIFFICULTY_LABEL: Record<TomatoDifficulty, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };
export const TOMATO_TROPHY: Record<TomatoDifficulty, { icon: string; label: string }> = {
  easy: { icon: '🥉', label: 'Cúp Đồng' },
  medium: { icon: '🥈', label: 'Cúp Bạc' },
  hard: { icon: '🥇', label: 'Cúp Vàng' },
};
