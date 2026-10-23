import { describe, expect, it } from 'vitest';
import { FLOATING_MARGIN_PX, isDrag, pixelsToPosition, positionToPixels, sanitizePosition } from './floatingPosition';

const vp = { width: 1180, height: 820 };

describe('floatingPosition', () => {
  it('góc trên trái / dưới phải nằm trong lề', () => {
    expect(positionToPixels({ x: 0, y: 0 }, 48, vp)).toEqual({ left: FLOATING_MARGIN_PX, top: FLOATING_MARGIN_PX });
    expect(positionToPixels({ x: 1, y: 1 }, 48, vp)).toEqual({ left: 1180 - 48 - 8, top: 820 - 48 - 8 });
  });

  it('đổi px ↔ tỉ lệ hai chiều', () => {
    const pos = pixelsToPosition(300, 200, 48, vp);
    const px = positionToPixels(pos, 48, vp);
    expect(px.left).toBeCloseTo(300);
    expect(px.top).toBeCloseTo(200);
  });

  it('kéo ra ngoài màn hình thì kẹp lại trong màn hình', () => {
    expect(pixelsToPosition(-100, 5000, 48, vp)).toEqual({ x: 0, y: 1 });
  });

  it('giữ vị trí tương đối khi xoay màn hình', () => {
    const pos = pixelsToPosition(1180 - 48 - 8, 8, 48, vp);
    expect(positionToPixels(pos, 48, { width: 820, height: 1180 })).toEqual({ left: 820 - 48 - 8, top: 8 });
  });

  it('màn hình nhỏ hơn nút không chia cho 0', () => {
    expect(pixelsToPosition(10, 10, 48, { width: 40, height: 40 })).toEqual({ x: 0, y: 0 });
  });

  it('di chuyển nhỏ là bấm, không phải kéo', () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(6, 6)).toBe(true);
  });

  it('chuẩn hoá dữ liệu lưu', () => {
    expect(sanitizePosition({ x: 0.5, y: 2 })).toEqual({ x: 0.5, y: 1 });
    expect(sanitizePosition({ x: 'a', y: 0 })).toBeNull();
    expect(sanitizePosition({ x: NaN, y: 0 })).toBeNull();
    expect(sanitizePosition(null)).toBeNull();
    expect(sanitizePosition(undefined)).toBeNull();
  });
});
