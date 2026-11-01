import type { CarDef, WingStyle } from '../../core/f1Racing/config';

/** Kích thước vẽ của xe theo đơn vị logic: dài 96 (= 8 m), rộng 56. */
export const CAR_DRAW_LENGTH = 96;
export const CAR_DRAW_WIDTH = 56;

export interface CarDrawOptions {
  /** Nghiêng khi chuyển làn (radian). */
  tilt?: number;
  /** Độ dài lửa động cơ 0–1 (theo tốc độ). */
  flame?: number;
  /** Lửa tăng tốc bùng lên. */
  boost?: boolean;
  /** Quầng sáng của chế độ tự né. */
  shield?: boolean;
  /** Đồng hồ (ms) cho hoạt ảnh. */
  time?: number;
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, spin: boolean) {
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.roundRect(x - 7, y - 12, 14, 24, 4);
  ctx.fill();
  ctx.fillStyle = '#4b5563';
  // Gân lốp chạy theo tốc độ để thấy bánh đang quay.
  const off = spin ? (time / 22) % 8 : 0;
  for (let k = -12 + off; k < 12; k += 8) ctx.fillRect(x - 6, y + k, 12, 2);
}

function drawWing(ctx: CanvasRenderingContext2D, style: WingStyle, body: string, accent: string) {
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(15,23,42,.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  switch (style) {
    case 'flat':
      ctx.roundRect(-27, -48, 54, 9, 3);
      break;
    case 'swept':
      ctx.moveTo(-28, -38);
      ctx.quadraticCurveTo(0, -56, 28, -38);
      ctx.lineTo(24, -33);
      ctx.quadraticCurveTo(0, -46, -24, -33);
      ctx.closePath();
      break;
    case 'delta':
      ctx.moveTo(0, -52);
      ctx.lineTo(28, -35);
      ctx.lineTo(-28, -35);
      ctx.closePath();
      break;
    case 'twin':
      ctx.roundRect(-28, -49, 56, 5, 2);
      ctx.roundRect(-25, -41, 50, 5, 2);
      break;
    case 'arrow':
      ctx.moveTo(-27, -34);
      ctx.lineTo(0, -44);
      ctx.lineTo(27, -34);
      ctx.lineTo(27, -41);
      ctx.lineTo(0, -52);
      ctx.lineTo(-27, -41);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
  // Hai đầu cánh gió.
  ctx.fillStyle = accent;
  ctx.fillRect(-29, -46, 3, 11);
  ctx.fillRect(26, -46, 3, 11);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/** Trang trí riêng của từng xe; không dùng logo hay màu sơn của đội đua có thật. */
function drawLivery(ctx: CanvasRenderingContext2D, car: CarDef) {
  ctx.fillStyle = car.accent;
  ctx.strokeStyle = car.accent;
  switch (car.mark) {
    case 'flash':
      ctx.beginPath();
      ctx.moveTo(-3, -30);
      ctx.lineTo(3, -30);
      ctx.lineTo(1, -14);
      ctx.lineTo(-1, -14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-15, 18, 5, 16);
      ctx.fillRect(10, 18, 5, 16);
      break;
    case 'wave':
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 12, 2);
        ctx.quadraticCurveTo(side * 20, 12, side * 12, 20);
        ctx.quadraticCurveTo(side * 6, 28, side * 13, 36);
        ctx.stroke();
      }
      break;
    case 'star':
      star(ctx, 0, -22, 6);
      star(ctx, -14, 20, 4.5);
      star(ctx, 14, 20, 4.5);
      break;
    case 'bolt':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 16, 2);
        ctx.lineTo(side * 10, 17);
        ctx.lineTo(side * 15, 17);
        ctx.lineTo(side * 9, 34);
        ctx.lineTo(side * 19, 14);
        ctx.lineTo(side * 14, 14);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'rocket':
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(4, -20);
      ctx.lineTo(-4, -20);
      ctx.closePath();
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 9, 10);
        ctx.lineTo(side * 18, 34);
        ctx.lineTo(side * 9, 30);
        ctx.closePath();
        ctx.fill();
      }
      break;
  }
}

/** Vẽ xe nhìn từ trên xuống, đầu xe hướng lên, tâm tại (x, y). */
export function drawF1Car(ctx: CanvasRenderingContext2D, x: number, y: number, car: CarDef, opts: CarDrawOptions = {}): void {
  const { tilt = 0, flame = 0, boost = false, shield = false, time = 0 } = opts;
  const spin = flame > 0;
  ctx.save();
  ctx.translate(x, y);

  if (shield) {
    const pulse = 1 + Math.sin(time / 90) * 0.06;
    const glow = ctx.createRadialGradient(0, 0, 16, 0, 0, 78 * pulse);
    glow.addColorStop(0, `${car.flame}cc`);
    glow.addColorStop(0.6, `${car.flame}55`);
    glow.addColorStop(1, `${car.flame}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 78 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.65 + Math.sin(time / 70) * 0.25;
    ctx.beginPath();
    ctx.ellipse(0, 0, 44 * pulse, 66 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.rotate(tilt);

  // Bóng đổ
  ctx.fillStyle = 'rgba(15,23,42,.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, 28, 46, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lửa động cơ
  if (flame > 0.02) {
    const len = (boost ? 44 : 14 + flame * 18) * (0.85 + Math.sin(time / 30) * 0.15);
    for (const [side, w] of [[-7, 5], [7, 5]] as const) {
      const g = ctx.createLinearGradient(0, 46, 0, 46 + len);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, car.flame);
      g.addColorStop(1, `${car.flame}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(side - w, 45);
      ctx.quadraticCurveTo(side, 46 + len * 1.2, side + w, 45);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Bánh xe
  wheel(ctx, -28, -24, time, spin);
  wheel(ctx, 28, -24, time, spin);
  wheel(ctx, -30, 28, time, spin);
  wheel(ctx, 30, 28, time, spin);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-24, -24);
  ctx.lineTo(24, -24);
  ctx.moveTo(-26, 28);
  ctx.lineTo(26, 28);
  ctx.stroke();

  // Thân xe: sườn xe + mũi
  const pod = 20 * car.podWidth;
  ctx.fillStyle = car.bodyDark;
  ctx.beginPath();
  ctx.moveTo(-8, -28);
  ctx.quadraticCurveTo(-pod, -6, -pod, 16);
  ctx.quadraticCurveTo(-pod, 38, -10, 44);
  ctx.lineTo(10, 44);
  ctx.quadraticCurveTo(pod, 38, pod, 16);
  ctx.quadraticCurveTo(pod, -6, 8, -28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = car.body;
  ctx.beginPath();
  ctx.moveTo(-4, -46);
  ctx.quadraticCurveTo(0, -50, 4, -46);
  ctx.lineTo(8, -14);
  ctx.quadraticCurveTo(pod - 3, 2, pod - 3, 16);
  ctx.quadraticCurveTo(pod - 4, 34, 8, 41);
  ctx.lineTo(-8, 41);
  ctx.quadraticCurveTo(-pod + 4, 34, -pod + 3, 16);
  ctx.quadraticCurveTo(-pod + 3, 2, -8, -14);
  ctx.closePath();
  ctx.fill();

  drawLivery(ctx, car);
  drawWing(ctx, car.wing, car.body, car.accent);

  // Cánh gió sau
  ctx.fillStyle = car.bodyDark;
  ctx.beginPath();
  ctx.roundRect(-24, 39, 48, 8, 3);
  ctx.fill();
  ctx.fillStyle = car.accent;
  ctx.beginPath();
  ctx.roundRect(-24, 42, 48, 3, 1.5);
  ctx.fill();

  // Buồng lái + mũ bảo hiểm
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -2, 8.5, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = car.accent;
  ctx.beginPath();
  ctx.arc(0, 1, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(15,23,42,.75)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
