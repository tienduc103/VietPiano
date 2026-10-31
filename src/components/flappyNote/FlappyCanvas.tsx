import { useEffect, useRef } from 'react';
import { BIRD_RADIUS, BIRD_X, GROUND_Y, ITEM_RADIUS, PIPE_WIDTH, WORLD_HEIGHT, type FlappyNoteGame, type FlappyState, type PowerUpKind } from '../../core/flappyNote/FlappyNoteGame';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

const PIPE_COLORS = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fb923c'];
const NOTE_GLYPHS = ['♪', '♫', '♬'];
const SHAKE_MS = 350;
/** Ống bị con ma xoá mờ dần trong chừng này (ms đồng hồ trò chơi). */
const VANISH_MS = 600;
const ITEM_ICON: Record<PowerUpKind, string> = { bolt: '⚡', heart: '❤️', ghost: '👻' };
const ITEM_GLOW: Record<PowerUpKind, string> = { bolt: '#facc15', heart: '#f43f5e', ghost: '#a5b4fc' };
const PICK_COLOR: Record<PowerUpKind, string> = { bolt: '#ca8a04', heart: '#e11d48', ghost: '#6366f1' };
const PICK_TEXT: Record<PowerUpKind, string> = { bolt: '⚡ Tăng tốc!', heart: '❤️ +1 mạng', ghost: '👻 Xoá ống!' };

/** Số giả ngẫu nhiên ổn định theo chỉ số (vị trí mây…), 0–1. */
const hash = (k: number) => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Khu B của Flappy Note: canvas vẽ trời, mây, đồi, ống, mặt đất cuộn ngang và chú chim nốt nhạc.
 * Vòng requestAnimationFrame gọi `game.tick` rồi vẽ thẳng từ `game.getWorld()` — không re-render React mỗi khung.
 * Hiệu ứng (nốt nhạc bay lên khi đúng, dấu ✕ khi sai, rung khi va chạm, "+100" khi qua ống, chữ khi nhặt vật phẩm) suy từ thay đổi trạng thái.
 * Vật phẩm nhấp nhô có quầng sáng; tia sét: vệt gió + quầng vàng quanh chim; con ma: ống mờ dần, ma nhỏ bay cạnh chim; thanh còn lại ở góc dưới.
 */
export function FlappyCanvas({ game }: { game: FlappyNoteGame }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const particles: Particle[] = [];
    let prev: FlappyState = game.getState();
    let shakeAt = -Infinity;
    const off = game.subscribe((s) => {
      const t = performance.now();
      const y = game.getWorld().birdY;
      if (s.lastEventTime !== prev.lastEventTime || s.hits !== prev.hits || s.wrongs !== prev.wrongs) {
        if (s.lastOutcome === 'hit') {
          for (let i = 0; i < 3; i++)
            particles.push({ x: BIRD_X - 10, y, vx: -60 - Math.random() * 80, vy: -70 - Math.random() * 60, born: t, life: 900, text: NOTE_GLYPHS[i % 3], color: '#7c3aed', size: 26 });
        } else if (s.lastOutcome === 'wrong') {
          particles.push({ x: BIRD_X + 30, y: y - 30, vx: 0, vy: -30, born: t, life: 600, text: '✕', color: '#e11d48', size: 30 });
        } else if (s.lastOutcome === 'crash') {
          shakeAt = t;
          for (let i = 0; i < 5; i++) particles.push({ x: BIRD_X, y, vx: Math.cos(i * 1.26) * 120, vy: Math.sin(i * 1.26) * 120, born: t, life: 700, text: '★', color: '#facc15', size: 22 });
        }
      }
      if (s.lastPowerUp && s.lastPowerUp !== prev.lastPowerUp) {
        const k = s.lastPowerUp.kind;
        particles.push({ x: BIRD_X + 40, y: y - 40, vx: 20, vy: -45, born: t, life: 1300, text: k === 'heart' && s.lastPowerUp.bonus ? '❤️ +50' : PICK_TEXT[k], color: PICK_COLOR[k], size: 30 });
      }
      if (s.pipesPassed > prev.pipesPassed) particles.push({ x: BIRD_X, y: y - 50, vx: 0, vy: -50, born: t, life: 800, text: '+100', color: '#16a34a', size: 26 });
      prev = s;
    });

    let raf = 0;
    const frame = () => {
      const now = performance.now();
      game.tick(now);
      draw(ctx, game, size, now, particles, shakeAt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
    };
  }, [game]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" aria-label="Chim nốt nhạc bay qua các ống" data-testid="flappy-canvas" />;
}

function draw(ctx: CanvasRenderingContext2D, game: FlappyNoteGame, size: { w: number; h: number; dpr: number }, now: number, particles: Particle[], shakeAt: number) {
  const { w, h, dpr } = size;
  if (w === 0 || h === 0) return;
  const dark = document.documentElement.classList.contains('dark');
  const world = game.getWorld();
  const state = game.getState();
  const scale = h / WORLD_HEIGHT;
  const viewW = w / scale;

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  if (now - shakeAt < SHAKE_MS) {
    const k = (1 - (now - shakeAt) / SHAKE_MS) * 8;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  // Trời
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  if (dark) {
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(1, '#4c1d95');
  } else {
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(1, '#e0f2fe');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, viewW + 40, WORLD_HEIGHT + 40);
  if (dark) {
    ctx.fillStyle = '#fef9c3';
    for (let i = 0; i < 40; i++) {
      const x = hash(i) * viewW;
      const y = hash(i + 100) * (GROUND_Y - 120);
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(now / 900 + i));
      ctx.fillRect(x, y, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  }
  // Mặt trời / mặt trăng
  ctx.fillStyle = dark ? '#fef3c7' : '#fde047';
  ctx.beginPath();
  ctx.arc(viewW - 120, 90, 42, 0, Math.PI * 2);
  ctx.fill();
  if (dark) {
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    ctx.arc(viewW - 102, 80, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mây (cuộn chậm)
  const cloudOff = world.distance * 0.2;
  const CLOUD_GAP = 320;
  ctx.fillStyle = dark ? 'rgba(199,210,254,0.25)' : 'rgba(255,255,255,0.92)';
  for (let k = Math.floor(cloudOff / CLOUD_GAP) - 1; k <= Math.floor((cloudOff + viewW) / CLOUD_GAP) + 1; k++) {
    const x = k * CLOUD_GAP - cloudOff + hash(k) * 140;
    const y = 50 + hash(k * 7 + 3) * 170;
    const s = 0.7 + hash(k * 3 + 1) * 0.6;
    cloud(ctx, x, y, s);
  }

  // Đồi (cuộn vừa)
  const hillOff = world.distance * 0.45;
  ctx.fillStyle = dark ? '#14532d' : '#86efac';
  ctx.beginPath();
  ctx.moveTo(-20, GROUND_Y);
  for (let x = -20; x <= viewW + 20; x += 16) {
    const X = x + hillOff;
    ctx.lineTo(x, GROUND_Y - 70 - 38 * Math.sin(X / 150) - 18 * Math.sin(X / 61));
  }
  ctx.lineTo(viewW + 20, GROUND_Y);
  ctx.fill();

  // Ống
  for (const p of world.pipes) {
    if (p.x > viewW + 20 || p.x + PIPE_WIDTH < -20) continue;
    const fade = p.vanishAt === undefined ? 0 : (world.clock - p.vanishAt) / VANISH_MS;
    if (fade >= 1) continue;
    const color = PIPE_COLORS[p.id % PIPE_COLORS.length];
    const top = p.gapY - p.gap / 2;
    const bottom = p.gapY + p.gap / 2;
    ctx.globalAlpha = 1 - fade;
    pipe(ctx, p.x, -20, top + 20, color, 'down');
    pipe(ctx, p.x, bottom, GROUND_Y - bottom, color, 'up');
    if (fade > 0) {
      ctx.font = '40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👻', p.x + PIPE_WIDTH / 2, p.gapY - fade * 80);
    }
    ctx.globalAlpha = 1;
  }

  // Vật phẩm
  for (const it of world.items) {
    if (it.x > viewW + 40 || it.x < -40) continue;
    const y = it.y + Math.sin(now / 260 + it.id) * 8;
    const glow = ctx.createRadialGradient(it.x, y, 4, it.x, y, ITEM_RADIUS * 1.6);
    glow.addColorStop(0, ITEM_GLOW[it.kind]);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 180 + it.id);
    ctx.beginPath();
    ctx.arc(it.x, y, ITEM_RADIUS * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(it.x, y, ITEM_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ITEM_ICON[it.kind], it.x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Cờ đích
  const fx = game.finishX;
  if (fx !== null && fx < viewW + 40) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(fx, GROUND_Y - 200, 6, 200);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#0f172a' : '#ffffff';
        ctx.fillRect(fx + 6 + c * 12, GROUND_Y - 200 + r * 12 + Math.sin(now / 200 + c) * 2, 12, 12);
      }
  }

  // Mặt đất (cuộn cùng tốc độ ống)
  ctx.fillStyle = dark ? '#78350f' : '#fcd34d';
  ctx.fillRect(-20, GROUND_Y, viewW + 40, WORLD_HEIGHT - GROUND_Y + 20);
  ctx.fillStyle = dark ? '#166534' : '#4ade80';
  ctx.fillRect(-20, GROUND_Y, viewW + 40, 14);
  ctx.fillStyle = dark ? 'rgba(0,0,0,0.18)' : 'rgba(217,119,6,0.25)';
  const stripe = world.distance % 48;
  for (let x = -stripe - 48; x < viewW + 48; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 14);
    ctx.lineTo(x + 24, GROUND_Y + 14);
    ctx.lineTo(x + 6, WORLD_HEIGHT);
    ctx.lineTo(x - 18, WORLD_HEIGHT);
    ctx.fill();
  }

  // Chim
  const ready = state.status === 'ready';
  const birdY = world.birdY + (ready ? Math.sin(now / 280) * 10 : 0);
  if (world.speedFactor > 1.05) {
    // Tia sét: vệt gió phía sau + quầng vàng.
    const k = Math.min(1, (world.speedFactor - 1) / 2);
    ctx.strokeStyle = dark ? 'rgba(254,240,138,0.7)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const off = (world.distance * 0.9 + i * 53) % 160;
      const ly = birdY - 30 + hash(i) * 60;
      ctx.globalAlpha = k * (1 - off / 160);
      ctx.beginPath();
      ctx.moveTo(BIRD_X - 40 - off, ly);
      ctx.lineTo(BIRD_X - 40 - off - 50 - hash(i + 9) * 40, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = k * 0.5;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(BIRD_X, birdY, BIRD_RADIUS + 14 + Math.sin(now / 70) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const invincible = world.clock < world.invincibleUntil && state.status !== 'over';
  if (!invincible || Math.floor(now / 110) % 2 === 0) {
    const sinceFlap = (world.clock - world.flapAt) / 1000;
    const wing = ready ? Math.sin(now / 90) * 0.6 : sinceFlap < 0.28 ? -1.1 + (sinceFlap / 0.28) * 1.5 : 0.4 + Math.sin(now / 140) * 0.15;
    const tilt = ready ? 0 : Math.max(-0.45, Math.min(0.9, world.birdVy / 650));
    bird(ctx, BIRD_X, birdY, tilt, wing, state.status === 'over');
  }

  // Con ma bay cạnh chim + thanh còn lại của vật phẩm đang có hiệu lực (trên mặt đất, góc trái)
  const ghostLeft = game.ghostLeftMs;
  if (ghostLeft > 0) {
    ctx.globalAlpha = Math.min(1, ghostLeft / 400) * 0.85;
    ctx.font = '34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👻', BIRD_X - 48, birdY - 26 + Math.sin(now / 200) * 6);
    ctx.globalAlpha = 1;
  }
  const badges: string[] = [];
  if (world.boostLeft > 0) badges.push(`⚡ còn ${world.boostLeft} ống`);
  if (ghostLeft > 0) badges.push(`👻 còn ${(ghostLeft / 1000).toFixed(1).replace('.', ',')} s`);
  let bx = 16;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (const b of badges) {
    const bw = ctx.measureText(b).width + 24;
    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    roundRect(ctx, bx, GROUND_Y + 12, bw, 36, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b, bx + 12, GROUND_Y + 38);
    bx += bw + 10;
  }

  // Hiệu ứng
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const age = (now - p.born) / 1000;
    if (age * 1000 > p.life) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - (age * 1000) / p.life;
    ctx.fillStyle = p.color;
    ctx.font = `bold ${p.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x + p.vx * age, p.y + p.vy * age);
  }
  ctx.globalAlpha = 1;
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y - 14 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 64 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 32 * s, y + 8 * s, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Ống bo tròn có mũ ở đầu hướng về khe; mũ có hình nốt nhạc. */
function pipe(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, color: string, cap: 'up' | 'down') {
  if (height <= 0) return;
  ctx.fillStyle = color;
  roundRect(ctx, x + 6, y, PIPE_WIDTH - 12, height, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, x + 16, y, 12, height, 6);
  const capY = cap === 'down' ? y + height - 30 : y;
  ctx.fillStyle = color;
  roundRect(ctx, x - 4, capY, PIPE_WIDTH + 8, 30, 12);
  ctx.strokeStyle = 'rgba(15,23,42,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x - 4, capY, PIPE_WIDTH + 8, 30, 12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♪', x + PIPE_WIDTH / 2, capY + 23);
}

/** Chú chim tròn màu vàng, mào hình nốt móc đơn. */
function bird(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, wing: number, dizzy: boolean) {
  const r = BIRD_RADIUS;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // Mào nốt nhạc
  ctx.strokeStyle = '#7c3aed';
  ctx.fillStyle = '#7c3aed';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-2, -r + 4);
  ctx.lineTo(-2, -r - 16);
  ctx.quadraticCurveTo(8, -r - 12, 10, -r - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-7, -r + 2, 6, 4.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Thân
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, r + 3, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.ellipse(-2, 9, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Má hồng
  ctx.fillStyle = 'rgba(244,114,182,0.6)';
  ctx.beginPath();
  ctx.arc(10, 6, 5, 0, Math.PI * 2);
  ctx.fill();
  // Mắt
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(10, -7, 8, 0, Math.PI * 2);
  ctx.fill();
  if (dizzy) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(6, -11);
    ctx.lineTo(14, -3);
    ctx.moveTo(14, -11);
    ctx.lineTo(6, -3);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(12, -7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(13.5, -8.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mỏ
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.moveTo(r - 2, -3);
  ctx.lineTo(r + 14, 2);
  ctx.lineTo(r - 2, 8);
  ctx.closePath();
  ctx.fill();
  // Cánh
  ctx.save();
  ctx.translate(-8, 2);
  ctx.rotate(wing);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(-10, 0, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}
