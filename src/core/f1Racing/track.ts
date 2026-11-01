/**
 * Đường đua: sinh sẵn chướng ngại cho cả chặng (thuần, nhận RNG) và kiểm tra luôn có đường vượt.
 *
 * Xe đối thủ chạy với vận tốc TỈ LỆ theo xe người chơi (`RIVAL_SPEED_RATIO`), nên điểm gặp nhau chỉ phụ thuộc
 * quãng đường, không phụ thuộc tốc độ người chơi. Nhờ vậy "đoạn đường bị chặn" tính trước được kể cả với
 * xe di chuyển, và bộ kiểm tra chứng minh được mọi chặng đều vượt được.
 */
import { CAR_LENGTH, CAR_HALF_WIDTH, DIFFICULTIES, LANE_CHANGE_SEC, LANE_COUNT, type F1Difficulty } from './config';

export type ObstacleKind = 'cone' | 'fence' | 'tyre' | 'oil' | 'rival';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** Các làn chiếm giữ khi xe người chơi tới (hàng rào có thể chắn 2 làn). */
  lanes: number[];
  /** Quãng đường của xe người chơi lúc đối đầu trực diện (đầu xe / tâm chướng ngại). */
  at: number;
  /** Xe đối thủ: làn ban đầu, đổi làn trước khi xe người chơi tới gần. */
  fromLane?: number;
}

export const OBSTACLE_LENGTH: Record<ObstacleKind, number> = { cone: 3, fence: 3, tyre: 3.5, oil: 5, rival: CAR_LENGTH };
export const OBSTACLE_HALF_WIDTH: Record<ObstacleKind, number> = { cone: 0.2, fence: 0.46, tyre: 0.24, oil: 0.32, rival: CAR_HALF_WIDTH };

export const RIVAL_SPEED_RATIO = 0.5;
/** Xe đối thủ đổi làn trong đoạn này (m trước điểm gặp), còn cách xa vùng va chạm. */
const SWERVE_START = 62;
const SWERVE_END = 50;
/** Xe đối thủ bắt đầu hiện khi điểm gặp còn cách chừng này (m quãng đường của xe đối thủ, cộng dự phòng). */
const RIVAL_VISIBLE_FROM = 60;
const FIRST_OBSTACLE_AT = 70;
const FINISH_CLEARANCE = 25;

/** Nửa độ dài đoạn đường bị chặn: khoảng cách tới tâm `at` mà hai xe chồng lên nhau. */
export function blockHalfSpan(kind: ObstacleKind): number {
  const h = (OBSTACLE_LENGTH[kind] + CAR_LENGTH) / 2;
  return kind === 'rival' ? h / (1 - RIVAL_SPEED_RATIO) : h;
}

/** Vị trí trên đường của chướng ngại khi xe người chơi ở quãng đường `distance`. */
export function obstaclePosition(o: Obstacle, distance: number): number {
  return o.kind === 'rival' ? o.at + RIVAL_SPEED_RATIO * (distance - o.at) : o.at;
}

/** Làn (số thực) của tâm chướng ngại: để vẽ; xe đối thủ trượt từ `fromLane` sang làn đích. */
export function obstacleLaneX(o: Obstacle, distance: number): number {
  const target = (o.lanes[0] + o.lanes[o.lanes.length - 1]) / 2;
  if (o.kind !== 'rival' || o.fromLane === undefined) return target;
  const k = (distance - (o.at - SWERVE_START)) / (SWERVE_START - SWERVE_END);
  const t = Math.max(0, Math.min(1, k));
  return o.fromLane + (target - o.fromLane) * (t * t * (3 - 2 * t));
}

/** Có chạm nhau ở quãng đường + vị trí ngang của xe không. */
export function overlaps(o: Obstacle, distance: number, carLaneX: number): boolean {
  if (Math.abs(distance - o.at) >= blockHalfSpan(o.kind)) return false;
  const reach = OBSTACLE_HALF_WIDTH[o.kind] + CAR_HALF_WIDTH;
  return o.lanes.some((lane) => Math.abs(carLaneX - lane) < reach);
}

const SINGLE_KINDS: readonly ObstacleKind[] = ['cone', 'tyre', 'oil', 'fence'];

/** Sinh chướng ngại cho cả chặng. Mỗi cụm chừa ít nhất một làn; cụm sau cách cụm trước đủ để đổi làn. */
export function generateObstacles(difficulty: F1Difficulty, rng: () => number = Math.random): Obstacle[] {
  const cfg = DIFFICULTIES[difficulty];
  const out: Obstacle[] = [];
  const pick = <T,>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
  const between = (a: number, b: number) => a + rng() * (b - a);
  let id = 1;
  /** Mép cuối của đoạn bị chặn trước đó. */
  let clearFrom = FIRST_OBSTACLE_AT - cfg.gapMin;
  while (true) {
    const isRival = rng() < cfg.rivalChance;
    const span = isRival ? blockHalfSpan('rival') : blockHalfSpan('oil');
    const at = clearFrom + between(cfg.gapMin, cfg.gapMax) + span;
    if (at + span > cfg.trackLength - FINISH_CLEARANCE) break;

    const lanes = [0, 1, 2];
    if (isRival) {
      // Lúc xe đối thủ vừa hiện ở đầu màn, nó còn ở `fromLane`: tránh cụm ngay trước đó để không chạy đè lên chướng ngại.
      const nearby = out.filter((o) => o.at > at - RIVAL_VISIBLE_FROM).flatMap((o) => o.lanes);
      const open = lanes.filter((l) => !nearby.includes(l));
      out.push({ id: id++, kind: 'rival', lanes: [pick(lanes)], at, fromLane: pick(open.length > 0 ? open : lanes) });
    } else if (rng() < cfg.twoLaneChance) {
      const free = pick(lanes);
      const blocked = lanes.filter((l) => l !== free);
      if (free !== 1 && rng() < 0.5) {
        // Hai làn liền nhau: một hàng rào dài chắn cả hai.
        out.push({ id: id++, kind: 'fence', lanes: blocked, at });
      } else {
        for (const lane of blocked) out.push({ id: id++, kind: pick(SINGLE_KINDS), lanes: [lane], at });
      }
    } else {
      out.push({ id: id++, kind: pick(SINGLE_KINDS), lanes: [pick(lanes)], at });
    }
    clearFrom = at + span;
  }
  return out;
}

/** Làn bị chặn ở từng mét quãng đường. */
function blockedMap(obstacles: readonly Obstacle[], trackLength: number): Uint8Array[] {
  const size = Math.ceil(trackLength) + 1;
  const map = Array.from({ length: LANE_COUNT }, () => new Uint8Array(size));
  for (const o of obstacles) {
    const h = blockHalfSpan(o.kind);
    const a = Math.max(0, Math.floor(o.at - h));
    const b = Math.min(size - 1, Math.ceil(o.at + h));
    for (const lane of o.lanes) map[lane].fill(1, a, b + 1);
  }
  return map;
}

/**
 * Có đường vượt từ vạch xuất phát tới đích, tính cả thời gian chuyển làn ở tốc độ tối đa
 * (khi chuyển làn xe chiếm cả hai làn nên cả hai phải trống suốt đoạn đó).
 */
export function isTrackFeasible(obstacles: readonly Obstacle[], difficulty: F1Difficulty, startLane = 1): boolean {
  const { trackLength, maxSpeedMps } = DIFFICULTIES[difficulty];
  const blocked = blockedMap(obstacles, trackLength);
  const size = blocked[0].length;
  const laneChange = Math.ceil(LANE_CHANGE_SEC * maxSpeedMps);
  const reach = Array.from({ length: LANE_COUNT }, () => new Uint8Array(size + laneChange + 1));
  if (blocked[startLane][0]) return false;
  reach[startLane][0] = 1;
  for (let d = 0; d < size - 1; d++) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (!reach[lane][d]) continue;
      if (!blocked[lane][d + 1]) reach[lane][d + 1] = 1;
      for (const next of [lane - 1, lane + 1]) {
        if (next < 0 || next >= LANE_COUNT) continue;
        let free = true;
        for (let k = d; k <= Math.min(size - 1, d + laneChange); k++) {
          if (blocked[lane][k] || blocked[next][k]) {
            free = false;
            break;
          }
        }
        if (free) reach[next][Math.min(size - 1, d + laneChange)] = 1;
      }
    }
  }
  return reach.some((r) => r[size - 1] === 1);
}

/** Số làn bị chặn nhiều nhất tại cùng một điểm trên đường. */
export function maxBlockedLanes(obstacles: readonly Obstacle[], trackLength: number): number {
  const blocked = blockedMap(obstacles, trackLength);
  let max = 0;
  for (let d = 0; d < blocked[0].length; d++) max = Math.max(max, blocked[0][d] + blocked[1][d] + blocked[2][d]);
  return max;
}

const HORIZON_M = 70;

/** Quãng đường còn trống phía trước trong một làn (tối đa `HORIZON_M`). */
function clearAhead(obstacles: readonly Obstacle[], lane: number, distance: number): number {
  let clear = HORIZON_M;
  for (const o of obstacles) {
    if (!o.lanes.includes(lane)) continue;
    const h = blockHalfSpan(o.kind);
    if (o.at + h <= distance) continue;
    clear = Math.min(clear, Math.max(0, o.at - h - distance));
  }
  return clear;
}

/** Làn an toàn nhất cho chế độ tự né: giữ làn hiện tại nếu còn thoáng, ưu tiên làn gần hơn khi bằng nhau. */
export function safestLane(obstacles: readonly Obstacle[], distance: number, currentLane: number): number {
  const lanes = [0, 1, 2].map((lane) => ({ lane, clear: clearAhead(obstacles, lane, distance) }));
  const here = lanes[currentLane];
  if (here.clear >= HORIZON_M) return currentLane;
  let best = here;
  for (const c of lanes) {
    if (c.clear > best.clear || (c.clear === best.clear && Math.abs(c.lane - currentLane) < Math.abs(best.lane - currentLane))) best = c;
  }
  return best.lane;
}
