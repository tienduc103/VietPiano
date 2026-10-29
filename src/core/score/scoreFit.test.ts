import { describe, expect, it } from 'vitest';
import { fitScore } from './scoreFit';

const OPTS = { minScale: 0.8, maxScale: 2.4, fallbackScale: 1.6 };

describe('fitScore', () => {
  it('lần đầu: phóng vừa chiều cao, canh giữa; giới hạn min/max', () => {
    const fit = fitScore(null, 400, 200, OPTS);
    expect(fit.scale).toBe(2);
    expect(fit.top).toBe(0);
    const big = fitScore(null, 1000, 200, OPTS);
    expect(big.scale).toBe(2.4);
    expect(big.top).toBe((1000 - 480) / 2);
    expect(fitScore(null, 100, 200, OPTS).scale).toBe(0.8);
  });

  it('chưa đo được vùng nhìn → tỉ lệ mặc định', () => {
    expect(fitScore(null, 0, 200, OPTS)).toMatchObject({ scale: 1.6, top: 0 });
  });

  it('vùng nhìn co giãn ít theo từng nốt (Romance hai tay: 396 ↔ 424 px) → giữ nguyên tỉ lệ và vị trí', () => {
    const first = fitScore(null, 424, 326, OPTS);
    let fit = first;
    for (const h of [396, 424, 404, 396, 424]) {
      fit = fitScore(fit, h, 326, OPTS);
      expect(fit).toBe(first);
    }
  });

  it('đổi nhiều (ẩn/hiện bàn phím, xoay máy) → đặt lại', () => {
    const first = fitScore(null, 424, 326, OPTS);
    const next = fitScore(first, 590, 326, OPTS);
    expect(next).not.toBe(first);
    expect(next.scale).toBeCloseTo(590 / 326);
    expect(fitScore(next, 424, 326, OPTS).scale).toBeCloseTo(424 / 326);
  });

  it('đổi bài (chiều cao khuông khác) → đặt lại dù vùng nhìn không đổi', () => {
    const first = fitScore(null, 400, 200, OPTS);
    expect(fitScore(first, 400, 326, OPTS).scale).toBeCloseTo(400 / 326);
  });

  it('không giữ lại kết quả của lúc chưa đo được vùng nhìn', () => {
    const blind = fitScore(null, 0, 200, OPTS);
    expect(fitScore(blind, 400, 200, OPTS).scale).toBe(2);
  });
});
