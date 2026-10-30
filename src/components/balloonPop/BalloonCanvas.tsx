import { useEffect, useRef } from 'react';
import type { Balloon, BalloonPopGame, BalloonState } from '../../core/balloonPop/BalloonPopGame';
import { LETTERS, noteName, type Letter } from '../../core/balloonPop/notes';
import type { BalloonDisplay } from '../../core/balloonPop/storage';
import type { Duration } from '../../core/lessons/types';
import { useGameState } from '../games/shared';
import { isBlackKey } from '../../core/music/notes';
import { keyCenterPercent } from '../PianoKeyboard';

export interface BalloonView {
  from: number;
  to: number;
  withOctave: boolean;
  showFinger: boolean;
  /** Cách hiện nốt trên bóng: tên chữ, hình nốt (thẻ khuông HTML bám theo bóng), "?" (nghe đoán). */
  display: BalloonDisplay;
  /** Nốt bị ẩn tên (chế độ tên chữ → bóng hiện "?"). */
  hiddenLetters: readonly Letter[];
  /** Thẻ khuông vẽ sẵn theo `staffKey` (chế độ Hình nốt). */
  staffSvgs: Map<string, string> | null;
}

/** Khoá thẻ khuông của một quả: cao độ + trường độ. */
export const staffKey = (midi: number, duration: Duration) => `${midi}/${duration}`;

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

/** Màu bóng theo tên nốt (Đô đỏ → Si tím) — cùng nốt luôn cùng màu ở mọi quãng tám. */
export const LETTER_COLORS: Record<(typeof LETTERS)[number], string> = { C: '#ef4444', D: '#f97316', E: '#eab308', F: '#22c55e', G: '#06b6d4', A: '#3b82f6', B: '#a855f7' };

/** Số giả ngẫu nhiên ổn định theo chỉ số (vị trí mây…), 0–1. */
const hash = (k: number) => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Khu trò chơi Bóng bay: canvas vẽ trời, mây và các quả bóng — mỗi quả bay thẳng phía trên phím đàn của nó
 * (cùng cách chia phím với `PianoKeyboard`). Vòng requestAnimationFrame gọi `game.tick` rồi vẽ thẳng từ trạng thái
 * trò chơi, không re-render React mỗi khung. Quả cần đánh trước (bay cao nhất) có viền sáng.
 * Chế độ Hình nốt: mỗi quả có một thẻ khuông (SVG vẽ sẵn — font Bravura chỉ có trong trang, không vẽ được lên canvas);
 * React chỉ render lại danh sách thẻ khi bóng xuất hiện / nổ, vị trí thẻ đặt mỗi khung trong vòng vẽ.
 */
export function BalloonCanvas({ game, view }: { game: BalloonPopGame; view: BalloonView }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const cards = useRef(new Map<number, HTMLDivElement>());
  const { balloons } = useGameState(game);

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
    let prev: BalloonState = game.getState();
    const off = game.subscribe((s) => {
      const t = performance.now();
      const v = viewRef.current;
      if (s.lastEventTime !== prev.lastEventTime || s.popped !== prev.popped || s.escaped !== prev.escaped || s.wrongs !== prev.wrongs) {
        const last = s.lastBalloon;
        if (s.lastOutcome === 'pop' && last) {
          const { x, y } = position(last.balloon.note.midi, last.progress, size, v);
          const color = LETTER_COLORS[last.balloon.note.letter];
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            particles.push({ x, y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, born: t, life: 550, text: i % 2 ? '✦' : '●', color, size: 16 });
          }
          particles.push({ x, y: y - 20, vx: 0, vy: -60, born: t, life: 800, text: 'BÙM!', color: '#7c3aed', size: 26 });
        } else if (s.lastOutcome === 'escape' && last) {
          const { x } = position(last.balloon.note.midi, 1, size, v);
          particles.push({ x, y: 40, vx: 0, vy: 40, born: t, life: 1000, text: '−1 ❤️', color: '#e11d48', size: 24 });
        } else if (s.lastOutcome === 'wrong') {
          particles.push({ x: size.w / 2, y: size.h * 0.5, vx: 0, vy: -40, born: t, life: 600, text: '✕', color: '#e11d48', size: 40 });
        }
      }
      prev = s;
    });

    let raf = 0;
    const frame = () => {
      const now = performance.now();
      game.tick(now);
      draw(ctx, game, size, viewRef.current, now, particles);
      placeCards(game, cards.current, size, viewRef.current, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
    };
  }, [game]);

  return (
    <>
      <canvas ref={canvasRef} className="h-full w-full touch-none select-none" aria-label="Bóng bay nốt nhạc bay lên" data-testid="balloon-canvas" />
      {view.display === 'staff' &&
        balloons.map((b) => (
          <div
            key={b.id}
            ref={(el) => {
              if (el) cards.current.set(b.id, el);
              else cards.current.delete(b.id);
            }}
            className="pointer-events-none absolute top-0 left-0 rounded-xl bg-white/95 text-slate-900 shadow [&>svg]:h-full [&>svg]:w-full"
            style={{ visibility: 'hidden' }}
            data-testid="balloon-staff-card"
            data-midi={b.note.midi}
            data-duration={b.duration}
            dangerouslySetInnerHTML={{ __html: view.staffSvgs?.get(staffKey(b.note.midi, b.duration)) ?? '' }}
          />
        ))}
    </>
  );
}

/** Đặt thẻ khuông vào giữa quả bóng (cùng vị trí + đung đưa như hình vẽ trên canvas). */
function placeCards(game: BalloonPopGame, cards: Map<number, HTMLDivElement>, size: { w: number; h: number }, v: BalloonView, now: number) {
  if (cards.size === 0) return;
  for (const b of game.getState().balloons) {
    const el = cards.get(b.id);
    if (!el) continue;
    const { x, y, r } = balloonAt(game, b, size, v, now);
    const w = r * 1.55;
    const h = r * 1.35;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate(${x - w / 2}px, ${y - h / 2 - r * 0.05}px)`;
    el.style.visibility = 'visible';
  }
}

function balloonAt(game: BalloonPopGame, b: Balloon, size: { w: number; h: number }, v: BalloonView, now: number) {
  const { x, y, r } = position(b.note.midi, game.progressOf(b), size, v);
  return { x: x + Math.sin(now / 500 + b.id) * r * 0.12, y, r };
}

function radiusFor(size: { w: number; h: number }, v: BalloonView): number {
  let whites = 0;
  for (let m = v.from; m <= v.to; m++) if (!isBlackKey(m)) whites++;
  const keyW = size.w / Math.max(1, whites);
  const r = Math.max(18, Math.min(size.h * 0.09, 48, keyW * 0.95));
  // Hình nốt cần chỗ cho khuông: bóng to hơn (có thể chờm sang phím bên cạnh).
  return v.display === 'staff' ? Math.max(r, Math.min(size.h * 0.13, 66)) : r;
}

function position(midi: number, progress: number, size: { w: number; h: number }, v: BalloonView): { x: number; y: number; r: number } {
  const r = radiusFor(size, v);
  const x = (keyCenterPercent(midi, v.from, v.to) / 100) * size.w;
  // Mép dưới (cả dây khuất) → mép trên (bóng khuất hẳn).
  const y = size.h + r * 1.2 - progress * (size.h + r * 2.4);
  return { x, y, r };
}

function draw(ctx: CanvasRenderingContext2D, game: BalloonPopGame, size: { w: number; h: number; dpr: number }, v: BalloonView, now: number, particles: Particle[]) {
  const { w, h, dpr } = size;
  if (w === 0 || h === 0) return;
  const dark = document.documentElement.classList.contains('dark');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (dark) {
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(1, '#4c1d95');
  } else {
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(1, '#fdf2f8');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Mây trôi chậm
  ctx.fillStyle = dark ? 'rgba(199,210,254,0.18)' : 'rgba(255,255,255,0.85)';
  const drift = now / 60;
  for (let k = 0; k < 6; k++) {
    const span = w + 240;
    const x = ((hash(k) * span + drift * (0.4 + hash(k + 9))) % span) - 120;
    const y = 30 + hash(k * 7 + 3) * (h * 0.6);
    const s = 0.6 + hash(k * 3 + 1) * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
    ctx.arc(x + 28 * s, y - 12 * s, 32 * s, 0, Math.PI * 2);
    ctx.arc(x + 60 * s, y, 24 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  const state = game.getState();
  state.balloons.forEach((b, i) => {
    const { x: sx, y, r } = balloonAt(game, b, size, v, now);
    const x = sx - Math.sin(now / 500 + b.id) * r * 0.12;
    balloon(ctx, sx, y, r, LETTER_COLORS[b.note.letter], i === 0, now);
    // Tên nốt trên bóng (Hình nốt: thẻ khuông HTML đè lên)
    if (v.display !== 'staff') {
      const hidden = v.display === 'ear' || v.hiddenLetters.includes(b.note.letter);
      const label = hidden ? '?' : noteName(b.note.midi, v.display === 'letter' ? 'letter' : 'solfege', v.withOctave);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.round(r * (label.length > 3 ? 0.55 : label.length > 2 ? 0.65 : 0.8));
      ctx.font = `800 ${fs}px system-ui, sans-serif`;
      ctx.strokeText(label, sx, y - r * 0.08);
      ctx.fillText(label, sx, y - r * 0.08);
    }
    // Ngón tay + tay (T/P) dưới nút buộc
    if (v.showFinger) {
      const fy = y + r * 1.75;
      ctx.fillStyle = b.note.hand === 'left' ? '#0284c7' : '#ea580c';
      ctx.beginPath();
      ctx.arc(x, fy, Math.min(r, 48) * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(Math.min(r, 48) * 0.5)}px system-ui, sans-serif`;
      ctx.fillText(`${b.note.hand === 'left' ? 'T' : 'P'}${b.note.finger}`, x, fy + 1);
    }
  });

  // Hiệu ứng
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    const age = now - pt.born;
    if (age > pt.life) {
      particles.splice(i, 1);
      continue;
    }
    const k = age / 1000;
    ctx.globalAlpha = 1 - age / pt.life;
    ctx.fillStyle = pt.color;
    ctx.font = `800 ${pt.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pt.text, pt.x + pt.vx * k, pt.y + pt.vy * k);
  }
  ctx.globalAlpha = 1;
}

function balloon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, urgent: boolean, now: number) {
  // Dây
  ctx.strokeStyle = 'rgba(71,85,105,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.12);
  ctx.quadraticCurveTo(x - r * 0.25, y + r * 1.35, x, y + r * 1.6);
  ctx.stroke();
  // Nút buộc
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.02);
  ctx.lineTo(x - r * 0.14, y + r * 1.18);
  ctx.lineTo(x + r * 0.14, y + r * 1.18);
  ctx.fill();
  // Quả bóng (hơi thuôn)
  if (urgent) {
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 18 + 8 * Math.sin(now / 180);
  }
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.88, r * 1.05, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (urgent) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}
