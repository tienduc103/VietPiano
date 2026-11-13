import { describe, expect, it } from 'vitest';
import { approach, classifyDirection, classifyDuration, classifyRegister, pitchHeight } from './classify';
import { DEFAULT_SETTINGS, LEVEL_PROFILES, sanitizeSettings } from './config';

const T = DEFAULT_SETTINGS;

describe('classifyRegister — chỉ dựa trên số nốt MIDI', () => {
  it('vùng thấp / giữa / cao theo ngưỡng', () => {
    expect(classifyRegister(48, T)).toBe('low');
    expect(classifyRegister(57, T)).toBe('low');
    expect(classifyRegister(60, T)).toBe('middle');
    expect(classifyRegister(72, T)).toBe('high');
    expect(classifyRegister(84, T)).toBe('high');
  });
  it('nốt mẫu nghe của mọi mức nằm đúng vùng và cách nhau đủ xa', () => {
    for (const p of Object.values(LEVEL_PROFILES)) {
      expect(Math.min(...p.listenHigh) - Math.max(...p.listenLow)).toBeGreaterThanOrEqual(8);
    }
    // Mức 1: hai vùng cách nhau gần hai quãng tám.
    expect(Math.min(...LEVEL_PROFILES[1].listenHigh) - Math.max(...LEVEL_PROFILES[1].listenLow)).toBeGreaterThanOrEqual(24);
  });
});

describe('classifyDirection — so sánh tương đối hai nốt liên tiếp', () => {
  it('lên / xuống / bằng', () => {
    expect(classifyDirection(60, 62)).toBe('up');
    expect(classifyDirection(60, 59)).toBe('down');
    expect(classifyDirection(60, 60)).toBe('same');
    // Không phụ thuộc vùng: hai nốt đều ở vùng cao vẫn có hướng.
    expect(classifyDirection(80, 78)).toBe('down');
  });
});

describe('classifyDuration — ngưỡng trò chơi', () => {
  it('ngắn 0,15–0,7 s · dài ≥ 1,5 s · giữa = chưa rõ · quá vội = bỏ', () => {
    expect(classifyDuration(100, T)).toBe('tooQuick');
    expect(classifyDuration(150, T)).toBe('short');
    expect(classifyDuration(700, T)).toBe('short');
    expect(classifyDuration(701, T)).toBe('unclear');
    expect(classifyDuration(1499, T)).toBe('unclear');
    expect(classifyDuration(1500, T)).toBe('long');
    expect(classifyDuration(NaN, T)).toBe('tooQuick');
  });
  it('ngưỡng cấu hình được', () => {
    const t = sanitizeSettings({ shortMaxMs: 1000, longMinMs: 1300 });
    expect(classifyDuration(900, t)).toBe('short');
    expect(classifyDuration(1300, t)).toBe('long');
  });
});

describe('sanitizeSettings', () => {
  it('giữ thứ tự ngưỡng hợp lệ dù dữ liệu hỏng', () => {
    const s = sanitizeSettings({ shortMinMs: 300, shortMaxMs: 100, longMinMs: 50, lowMax: 70, highMin: 40, level: 7, effectVolume: 9 });
    expect(s.shortMaxMs).toBeGreaterThan(s.shortMinMs);
    expect(s.longMinMs).toBeGreaterThan(s.shortMaxMs);
    expect(s.highMin).toBeGreaterThan(s.lowMax);
    expect(s.level).toBe(1);
    expect(s.effectVolume).toBe(1);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('chuyển động', () => {
  it('pitchHeight kẹp 0–1 và tăng theo cao độ', () => {
    expect(pitchHeight(0)).toBe(0);
    expect(pitchHeight(127)).toBe(1);
    expect(pitchHeight(72)).toBeGreaterThan(pitchHeight(60));
  });
  it('approach: đi dần về đích, mỗi khung có giới hạn, không vượt đích', () => {
    let y = 0;
    const first = approach(y, 1, 16);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(0.08);
    for (let i = 0; i < 400; i++) y = approach(y, 1, 16);
    expect(y).toBe(1);
    // Khung rất dài (tab ẩn) bị kẹp → không nhảy.
    expect(approach(0, 1, 10_000)).toBeLessThanOrEqual(0.08);
    expect(approach(0.5, 0, 16)).toBeLessThan(0.5);
  });
});
