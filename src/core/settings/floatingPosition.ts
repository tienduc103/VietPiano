/**
 * Vị trí nút nổi kéo thả được. Lưu theo tỉ lệ 0–1 của vùng nút có thể nằm (màn hình trừ kích thước nút
 * và lề) để vẫn đúng chỗ tương đối khi xoay iPad / đổi kích thước cửa sổ.
 */
export interface FloatingPosition {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Di chuyển ít hơn ngưỡng này (px) thì coi là bấm, không phải kéo. */
export const DRAG_THRESHOLD_PX = 8;
/** Lề tối thiểu giữa nút và mép màn hình (px). */
export const FLOATING_MARGIN_PX = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Toạ độ góc trên trái (px) của nút có kích thước `size` tại vị trí tỉ lệ `pos`. */
export function positionToPixels(pos: FloatingPosition, size: number, vp: Viewport): { left: number; top: number } {
  const spanX = Math.max(0, vp.width - size - 2 * FLOATING_MARGIN_PX);
  const spanY = Math.max(0, vp.height - size - 2 * FLOATING_MARGIN_PX);
  return { left: FLOATING_MARGIN_PX + clamp01(pos.x) * spanX, top: FLOATING_MARGIN_PX + clamp01(pos.y) * spanY };
}

/** Ngược lại: góc trên trái (px, có thể ra ngoài màn hình khi đang kéo) → vị trí tỉ lệ đã kẹp trong màn hình. */
export function pixelsToPosition(left: number, top: number, size: number, vp: Viewport): FloatingPosition {
  const spanX = vp.width - size - 2 * FLOATING_MARGIN_PX;
  const spanY = vp.height - size - 2 * FLOATING_MARGIN_PX;
  return {
    x: spanX > 0 ? clamp01((left - FLOATING_MARGIN_PX) / spanX) : 0,
    y: spanY > 0 ? clamp01((top - FLOATING_MARGIN_PX) / spanY) : 0,
  };
}

export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

/** Dữ liệu đọc từ localStorage: hợp lệ → kẹp vào 0–1, không thì null (vị trí mặc định). */
export function sanitizePosition(v: unknown): FloatingPosition | null {
  if (typeof v !== 'object' || v === null) return null;
  const { x, y } = v as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}
