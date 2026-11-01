import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, DEFAULT_NAV, DIFFICULTIES, DIFFICULTY_ORDER, CARS, keyboardSpan, practiceNotes, resolveNavKeys } from './config';
import { blockHalfSpan, generateObstacles, isTrackFeasible, maxBlockedLanes, OBSTACLE_LENGTH, obstacleLaneX, obstaclePosition, overlaps, RIVAL_SPEED_RATIO, safestLane, type Obstacle } from './track';

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

describe('bộ sinh chướng ngại', () => {
  it.each(DIFFICULTY_ORDER)('%s: 300 chặng ngẫu nhiên đều vượt được, không lúc nào chặn cả 3 làn', (difficulty) => {
    const { trackLength } = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= 300; seed++) {
      const obstacles = generateObstacles(difficulty, seeded(seed));
      expect(obstacles.length).toBeGreaterThan(0);
      expect(maxBlockedLanes(obstacles, trackLength)).toBeLessThan(3);
      expect(isTrackFeasible(obstacles, difficulty)).toBe(true);
      for (const o of obstacles) {
        expect(o.at).toBeLessThan(trackLength);
        for (const lane of o.lanes) expect([0, 1, 2]).toContain(lane);
      }
    }
  });

  it('bộ kiểm tra nhận ra chặng bất khả thi: cả 3 làn cùng bị chặn', () => {
    const wall: Obstacle[] = [0, 1, 2].map((lane, i) => ({ id: i + 1, kind: 'fence', lanes: [lane], at: 100 }));
    expect(maxBlockedLanes(wall, 500)).toBe(3);
    expect(isTrackFeasible(wall, 'easy')).toBe(false);
  });

  it('bộ kiểm tra nhận ra chặng không kịp đổi làn: các đoạn chặn nối nhau', () => {
    // Không lúc nào đủ 3 làn bị chặn, nhưng làn giữa bị chặn ngay khi hai làn kia vừa trống: không còn chỗ để đổi làn.
    const trap: Obstacle[] = [
      { id: 1, kind: 'fence', lanes: [0], at: 10 },
      { id: 2, kind: 'fence', lanes: [2], at: 10 },
      { id: 3, kind: 'fence', lanes: [1], at: 23 },
    ];
    expect(maxBlockedLanes(trap, 500)).toBe(2);
    expect(isTrackFeasible(trap, 'easy')).toBe(false);
  });

  it('càng khó càng nhiều chướng ngại, Khó mới có xe đối thủ', () => {
    const density = (d: 'easy' | 'medium' | 'hard') => generateObstacles(d, seeded(3)).length / DIFFICULTIES[d].trackLength;
    expect(density('medium')).toBeGreaterThan(density('easy'));
    expect(density('hard')).toBeGreaterThan(density('medium'));
    const kinds = (d: 'easy' | 'medium' | 'hard') => new Set(Array.from({ length: 20 }, (_, i) => generateObstacles(d, seeded(i + 1)).map((o) => o.kind)).flat());
    expect(kinds('easy').has('rival')).toBe(false);
    expect(kinds('medium').has('rival')).toBe(false);
    expect(kinds('hard').has('rival')).toBe(true);
    for (const k of ['cone', 'fence', 'tyre', 'oil', 'rival']) expect(kinds('hard').has(k as 'cone')).toBe(true);
  });

  it('cùng RNG thì cùng chặng', () => {
    expect(generateObstacles('hard', seeded(9))).toEqual(generateObstacles('hard', seeded(9)));
  });
});

describe('xe đối thủ', () => {
  const rival: Obstacle = { id: 1, kind: 'rival', lanes: [2], at: 200, fromLane: 0 };

  it('di chuyển trên đường: lúc còn xa thì ở phía trước, tới điểm gặp thì ngang xe', () => {
    expect(obstaclePosition(rival, 100)).toBeGreaterThan(100);
    expect(obstaclePosition(rival, 150)).toBeGreaterThan(obstaclePosition(rival, 100));
    expect(obstaclePosition(rival, 200)).toBe(200);
    expect(obstaclePosition(rival, 250)).toBeLessThan(250);
  });

  it('không chạy đè lên chướng ngại đang hiện trên màn', () => {
    const VIEW_M = 50;
    let violations = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const all = generateObstacles('hard', seeded(seed));
      const rivals = all.filter((o) => o.kind === 'rival');
      const statics = all.filter((o) => o.kind !== 'rival');
      for (const r of rivals) {
        for (let d = Math.max(0, r.at - VIEW_M / (1 - RIVAL_SPEED_RATIO)); d <= r.at; d += 0.5) {
          const pos = obstaclePosition(r, d);
          const x = obstacleLaneX(r, d);
          for (const o of statics) {
            const near = Math.abs(pos - o.at) < (CAR_LENGTH + OBSTACLE_LENGTH[o.kind]) / 2;
            const visible = o.at - d < VIEW_M && o.at > d;
            const sameLane = o.lanes.some((lane) => Math.abs(x - lane) < 0.5);
            if (near && visible && sameLane) violations++;
          }
        }
      }
    }
    expect(violations).toBe(0);
  });

  it('đổi làn trước, đã ở làn đích trong suốt đoạn có thể va chạm', () => {
    expect(obstacleLaneX(rival, 100)).toBe(0);
    expect(obstacleLaneX(rival, 200 - blockHalfSpan('rival'))).toBe(2);
    const mid = obstacleLaneX(rival, 200 - 56);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(2);
  });
});

describe('va chạm và làn an toàn', () => {
  it('chỉ chạm khi trùng cả quãng đường lẫn làn', () => {
    const o: Obstacle = { id: 1, kind: 'cone', lanes: [1], at: 100 };
    expect(overlaps(o, 100, 1)).toBe(true);
    expect(overlaps(o, 100, 0)).toBe(false);
    expect(overlaps(o, 100, 2)).toBe(false);
    expect(overlaps(o, 80, 1)).toBe(false);
    expect(overlaps(o, 120, 1)).toBe(false);
  });

  it('safestLane chọn làn trống, giữ làn hiện tại khi còn thoáng', () => {
    const row: Obstacle[] = [{ id: 1, kind: 'fence', lanes: [0, 1], at: 50 }];
    expect(safestLane(row, 20, 1)).toBe(2);
    expect(safestLane(row, 20, 2)).toBe(2);
    expect(safestLane([], 20, 0)).toBe(0);
  });
});

describe('phím điều hướng', () => {
  it('mặc định C3 / D3, không trùng tầm nốt ở mọi độ khó', () => {
    expect(DEFAULT_NAV).toEqual({ left: 48, right: 50 });
    for (const d of DIFFICULTY_ORDER) {
      const notes = practiceNotes(d);
      expect(notes).not.toContain(48);
      expect(notes).not.toContain(50);
      expect(resolveNavKeys(DEFAULT_NAV, d).relocated).toBe(false);
    }
  });

  it('tầm nốt đúng yêu cầu', () => {
    expect(practiceNotes('easy')).toEqual([60, 62, 64, 65, 67]);
    expect(practiceNotes('medium')).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(practiceNotes('hard')).toEqual([55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76]);
    expect(DIFFICULTIES.easy.trackLength).toBe(500);
    expect(DIFFICULTIES.medium.trackLength).toBe(1000);
    expect(DIFFICULTIES.hard.trackLength).toBe(1500);
  });

  it('phím nằm trong tầm luyện tập (kể cả phím đen) được đổi; giữ nguyên phím hợp lệ', () => {
    const r = resolveNavKeys({ left: 61, right: 50 }, 'easy');
    expect(r.relocated).toBe(true);
    expect(r.right).toBe(50);
    expect(r.left).toBeLessThan(60);
    expect(r.left).not.toBe(50);
    expect(resolveNavKeys({ left: 40, right: 84 }, 'hard')).toEqual({ left: 40, right: 84, relocated: false });
    // A4, B4 nằm ngoài tầm Dễ nhưng trong tầm Khó.
    expect(resolveNavKeys({ left: 69, right: 71 }, 'easy').relocated).toBe(false);
    expect(resolveNavKeys({ left: 69, right: 71 }, 'hard').relocated).toBe(true);
  });

  it('hai phím không bao giờ trùng nhau hoặc trùng tầm, với mọi tổ hợp', () => {
    for (const d of DIFFICULTY_ORDER) {
      const { lowMidi, highMidi } = DIFFICULTIES[d];
      for (let left = 36; left <= 84; left++) {
        for (let right = 36; right <= 84; right++) {
          const r = resolveNavKeys({ left, right }, d);
          expect(r.left).not.toBe(r.right);
          for (const k of [r.left, r.right]) expect(k < lowMidi || k > highMidi).toBe(true);
        }
      }
    }
  });

  it('bàn phím ảo bao đủ phím điều hướng và nốt luyện tập, hai đầu là phím trắng', () => {
    expect(keyboardSpan('easy', DEFAULT_NAV)).toEqual({ from: 48, to: 67 });
    expect(keyboardSpan('hard', DEFAULT_NAV)).toEqual({ from: 48, to: 76 });
    expect(keyboardSpan('easy', { left: 37, right: 73 })).toEqual({ from: 36, to: 74 });
  });
});

describe('xe', () => {
  it('đủ 5 xe, khác tên, khác màu', () => {
    expect(CARS.map((c) => c.name)).toEqual(['Red Flash', 'Blue Storm', 'Golden Star', 'Green Bolt', 'Purple Rocket']);
    expect(new Set(CARS.map((c) => c.body)).size).toBe(5);
    expect(new Set(CARS.map((c) => c.wing)).size).toBe(5);
  });
});
