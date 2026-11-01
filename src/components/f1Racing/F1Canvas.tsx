import { useEffect, useRef } from 'react';
import { CARS, CAR_LENGTH, DIFFICULTIES, type CarDef } from '../../core/f1Racing/config';
import type { F1Event, F1RacingGame } from '../../core/f1Racing/F1RacingGame';
import { OBSTACLE_HALF_WIDTH, OBSTACLE_LENGTH, obstacleLaneX, obstaclePosition, type Obstacle } from '../../core/f1Racing/track';
import { CAR_DRAW_LENGTH, drawF1Car } from './carArt';

const PX_PER_M = CAR_DRAW_LENGTH / CAR_LENGTH;
const LANE_W = 110;
const ROAD_W = LANE_W * 3;
const VIEW_H = 620;
const SHAKE_MS = 320;
const BOOST_MS = 420;
/** Xe đối thủ: màu riêng, không trùng 5 xe của người chơi. */
const RIVAL_CAR: CarDef = { ...CARS[1], id: 'blue-storm', name: 'Đối thủ', body: '#64748b', bodyDark: '#334155', accent: '#f97316', flame: '#fb923c', wing: 'flat', mark: 'wave' };

const hash = (k: number) => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  size: number;
  text?: string;
}

interface Fx {
  sparks: Spark[];
  shakeAt: number;
  boostAt: number;
}

/**
 * Khu đường đua: canvas top-down, vòng requestAnimationFrame gọi `game.tick` rồi vẽ từ `game.getWorld()`,
 * không re-render React mỗi khung. Hiệu ứng lấy từ `game.onEvent`.
 */
export function F1Canvas({ game, car }: { game: F1RacingGame; car: CarDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carRef = useRef(car);
  carRef.current = car;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let size = { w: 0, h: 0, dpr: 1 };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const fx: Fx = { sparks: [], shakeAt: -Infinity, boostAt: -Infinity };
    const off = game.onEvent((e: F1Event) => {
      const t = performance.now();
      if (e.type === 'crash') {
        fx.shakeAt = t;
        for (let i = 0; i < 16; i++) {
          const a = hash(i + t) * Math.PI * 2;
          const v = 120 + hash(i * 3 + t) * 220;
          fx.sparks.push({ x: 0, y: -40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: t, life: 450 + hash(i) * 250, color: i % 2 ? '#fde047' : '#fb923c', size: 3 + hash(i * 7) * 3 });
        }
      } else if (e.type === 'correct') {
        fx.sparks.push({ x: 52, y: -30, vx: 30, vy: -60, born: t, life: 700, color: '#16a34a', size: 28, text: '♪' });
      } else if (e.type === 'speed-up') {
        fx.boostAt = t;
      } else if (e.type === 'speed-down') {
        fx.sparks.push({ x: -56, y: -30, vx: -20, vy: 50, born: t, life: 700, color: '#e11d48', size: 24, text: '−10%' });
      } else if (e.type === 'assist-on') {
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          fx.sparks.push({ x: 0, y: 0, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, born: t, life: 650, color: carRef.current.flame, size: 5 });
        }
      }
    });

    let raf = 0;
    const frame = () => {
      const now = performance.now();
      game.tick(now);
      draw(ctx, game, carRef.current, size, now, fx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
    };
  }, [game]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" aria-label="Đường đua 3 làn" data-testid="f1-canvas" />;
}

function draw(ctx: CanvasRenderingContext2D, game: F1RacingGame, car: CarDef, size: { w: number; h: number; dpr: number }, now: number, fx: Fx) {
  const { w, h, dpr } = size;
  if (w === 0 || h === 0) return;
  const dark = document.documentElement.classList.contains('dark');
  const world = game.getWorld();
  const state = game.getState();
  const scale = Math.min(h / VIEW_H, w / (ROAD_W + 60));
  const viewW = w / scale;
  const viewH = h / scale;
  const cx = viewW / 2;
  const roadL = cx - ROAD_W / 2;
  const carY = viewH - 95;
  const laneCenter = (lane: number) => roadL + LANE_W * (lane + 0.5);
  /** Toạ độ màn hình của vị trí `pos` trên đường. */
  const yOf = (pos: number) => carY - (pos - world.scroll) * PX_PER_M;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  const shaking = now - fx.shakeAt < SHAKE_MS;
  if (shaking) {
    const k = (1 - (now - fx.shakeAt) / SHAKE_MS) * 9;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  const metresVisible = viewH / PX_PER_M;
  const firstM = world.scroll - (viewH - carY) / PX_PER_M - 5;
  const lastM = world.scroll + metresVisible + 5;

  // Cỏ: sọc theo đường chạy nên thấy rõ tốc độ.
  ctx.fillStyle = dark ? '#14532d' : '#4ade80';
  ctx.fillRect(-20, -20, viewW + 40, viewH + 40);
  ctx.fillStyle = dark ? '#166534' : '#22c55e';
  const STRIPE = 12;
  for (let k = Math.floor(firstM / STRIPE); k * STRIPE < lastM; k++) {
    if (k % 2) ctx.fillRect(-20, yOf((k + 1) * STRIPE), viewW + 40, STRIPE * PX_PER_M + 1);
  }

  drawScenery(ctx, roadL, viewW, firstM, lastM, yOf, dark, now);

  // Mặt đường
  ctx.fillStyle = dark ? '#1f2937' : '#475569';
  ctx.fillRect(roadL, -20, ROAD_W, viewH + 40);
  // Lề đường đỏ trắng
  const KERB = 4;
  for (let k = Math.floor(firstM / KERB); k * KERB < lastM; k++) {
    ctx.fillStyle = k % 2 ? '#ef4444' : '#f8fafc';
    const y = yOf((k + 1) * KERB);
    const hk = KERB * PX_PER_M + 1;
    ctx.fillRect(roadL - 14, y, 14, hk);
    ctx.fillRect(roadL + ROAD_W, y, 14, hk);
  }
  // Vạch phân làn
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  const DASH = 8;
  for (let k = Math.floor(firstM / DASH); k * DASH < lastM; k++) {
    const y = yOf(k * DASH + DASH * 0.55);
    for (const lane of [1, 2]) ctx.fillRect(roadL + LANE_W * lane - 3, y, 6, DASH * 0.55 * PX_PER_M);
  }

  // Vạch xuất phát và vạch đích
  const { trackLength } = DIFFICULTIES[game.difficulty];
  drawLine(ctx, roadL, yOf(7), viewH, 'XUẤT PHÁT', '#2563eb');
  drawLine(ctx, roadL, yOf(trackLength), viewH, 'VỀ ĐÍCH', '#dc2626');

  // Hiệu ứng tốc độ: vệt trắng hai bên, đậm dần theo tốc độ
  if (world.speed > 25 && state.status === 'racing') {
    const k = (world.speed - 25) / 75;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    const STREAK = 9;
    for (let i = Math.floor(firstM / STREAK); i * STREAK < lastM; i++) {
      const offset = hash(i) * ROAD_W;
      const y = yOf(i * STREAK + hash(i + 5) * 6);
      ctx.globalAlpha = k * 0.55;
      ctx.beginPath();
      ctx.moveTo(roadL + offset, y);
      ctx.lineTo(roadL + offset, y + 18 + k * 34);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Chướng ngại phía trước, xe đối thủ
  for (const o of world.obstacles) {
    const pos = obstaclePosition(o, world.scroll);
    if (pos < firstM - 10 || pos > lastM + 10) continue;
    drawObstacle(ctx, o, laneCenter(0) + obstacleLaneX(o, world.scroll) * LANE_W, yOf(pos), now);
  }

  // Xe người chơi
  const carX = laneCenter(0) + world.laneX * LANE_W;
  const immune = world.clock < world.immuneUntil;
  if (!immune || Math.floor(now / 110) % 2 === 0) {
    drawF1Car(ctx, carX, carY, car, {
      tilt: (state.lane - world.laneX) * 0.28,
      flame: world.speed / 100,
      boost: now - fx.boostAt < BOOST_MS,
      shield: state.assistActive,
      time: state.status === 'paused' || world.speed === 0 ? 0 : now,
    });
  }
  // Xe dừng: khói nhẹ cho biết xe đang chờ nốt đúng.
  if (state.status === 'racing' && world.speed === 0) {
    ctx.font = '26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;
    ctx.fillText('💨', carX + Math.sin(now / 240) * 6, carY + 70 - ((now / 12) % 22));
    ctx.globalAlpha = 1;
  }

  // Hạt hiệu ứng (toạ độ so với xe)
  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    const p = fx.sparks[i];
    const age = now - p.born;
    if (age > p.life) {
      fx.sparks.splice(i, 1);
      continue;
    }
    const t = age / 1000;
    ctx.globalAlpha = 1 - age / p.life;
    ctx.fillStyle = p.color;
    const x = carX + p.x + p.vx * t;
    const y = carY + p.y + p.vy * t;
    if (p.text) {
      ctx.font = `bold ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, x, y);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Đèn xuất phát
  if (state.status === 'countdown' || (state.status === 'paused' && state.countdown > 0)) drawLights(ctx, cx, state.countdown);
  else if (state.status === 'racing' && world.clock < 700) {
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#0f172a';
    ctx.globalAlpha = 1 - world.clock / 700;
    ctx.strokeText('XUẤT PHÁT!', cx, 150);
    ctx.fillStyle = '#4ade80';
    ctx.fillText('XUẤT PHÁT!', cx, 150);
    ctx.globalAlpha = 1;
  }
}

function drawLine(ctx: CanvasRenderingContext2D, roadL: number, y: number, viewH: number, label: string, color: string) {
  if (y < -60 || y > viewH + 100) return;
  const CELL = 14;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < ROAD_W / CELL; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#0f172a' : '#f8fafc';
      ctx.fillRect(roadL + c * CELL, y + r * CELL, CELL, CELL);
    }
  }
  // Cổng biển chữ bắc ngang đường
  ctx.fillStyle = '#334155';
  ctx.fillRect(roadL - 26, y - 64, 10, 76);
  ctx.fillRect(roadL + ROAD_W + 16, y - 64, 10, 76);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(roadL - 26, y - 88, ROAD_W + 52, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🏁 ${label} 🏁`, roadL + ROAD_W / 2, y - 59);
}

function drawScenery(ctx: CanvasRenderingContext2D, roadL: number, viewW: number, firstM: number, lastM: number, yOf: (m: number) => number, dark: boolean, now: number) {
  const BUCKET = 11;
  const leftRoom = roadL - 24;
  if (leftRoom < 10) return;
  for (let k = Math.floor(firstM / BUCKET) - 2; k * BUCKET < lastM + 12; k++) {
    for (const side of [-1, 1] as const) {
      const seed = k * 2 + (side > 0 ? 1 : 0);
      const roll = hash(seed);
      const depth = hash(seed + 91) * Math.max(0, leftRoom - 60);
      const x = side < 0 ? roadL - 40 - depth : roadL + ROAD_W + 40 + depth;
      if (x < -60 || x > viewW + 60) continue;
      const y = yOf(k * BUCKET);
      if (roll < 0.42) tree(ctx, x, y, 0.8 + hash(seed + 3) * 0.6, dark);
      else if (roll < 0.58) stand(ctx, x, y, seed, now);
      else if (roll < 0.72) tyreStack(ctx, x, y);
      else if (roll < 0.86) flag(ctx, x, y, seed, now);
      else billboard(ctx, x, y, seed);
    }
  }
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dark: boolean) {
  ctx.fillStyle = 'rgba(15,23,42,.2)';
  ctx.beginPath();
  ctx.arc(x + 5, y + 6, 26 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark ? '#15803d' : '#16a34a';
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark ? '#22c55e' : '#4ade80';
  ctx.beginPath();
  ctx.arc(x - 7 * s, y - 7 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
}

function stand(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, now: number) {
  const W = 50;
  const H = 86;
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(x - W / 2, y - H / 2, W, H, 6);
  ctx.fill();
  const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ec4899'];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = colors[Math.floor(hash(seed * 31 + r * 7 + c) * colors.length)];
      const jump = Math.sin(now / 180 + r + c * 2) * 1.2;
      ctx.beginPath();
      ctx.arc(x - W / 2 + 9 + c * 11, y - H / 2 + 9 + r * 11.5 + jump, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tyreStack(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    const ty = y - 24 + i * 24;
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x, ty, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 ? '#f8fafc' : '#ef4444';
    ctx.beginPath();
    ctx.arc(x, ty, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, now: number) {
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  const colors = ['#ef4444', '#3b82f6', '#fde047', '#22c55e', '#f472b6'];
  ctx.fillStyle = colors[Math.floor(hash(seed + 11) * colors.length)];
  const wave = Math.sin(now / 130 + seed) * 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 16, y - 8 + wave, x + 32, y - 2 - wave);
  ctx.lineTo(x + 30, y + 14 - wave);
  ctx.quadraticCurveTo(x + 14, y + 12 + wave, x, y + 16);
  ctx.closePath();
  ctx.fill();
}

function billboard(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const colors = ['#7c3aed', '#0ea5e9', '#f97316', '#db2777'];
  ctx.fillStyle = colors[Math.floor(hash(seed + 5) * colors.length)];
  ctx.beginPath();
  ctx.roundRect(x - 26, y - 22, 52, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(['♪', '♫', '𝄞', '♬'][Math.floor(hash(seed + 8) * 4)], x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, x: number, y: number, now: number) {
  const len = OBSTACLE_LENGTH[o.kind] * PX_PER_M;
  const half = OBSTACLE_HALF_WIDTH[o.kind] * LANE_W;
  switch (o.kind) {
    case 'cone': {
      ctx.fillStyle = 'rgba(15,23,42,.3)';
      ctx.beginPath();
      ctx.arc(x + 3, y + 4, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.roundRect(x - half, y - half, half * 2, half * 2, 6);
      ctx.fill();
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(x, y, half * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(x, y, half * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(x, y, half * 0.26, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fence': {
      const span = (o.lanes[o.lanes.length - 1] - o.lanes[0]) * LANE_W;
      const left = x - span / 2 - half;
      const width = span + half * 2;
      ctx.fillStyle = 'rgba(15,23,42,.3)';
      ctx.fillRect(left + 3, y - len / 2 + 5, width, len);
      const CELL = 26;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, y - len / 2, width, len, 7);
      ctx.clip();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(left, y - len / 2, width, len);
      ctx.fillStyle = '#dc2626';
      for (let c = -1; c * CELL < width + len; c += 2) {
        const bx = left + c * CELL;
        ctx.beginPath();
        ctx.moveTo(bx, y + len / 2);
        ctx.lineTo(bx + len, y - len / 2);
        ctx.lineTo(bx + len + CELL, y - len / 2);
        ctx.lineTo(bx + CELL, y + len / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(left, y - len / 2, width, len, 7);
      ctx.stroke();
      break;
    }
    case 'tyre': {
      const r = Math.min(half, len / 2);
      ctx.fillStyle = 'rgba(15,23,42,.3)';
      ctx.beginPath();
      ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
        ctx.lineTo(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96);
        ctx.stroke();
      }
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'oil': {
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.ellipse(x, y, half, len / 2, 0, 0, Math.PI * 2);
      ctx.ellipse(x - half * 0.55, y + len * 0.2, half * 0.55, len * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(x + half * 0.5, y - len * 0.22, half * 0.55, len * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      const sheen = ctx.createLinearGradient(x - half, y - len / 3, x + half, y + len / 3);
      sheen.addColorStop(0, 'rgba(168,85,247,.55)');
      sheen.addColorStop(0.5, 'rgba(14,165,233,.5)');
      sheen.addColorStop(1, 'rgba(34,197,94,.45)');
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.ellipse(x - half * 0.1, y - len * 0.05, half * 0.55, len * 0.26, 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rival':
      drawF1Car(ctx, x, y, RIVAL_CAR, { flame: 0.6, time: now });
      break;
  }
}

/** Đèn xuất phát: 3 đèn tắt dần, đèn đỏ theo số giây còn lại. */
function drawLights(ctx: CanvasRenderingContext2D, cx: number, left: number) {
  const W = 220;
  ctx.fillStyle = 'rgba(15,23,42,.92)';
  ctx.beginPath();
  ctx.roundRect(cx - W / 2, 70, W, 96, 18);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const on = 3 - i <= left;
    ctx.fillStyle = on ? '#ef4444' : '#334155';
    ctx.beginPath();
    ctx.arc(cx - 66 + i * 66, 118, 25, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.arc(cx - 72 + i * 66, 111, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.font = '900 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#0f172a';
  ctx.strokeText(String(left), cx, 215);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(left), cx, 215);
}
