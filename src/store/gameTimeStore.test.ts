import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_TIME_INITIAL_MS, GAME_TIME_LESSON_REWARD_MS, useGameTime } from './gameTimeStore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('quỹ thời gian chơi game', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
    useGameTime.setState({ profileKey: 'guest', remainingMs: GAME_TIME_INITIAL_MS, activeGames: 0, openGames: 0 });
  });

  it('bắt đầu với 10 phút và lưu thời gian còn lại sau khi chơi', () => {
    useGameTime.getState().consume(90_000);
    expect(useGameTime.getState().remainingMs).toBe(8.5 * 60_000);

    useGameTime.getState().selectProfile('guest');
    expect(useGameTime.getState().remainingMs).toBe(8.5 * 60_000);
  });

  it('cộng đúng 10 phút mỗi lần hoàn thành bài học', () => {
    useGameTime.getState().consume(4 * 60_000);
    useGameTime.getState().rewardLesson('guest');
    expect(useGameTime.getState().remainingMs).toBe(16 * 60_000);
    expect(GAME_TIME_LESSON_REWARD_MS).toBe(10 * 60_000);
  });

  it('giữ quỹ thời gian độc lập cho từng hồ sơ', () => {
    useGameTime.getState().consume(2 * 60_000);
    useGameTime.getState().selectProfile('bé-an');
    expect(useGameTime.getState().remainingMs).toBe(GAME_TIME_INITIAL_MS);

    useGameTime.getState().rewardLesson('bé-an');
    expect(useGameTime.getState().remainingMs).toBe(20 * 60_000);

    useGameTime.getState().selectProfile('guest');
    expect(useGameTime.getState().remainingMs).toBe(8 * 60_000);
  });

  it('không cho thời gian âm khi một nhịp đếm vượt quá số dư', () => {
    useGameTime.getState().consume(20 * 60_000);
    expect(useGameTime.getState().remainingMs).toBe(0);
  });
});
