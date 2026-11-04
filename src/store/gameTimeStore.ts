import { useEffect } from 'react';
import { create } from 'zustand';

export const GAME_TIME_INITIAL_MS = 10 * 60_000;
export const GAME_TIME_LESSON_REWARD_MS = 10 * 60_000;
const STORAGE_KEY = 'vietpiano-game-time-v1';

type SavedBalances = Record<string, number>;

function readBalances(): SavedBalances {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0),
    );
  } catch {
    return {};
  }
}

function savedBalance(profileKey: string): number {
  return readBalances()[profileKey] ?? GAME_TIME_INITIAL_MS;
}

function writeBalance(profileKey: string, remainingMs: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readBalances(), [profileKey]: Math.max(0, Math.round(remainingMs)) }));
  } catch {
    // Vẫn giữ bộ đếm trong bộ nhớ nếu trình duyệt chặn localStorage.
  }
}

interface GameTimeStore {
  profileKey: string;
  remainingMs: number;
  activeGames: number;
  openGames: number;
  selectProfile: (profileKey: string) => void;
  consume: (elapsedMs: number) => void;
  rewardLesson: (profileKey: string) => void;
}

export const useGameTime = create<GameTimeStore>((set, get) => ({
  profileKey: 'guest',
  remainingMs: savedBalance('guest'),
  activeGames: 0,
  openGames: 0,
  selectProfile: (profileKey) => set({ profileKey, remainingMs: savedBalance(profileKey) }),
  consume: (elapsedMs) => {
    if (elapsedMs <= 0 || get().remainingMs <= 0) return;
    const remainingMs = Math.max(0, get().remainingMs - elapsedMs);
    writeBalance(get().profileKey, remainingMs);
    set({ remainingMs });
  },
  rewardLesson: (profileKey) => {
    const remainingMs = (get().profileKey === profileKey ? get().remainingMs : savedBalance(profileKey)) + GAME_TIME_LESSON_REWARD_MS;
    writeBalance(profileKey, remainingMs);
    if (get().profileKey === profileKey) set({ remainingMs });
  },
}));

/** Báo một game đang thực sự chạy; tự gỡ khi tạm dừng, kết thúc hoặc rời màn. */
export function useGameTimeNow(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useGameTime.setState((s) => ({ activeGames: s.activeGames + 1 }));
    return () => useGameTime.setState((s) => ({ activeGames: Math.max(0, s.activeGames - 1) }));
  }, [active]);
}

/** Báo một khung game đang mở, kể cả lúc xem hướng dẫn/kết quả, để luôn hiện quỹ thời gian. */
export function useGameTimeOpen(): void {
  useEffect(() => {
    useGameTime.setState((s) => ({ openGames: s.openGames + 1 }));
    return () => useGameTime.setState((s) => ({ openGames: Math.max(0, s.openGames - 1) }));
  }, []);
}

