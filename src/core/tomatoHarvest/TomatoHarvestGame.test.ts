import { describe, expect, it } from 'vitest';
import { TomatoHarvestGame, tomatoAccuracy, tomatoStars, type TomatoDifficulty } from './TomatoHarvestGame';

const make = (difficulty: TomatoDifficulty = 'easy', random = () => 0) => new TomatoHarvestGame({ difficulty, random, profileId: 'p1' });
const correct = (game: TomatoHarvestGame, time: number) => game.answer(game.getState().targetNote, time);

function playTo(game: TomatoHarvestGame, count: number, start = 1): number {
  let now = start;
  if (game.getState().gameStatus === 'ready') game.start(now++);
  while (game.getState().harvestedCount < count && game.getState().gameStatus !== 'won') {
    game.tick(now);
    if (game.getState().gameStatus === 'waitingForRegrowth') {
      now += 3001;
      game.tick(now);
    }
    correct(game, now++);
  }
  return now;
}

describe('TomatoHarvestGame', () => {
  it('bắt đầu với 5 cây, mỗi cây 5 quả và cây 1 đang hoạt động', () => {
    const game = make();
    expect(game.getState().plants.map((p) => p.tomatoes.length)).toEqual([5, 5, 5, 5, 5]);
    expect(game.getState().activePlantIndex).toBe(0);
  });

  it('một nốt đúng chỉ hái đúng một quả và không chuyển cây sớm', () => {
    const game = make();
    game.start(0);
    const pressed = game.getState().targetNote;
    correct(game, 1);
    expect(game.getState().harvestedCount).toBe(1);
    expect(game.getState().plants[0].tomatoes).toHaveLength(4);
    expect(game.getState().activePlantIndex).toBe(0);
    expect(game.answer(pressed, 1)).toBe('ignored');
  });

  it('đánh sai giữ nguyên nốt và không hái quả', () => {
    const game = make();
    game.start(0);
    const target = game.getState().targetNote;
    game.answer(target + 1, 1);
    expect(game.getState().targetNote).toBe(target);
    expect(game.getState().harvestedCount).toBe(0);
    expect(game.getState().plants[0].tomatoes).toHaveLength(5);
  });

  it('hái hết cây mới chuyển đúng sang cây kế tiếp và mọc lại sau 2–3 giây', () => {
    const game = make();
    const now = playTo(game, 5);
    expect(game.getState().activePlantIndex).toBe(1);
    expect(game.getState().plants[0].tomatoes).toHaveLength(0);
    game.tick(now + 1998);
    expect(game.getState().plants[0].tomatoes).toHaveLength(0);
    game.tick(now + 3001);
    expect(game.getState().plants[0].tomatoes).toHaveLength(5);
  });

  it('nếu cả 5 cây trống thì chờ, rồi tiếp tục khi cây mọc lại', () => {
    const game = make('hard');
    game.start(0);
    let now = 1;
    for (let round = 0; round < 10 && game.getState().gameStatus !== 'waitingForRegrowth'; round++) {
      const wrong = game.getState().targetNote === 60 ? 62 : 60;
      game.answer(wrong, now++);
      game.answer(wrong, now++);
      game.answer(wrong, now++);
      if (game.getState().gameStatus === 'playing') correct(game, now++);
    }
    expect(game.getState().gameStatus).toBe('waitingForRegrowth');
    game.tick(now + 3001);
    expect(game.getState().gameStatus).toBe('playing');
    expect(game.getState().plants.some((p) => p.tomatoes.length === 5)).toBe(true);
  });

  it('cấp Dễ không trừ điểm, cấp Vừa trừ 2 nhưng không âm', () => {
    const easy = make('easy');
    easy.start(0);
    easy.answer(61, 1);
    expect(easy.getState().score).toBe(0);
    const medium = make('medium');
    medium.start(0);
    correct(medium, 1);
    expect(medium.getState().score).toBe(1);
    medium.answer(61, 2);
    expect(medium.getState().score).toBe(0);
    medium.answer(61, 3);
    expect(medium.getState().score).toBe(0);
  });

  it.each([1, 2])('cấp Khó sai %i lần rồi đúng chỉ gọi một đợt sâu', (wrongs) => {
    const game = make('hard');
    game.start(0);
    for (let i = 0; i < wrongs; i++) game.answer(61, i + 1);
    correct(game, 10);
    const attacks = game.getState().eventLog.filter((e) => e.event.type === 'worms');
    expect(attacks).toHaveLength(1);
  });

  it('sai lần 3 tấn công cây nhiều quả nhất; lần 4 không tấn công thêm', () => {
    const game = make('hard');
    game.start(0);
    game.answer(61, 1);
    game.answer(61, 2);
    game.answer(61, 3);
    expect(game.getState().plants[0].tomatoes).toHaveLength(0);
    expect(game.getState().eventLog.filter((e) => e.event.type === 'worms')).toHaveLength(1);
    game.answer(61, 4);
    expect(game.getState().eventLog.filter((e) => e.event.type === 'worms')).toHaveLength(1);
  });

  it('khiên chặn sâu và chỉ tiêu hao một chiếc', () => {
    const game = make('hard');
    playTo(game, 5);
    expect(game.getState().shieldCount).toBe(1);
    game.answer(61, 20);
    game.answer(61, 21);
    game.answer(61, 22);
    expect(game.getState().shieldCount).toBe(0);
    expect(game.getState().plants.some((p) => p.tomatoes.length === 0)).toBe(true); // cây 1 trống do đã tự hái, không phải do sâu
    const attack = [...game.getState().eventLog].reverse().find((e) => e.event.type === 'worms')?.event;
    expect(attack).toMatchObject({ type: 'worms', blocked: true, eaten: 0 });
  });

  it('mưa ở mốc 10, bướm ở mốc 20 +3 điểm và không lặp mốc', () => {
    const game = make();
    playTo(game, 20);
    const rain = game.getState().eventLog.filter((e) => e.event.type === 'rain');
    const butterflies = game.getState().eventLog.filter((e) => e.event.type === 'butterfly');
    expect(rain.map((e) => (e.event as { milestone: number }).milestone)).toContain(10);
    expect(butterflies).toHaveLength(1);
    expect(game.getState().score).toBeGreaterThanOrEqual(23);
  });

  it('mỗi ván sinh đúng 3 hoặc 4 quả vàng, không vượt quota', () => {
    for (const random of [() => 0, () => 0.9]) {
      const game = make('easy', random);
      playTo(game, 50);
      const s = game.getState();
      expect([3, 4]).toContain(s.goldenTomatoQuota);
      expect(s.goldenTomatoesSpawned).toBe(s.goldenTomatoQuota);
      expect(s.goldenTomatoesHarvested + s.goldenTomatoesLost).toBeLessThanOrEqual(s.goldenTomatoesSpawned);
    }
  });

  it('quả vàng bị sâu ăn chỉ tăng bộ đếm mất, không cộng điểm hay tiến độ', () => {
    const game = make('hard', () => 0);
    let now = playTo(game, 3);
    expect(game.getState().plants[1].tomatoes[0].kind).toBe('golden');
    const score = game.getState().score;
    const harvested = game.getState().harvestedCount;
    const wrong = game.getState().targetNote === 60 ? 62 : 60;
    game.answer(wrong, now++);
    game.answer(wrong, now++);
    game.answer(wrong, now++);
    expect(game.getState().goldenTomatoesLost).toBe(1);
    expect(game.getState().goldenTomatoesHarvested).toBe(0);
    expect(game.getState().score).toBe(score);
    expect(game.getState().harvestedCount).toBe(harvested);
  });

  it('mưa và cây mọc lại chỉ phục hồi quả đỏ, không tạo vàng', () => {
    const game = make();
    const now = playTo(game, 10);
    const spawned = game.getState().goldenTomatoesSpawned;
    game.tick(now + 3001);
    expect(game.getState().goldenTomatoesSpawned).toBe(spawned);
    expect(game.getState().plants.flatMap((p) => p.tomatoes).filter((t) => t.kind === 'golden')).toHaveLength(0);
  });

  it('cà chua khổng lồ xuất hiện sau 30 quả, +10 điểm và chỉ tính một quả', () => {
    const game = make();
    let now = playTo(game, 30);
    expect(game.getState().giantTomatoTriggered).toBe(true);
    const beforeScore = game.getState().score;
    const beforeCount = game.getState().harvestedCount;
    correct(game, now++);
    expect(game.getState().giantTomatoHarvested).toBe(true);
    expect(game.getState().score - beforeScore).toBe(10);
    expect(game.getState().harvestedCount - beforeCount).toBe(1);
  });

  it('đủ 50 quả thì thắng và không thể hái quả 51', () => {
    const game = make();
    const now = playTo(game, 50);
    expect(game.getState().gameStatus).toBe('won');
    expect(game.answer(game.getState().targetNote, now + 1)).toBe('ignored');
    expect(game.getState().harvestedCount).toBe(50);
  });

  it('tạm dừng đóng băng thời điểm mọc lại', () => {
    const game = make();
    const now = playTo(game, 5);
    const due = game.getState().plants[0].regrowAt!;
    game.pause(now);
    game.tick(due + 10000);
    expect(game.getState().plants[0].tomatoes).toHaveLength(0);
    game.resume(now + 10000);
    expect(game.getState().plants[0].regrowAt).toBe(due + 10000);
  });

  it('tính độ chính xác và sao đúng ngưỡng', () => {
    expect(tomatoAccuracy({ totalCorrectNotes: 9, totalWrongNotes: 1 })).toBe(0.9);
    expect(tomatoStars(0.9)).toBe(3);
    expect(tomatoStars(0.7)).toBe(2);
    expect(tomatoStars(0.69)).toBe(1);
  });
});
