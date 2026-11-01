import { describe, expect, it } from 'vitest';
import { ASSIST_MS, COUNTDOWN_MS, DIFFICULTIES, DEFAULT_NAV, IMMUNITY_MS, practiceNotes } from './config';
import { F1RacingGame, f1Accuracy, type F1Event, type F1Options } from './F1RacingGame';
import type { Obstacle } from './track';

const FRAME = 1000 / 60;
const TARGET_A = 60;
const TARGET_B = 62;
const WRONG = 71;

/** RNG lặp lại được. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Sim {
  now = 0;
  readonly game: F1RacingGame;
  readonly events: F1Event[] = [];
  constructor(options: Partial<F1Options> = {}) {
    this.game = new F1RacingGame({ difficulty: 'easy', obstacles: [], notes: [TARGET_A, TARGET_B], ...options });
    this.game.onEvent((e) => this.events.push(e));
  }
  /** Chạy `ms` thời gian thật theo từng khung. */
  run(ms: number, frame = FRAME) {
    const end = this.now + ms;
    while (this.now < end - 1e-9) {
      this.now = Math.min(end, this.now + frame);
      this.game.tick(this.now);
    }
    return this;
  }
  race() {
    this.game.start(this.now);
    return this.run(COUNTDOWN_MS + 20);
  }
  /** Nhấn rồi thả, như một lần gõ phím thật. */
  tap(midi: number) {
    const r = this.game.noteOn(midi);
    this.game.noteOff(midi);
    return r;
  }
  hit() {
    return this.tap(this.game.getState().target);
  }
  get s() {
    return this.game.getState();
  }
  get w() {
    return this.game.getWorld();
  }
}

const cone = (at: number, lane = 1, id = 1): Obstacle => ({ id, kind: 'cone', lanes: [lane], at });

describe('tốc độ', () => {
  it('xuất phát 100%; đánh đúng tăng đúng 10 điểm, đánh sai giảm đúng 10 điểm', () => {
    const sim = new Sim().race();
    expect(sim.s.speedPercent).toBe(100);
    sim.tap(WRONG);
    expect(sim.s.speedPercent).toBe(90);
    sim.tap(WRONG);
    expect(sim.s.speedPercent).toBe(80);
    expect(sim.hit()).toBe('correct');
    expect(sim.s.speedPercent).toBe(90);
  });

  it('không vượt 100% và không thấp hơn 0%', () => {
    const sim = new Sim().race();
    sim.hit();
    expect(sim.s.speedPercent).toBe(100);
    for (let i = 0; i < 15; i++) sim.tap(WRONG);
    expect(sim.s.speedPercent).toBe(0);
    sim.hit();
    expect(sim.s.speedPercent).toBe(10);
  });

  it('0% thì xe dừng hẳn, đường ngừng cuộn; đánh đúng thì chạy lại', () => {
    const sim = new Sim().race();
    for (let i = 0; i < 10; i++) sim.tap(WRONG);
    sim.run(1000);
    const stopped = sim.w.distance;
    expect(sim.w.speed).toBe(0);
    sim.run(2000);
    expect(sim.w.distance).toBe(stopped);
    expect(sim.w.scroll).toBe(stopped);
    expect(sim.hit()).toBe('correct');
    sim.run(1000);
    expect(sim.w.speed).toBe(10);
    expect(sim.w.distance).toBeGreaterThan(stopped);
  });

  it('không tự giảm tốc khi không đánh gì (kể cả sau 3 giây)', () => {
    const sim = new Sim().race();
    sim.tap(WRONG);
    sim.hit();
    sim.tap(WRONG);
    expect(sim.s.speedPercent).toBe(90);
    sim.run(10_000);
    expect(sim.s.speedPercent).toBe(90);
  });

  it('tốc độ thật sự quyết định quãng đường: 50% đi được nửa quãng của 100%', () => {
    const full = new Sim().race();
    const half = new Sim().race();
    for (let i = 0; i < 5; i++) half.tap(WRONG);
    const a = full.w.distance;
    const b = half.w.distance;
    full.run(10_000);
    half.run(10_000);
    expect(half.w.distance - b).toBeCloseTo((full.w.distance - a) / 2, -0.5);
  });
});

describe('quãng đường và thời gian', () => {
  it('về đích đúng quãng đường, thời gian đúng theo tốc độ tối đa', () => {
    const sim = new Sim().race();
    const { trackLength, maxSpeedMps } = DIFFICULTIES.easy;
    sim.run(((trackLength / maxSpeedMps) * 1000) + 500);
    expect(sim.s.status).toBe('finished');
    expect(sim.w.distance).toBe(trackLength);
    expect(sim.s.distanceM).toBe(trackLength);
    expect(Math.abs(sim.game.raceTimeMs - (trackLength / maxSpeedMps) * 1000)).toBeLessThan(20);
    expect(sim.events.filter((e) => e.type === 'finish')).toHaveLength(1);
  });

  it('kết quả không phụ thuộc FPS', () => {
    const times = [24, 60, 144].map((fps) => {
      const sim = new Sim().race();
      sim.run(60_000, 1000 / fps);
      expect(sim.s.status).toBe('finished');
      return sim.game.raceTimeMs;
    });
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(20);
  });

  it('đếm ngược: chưa chạy và chưa chấm nốt, hết đếm ngược mới đua', () => {
    const sim = new Sim();
    sim.game.start(0);
    expect(sim.s.status).toBe('countdown');
    expect(sim.tap(sim.s.target)).toBe('ignored');
    sim.run(COUNTDOWN_MS - 100);
    expect(sim.s.status).toBe('countdown');
    expect(sim.w.distance).toBe(0);
    sim.run(200);
    expect(sim.s.status).toBe('racing');
  });
});

describe('nốt luyện tập', () => {
  it('đúng thì sang nốt tiếp, sai thì giữ nguyên nốt và mất chuỗi', () => {
    const sim = new Sim().race();
    sim.hit();
    expect(sim.s.target).toBe(TARGET_B);
    expect(sim.s.streak).toBe(1);
    expect(sim.tap(TARGET_A)).toBe('wrong');
    expect(sim.s.target).toBe(TARGET_B);
    expect(sim.s.streak).toBe(0);
    expect(sim.s.wrong).toBe(1);
  });

  it('giữ phím hoặc đàn gửi lặp Note On không tính lần nữa', () => {
    const sim = new Sim({ notes: [TARGET_A, TARGET_B, TARGET_A] }).race();
    expect(sim.game.noteOn(TARGET_A)).toBe('correct');
    sim.game.noteOn(TARGET_B);
    expect(sim.s.correct).toBe(2);
    // TARGET_B vẫn giữ, đàn gửi lại Note On: không đếm.
    expect(sim.game.noteOn(TARGET_B)).toBe('ignored');
    expect(sim.s.correct).toBe(2);
    expect(sim.s.wrong).toBe(0);
    sim.game.noteOff(TARGET_A);
    expect(sim.game.noteOn(TARGET_A)).toBe('correct');
  });

  it('khi đàn bị ngắt, phím đang giữ được coi là đã thả', () => {
    const sim = new Sim({ notes: [TARGET_A] }).race();
    sim.game.noteOn(TARGET_A);
    sim.game.clearHeld();
    expect(sim.game.noteOn(TARGET_A)).toBe('correct');
  });

  it('micro: âm ngân lặp nốt vừa đúng không bị tính sai', () => {
    const sim = new Sim().race();
    expect(sim.game.noteOn(TARGET_A, { hasRelease: false })).toBe('correct');
    expect(sim.game.noteOn(TARGET_A, { hasRelease: false })).toBe('ignored');
    sim.run(400);
    expect(sim.game.noteOn(TARGET_A, { hasRelease: false })).toBe('wrong');
  });

  it('so đúng cao độ MIDI: khác quãng tám là sai', () => {
    const sim = new Sim({ notes: [TARGET_A], difficulty: 'medium' }).race();
    expect(sim.tap(TARGET_A + 12)).toBe('wrong');
  });

  it('nốt sinh ra nằm trong tầm, phím trắng, hai nốt liền nhau không trùng', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const allowed = new Set(practiceNotes(difficulty));
      const sim = new Sim({ difficulty, notes: undefined, rng: seeded(7) }).race();
      let prev = sim.s.target;
      const seen = new Set([prev]);
      for (let i = 0; i < 200; i++) {
        sim.hit();
        expect(sim.s.target).not.toBe(prev);
        expect(allowed.has(sim.s.target)).toBe(true);
        prev = sim.s.target;
        seen.add(prev);
      }
      expect(seen.size).toBe(allowed.size);
    }
  });

  it('độ chính xác: đúng / (đúng + sai), nốt điều hướng không tính', () => {
    const sim = new Sim().race();
    sim.hit();
    sim.hit();
    sim.hit();
    sim.tap(WRONG);
    sim.tap(DEFAULT_NAV.left);
    sim.tap(DEFAULT_NAV.right);
    expect(f1Accuracy(sim.s.correct, sim.s.wrong)).toBe(0.75);
    expect(f1Accuracy(0, 0)).toBe(0);
  });
});

describe('điều hướng', () => {
  it('C3 sang trái, D3 sang phải, không tính thành nốt luyện tập', () => {
    const sim = new Sim().race();
    expect(sim.tap(DEFAULT_NAV.left)).toBe('nav');
    expect(sim.s.lane).toBe(0);
    expect(sim.tap(DEFAULT_NAV.right)).toBe('nav');
    expect(sim.s.lane).toBe(1);
    expect(sim.tap(DEFAULT_NAV.right)).toBe('nav');
    expect(sim.s.lane).toBe(2);
    expect(sim.s.correct).toBe(0);
    expect(sim.s.wrong).toBe(0);
    expect(sim.s.streak).toBe(0);
    expect(sim.s.speedPercent).toBe(100);
  });

  it('không ra ngoài 3 làn', () => {
    const sim = new Sim().race();
    for (let i = 0; i < 5; i++) sim.tap(DEFAULT_NAV.left);
    sim.run(1000);
    expect(sim.s.lane).toBe(0);
    expect(sim.w.laneX).toBe(0);
    for (let i = 0; i < 7; i++) sim.tap(DEFAULT_NAV.right);
    sim.run(1000);
    expect(sim.s.lane).toBe(2);
    expect(sim.w.laneX).toBe(2);
  });

  it('chuyển làn mượt, không nhảy tức thời', () => {
    const sim = new Sim().race();
    sim.tap(DEFAULT_NAV.left);
    expect(sim.w.laneX).toBe(1);
    sim.run(100);
    expect(sim.w.laneX).toBeGreaterThan(0);
    expect(sim.w.laneX).toBeLessThan(1);
    sim.run(200);
    expect(sim.w.laneX).toBe(0);
  });

  it('dùng phím điều hướng tuỳ chỉnh; phím C3 cũ thành nốt sai', () => {
    const sim = new Sim({ nav: { left: 40, right: 41 } }).race();
    expect(sim.tap(40)).toBe('nav');
    expect(sim.s.lane).toBe(0);
    expect(sim.tap(DEFAULT_NAV.left)).toBe('wrong');
  });

  it('phím điều hướng trùng nốt luyện tập được tách ngay từ lúc tạo ván', () => {
    const sim = new Sim({ nav: { left: 60, right: 62 } }).race();
    expect(sim.s.nav).toEqual(DEFAULT_NAV);
    expect(sim.hit()).toBe('correct');
  });
});

describe('va chạm', () => {
  const crashAt = (sim: Sim) => sim.events.filter((e) => e.type === 'crash').length;
  const toObstacle = (at: number) => (at / DIFFICULTIES.easy.maxSpeedMps) * 1000;

  it('trừ đúng 10 điểm, không kết thúc ván, chỉ một lần cho mỗi chướng ngại', () => {
    const sim = new Sim({ obstacles: [cone(30)] }).race();
    sim.run(toObstacle(30) + 500);
    expect(sim.s.collisions).toBe(1);
    expect(sim.s.speedPercent).toBe(90);
    expect(sim.s.status).toBe('racing');
    expect(crashAt(sim)).toBe(1);
  });

  it('xe dừng ngay trên chướng ngại: hết thời gian miễn cũng không bị trừ lại', () => {
    const sim = new Sim({ obstacles: [cone(30)] }).race();
    while (sim.s.collisions === 0) sim.run(FRAME);
    for (let i = 0; i < 9; i++) sim.tap(WRONG);
    expect(sim.s.speedPercent).toBe(0);
    sim.run(IMMUNITY_MS * 3);
    expect(sim.s.collisions).toBe(1);
    expect(sim.s.speedPercent).toBe(0);
  });

  it('miễn va chạm: chướng ngại ngay sau đó không trừ thêm', () => {
    const sim = new Sim({ obstacles: [cone(30, 1, 1), cone(40, 1, 2)] }).race();
    sim.run(toObstacle(40) + 300);
    expect(sim.s.collisions).toBe(1);
    expect(sim.s.speedPercent).toBe(90);
  });

  it('hết thời gian miễn thì chướng ngại khác vẫn tính', () => {
    const sim = new Sim({ obstacles: [cone(30, 1, 1), cone(70, 1, 2)] }).race();
    sim.run(toObstacle(70) + 300);
    expect(sim.s.collisions).toBe(2);
    expect(sim.s.speedPercent).toBe(80);
  });

  it('đi làn khác thì không va chạm', () => {
    const sim = new Sim({ obstacles: [cone(30, 0)] }).race();
    sim.run(toObstacle(30) + 1000);
    expect(sim.s.collisions).toBe(0);
  });

  it('chặng thật: không lái thì trúng chướng ngại, càng khó càng nhiều', () => {
    const avg = (difficulty: 'easy' | 'medium' | 'hard') => {
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const sim = new Sim({ difficulty, obstacles: undefined, rng: seeded(seed) }).race();
        // Bù tốc độ để luôn chạy hết chặng trong giới hạn của vòng lặp.
        while (sim.s.status !== 'finished') {
          if (sim.s.speedPercent < 100) sim.hit();
          sim.run(100, 25);
        }
        expect(sim.w.distance).toBe(DIFFICULTIES[difficulty].trackLength);
        total += sim.s.collisions;
      }
      return total / 30;
    };
    const easy = avg('easy');
    const medium = avg('medium');
    const hard = avg('hard');
    expect(easy).toBeGreaterThan(1);
    expect(medium).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(medium);
  });

  it('va chạm ở 0% không xuống dưới 0', () => {
    const sim = new Sim({ obstacles: [cone(30)] }).race();
    sim.run(toObstacle(30) - 800);
    for (let i = 0; i < 9; i++) sim.tap(WRONG);
    sim.run(10_000);
    expect(sim.s.speedPercent).toBe(0);
  });
});

describe('tự động né', () => {
  const streak = (sim: Sim, n: number) => {
    for (let i = 0; i < n; i++) sim.hit();
  };

  it('10 nốt đúng liên tiếp mới kích hoạt, 9 nốt thì chưa', () => {
    const sim = new Sim().race();
    streak(sim, 9);
    expect(sim.s.assistActive).toBe(false);
    expect(sim.s.assistProgress).toBe(9);
    sim.hit();
    expect(sim.s.assistActive).toBe(true);
    expect(sim.s.assistCount).toBe(1);
    expect(sim.s.assistLeftMs).toBe(ASSIST_MS);
  });

  it('đánh sai làm chuỗi về 0', () => {
    const sim = new Sim().race();
    streak(sim, 9);
    sim.tap(WRONG);
    expect(sim.s.assistProgress).toBe(0);
    sim.hit();
    expect(sim.s.assistActive).toBe(false);
    expect(sim.s.assistProgress).toBe(1);
  });

  it('kéo dài đúng 3 giây thời gian chơi', () => {
    const sim = new Sim().race();
    streak(sim, 10);
    sim.run(ASSIST_MS - 40);
    expect(sim.s.assistActive).toBe(true);
    sim.run(60);
    expect(sim.s.assistActive).toBe(false);
    expect(sim.events.filter((e) => e.type === 'assist-off')).toHaveLength(1);
  });

  it('tạm dừng không làm đồng hồ hỗ trợ chạy tiếp', () => {
    const sim = new Sim().race();
    streak(sim, 10);
    sim.run(1000);
    sim.game.pause(sim.now);
    const before = sim.s.assistLeftMs;
    const distance = sim.w.distance;
    sim.run(20_000);
    expect(sim.s.status).toBe('paused');
    expect(sim.s.assistLeftMs).toBe(before);
    expect(sim.w.distance).toBe(distance);
    sim.game.resume(sim.now);
    sim.run(ASSIST_MS - 1000 - 40);
    expect(sim.s.assistActive).toBe(true);
    sim.run(60);
    expect(sim.s.assistActive).toBe(false);
  });

  it('không cộng dồn: đánh thêm 10 nốt lúc đang hỗ trợ không kéo dài, không kích hoạt thêm', () => {
    const sim = new Sim().race();
    streak(sim, 10);
    sim.run(1000);
    streak(sim, 12);
    expect(sim.s.assistCount).toBe(1);
    expect(sim.s.assistProgress).toBe(0);
    sim.run(ASSIST_MS - 1000 + 40);
    expect(sim.s.assistActive).toBe(false);
    expect(sim.s.assistCount).toBe(1);
    // Hết hỗ trợ: tính chuỗi 10 nốt mới.
    streak(sim, 10);
    expect(sim.s.assistActive).toBe(true);
    expect(sim.s.assistCount).toBe(2);
    expect(sim.s.bestStreak).toBe(32);
  });

  it('va chạm không bị trừ tốc độ khi đang hỗ trợ, và xe tự sang làn an toàn', () => {
    const at = 45;
    const sim = new Sim({ obstacles: [cone(at, 1)] }).race();
    sim.run(((at - 25) / DIFFICULTIES.easy.maxSpeedMps) * 1000);
    streak(sim, 10);
    sim.run(ASSIST_MS);
    expect(sim.s.collisions).toBe(0);
    expect(sim.s.speedPercent).toBe(100);
    expect(sim.w.distance).toBeGreaterThan(at);
    expect(sim.s.lane).not.toBe(1);
  });

  it('đang hỗ trợ: không chuyển làn bằng tay, vẫn luyện nốt; hết giờ trả lại quyền lái', () => {
    const sim = new Sim().race();
    streak(sim, 10);
    expect(sim.tap(DEFAULT_NAV.left)).toBe('nav');
    expect(sim.s.lane).toBe(1);
    expect(sim.hit()).toBe('correct');
    sim.run(ASSIST_MS + 50);
    sim.tap(DEFAULT_NAV.left);
    expect(sim.s.lane).toBe(0);
  });

  it('đánh sai lúc hỗ trợ: giảm tốc và mất chuỗi nhưng hỗ trợ vẫn chạy hết giờ', () => {
    const sim = new Sim().race();
    streak(sim, 10);
    sim.tap(WRONG);
    expect(sim.s.assistActive).toBe(true);
    expect(sim.s.streak).toBe(0);
    expect(sim.s.speedPercent).toBe(90);
  });
});

describe('tạm dừng', () => {
  it('không chấm nốt, không chuyển làn, thời gian đua đứng yên', () => {
    const sim = new Sim().race();
    sim.run(1000);
    const t = sim.game.raceTimeMs;
    sim.game.pause(sim.now);
    expect(sim.tap(sim.s.target)).toBe('ignored');
    expect(sim.tap(DEFAULT_NAV.left)).toBe('ignored');
    sim.run(5000);
    expect(sim.game.raceTimeMs).toBe(t);
    expect(sim.s.lane).toBe(1);
    sim.game.resume(sim.now);
    sim.run(100);
    expect(sim.game.raceTimeMs).toBeGreaterThan(t);
  });

  it('tạm dừng lúc đếm ngược rồi tiếp tục đúng chỗ', () => {
    const sim = new Sim();
    sim.game.start(0);
    sim.run(1000);
    sim.game.pause(sim.now);
    sim.run(10_000);
    sim.game.resume(sim.now);
    expect(sim.s.status).toBe('countdown');
    sim.run(COUNTDOWN_MS - 1000 + 20);
    expect(sim.s.status).toBe('racing');
  });
});
