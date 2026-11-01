import { useEffect, useRef } from 'react';

const COLORS = ['#f43f5e', '#f59e0b', '#facc15', '#22c55e', '#06b6d4', '#6366f1', '#d946ef'];
const BURSTS = 9;
const BURST_GAP_MS = 350;
const SPARKS_PER_BURST = 40;
const SPARK_LIFE_MS = 1400;
/** px/s² — tia pháo hoa rơi dần. */
const GRAVITY = 170;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
}

/**
 * Pháo hoa toàn màn hình, tự tắt sau vài giây. Lớp canvas không nhận thao tác nên vẫn bấm được nút bên dưới.
 * Người dùng bật "giảm chuyển động" của hệ thống → không chạy.
 */
export function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const start = performance.now();
    const sparks: Spark[] = [];
    for (let k = 0; k < BURSTS; k++) {
      const x = w * (0.1 + Math.random() * 0.8);
      const y = h * (0.1 + Math.random() * 0.5);
      const color = COLORS[k % COLORS.length];
      for (let i = 0; i < SPARKS_PER_BURST; i++) {
        const angle = (i / SPARKS_PER_BURST) * Math.PI * 2;
        const speed = 120 + Math.random() * 130;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          born: start + k * BURST_GAP_MS,
          color: i % 4 ? color : '#ffffff',
        });
      }
    }
    const end = start + (BURSTS - 1) * BURST_GAP_MS + SPARK_LIFE_MS;

    let raf = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of sparks) {
        const age = now - s.born;
        if (age < 0 || age > SPARK_LIFE_MS) continue;
        const t = age / 1000;
        ctx.globalAlpha = 1 - age / SPARK_LIFE_MS;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x + s.vx * t, s.y + s.vy * t + (GRAVITY * t * t) / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (now < end) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden data-testid="fireworks" />;
}
