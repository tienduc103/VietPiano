import { describe, expect, it } from 'vitest';
import {
  acceptsChannel,
  applyVelocityCurve,
  DEFAULT_DEVICE_CONFIG,
  mapNote,
  mappedRange,
  physicalRange,
  rangeAdvice,
  sanitizeDeviceConfig,
  shouldPlaySound,
  type MidiDeviceConfig,
} from './deviceConfig';
import { identifyDevice } from './deviceProfiles';

const cfg = (patch: Partial<MidiDeviceConfig> = {}): MidiDeviceConfig => ({ ...DEFAULT_DEVICE_CONFIG, ...patch });
const micro25 = identifyDevice('microKEY2-25');
const piano = identifyDevice('Clavinova');

describe('dải phím', () => {
  it('mặc định theo số phím: 25 → C3–C5, 37 → C3–C6, 49 → C2–C6, 61 → C2–C7, 76 → E1–G7, 88 → A0–C8', () => {
    expect(physicalRange(cfg(), micro25)).toEqual({ low: 48, high: 72 });
    expect(physicalRange(cfg({ keyCount: 37 }), null)).toEqual({ low: 48, high: 84 });
    expect(physicalRange(cfg({ keyCount: 49 }), null)).toEqual({ low: 36, high: 84 });
    expect(physicalRange(cfg({ keyCount: 61 }), null)).toEqual({ low: 36, high: 96 });
    expect(physicalRange(cfg({ keyCount: 76 }), null)).toEqual({ low: 28, high: 103 });
    expect(physicalRange(cfg(), piano)).toEqual({ low: 21, high: 108 });
    // Không nhận ra model → 88 phím.
    expect(physicalRange(cfg(), null)).toEqual({ low: 21, high: 108 });
  });

  it('phím thấp nhất tuỳ chỉnh, không vượt 127', () => {
    expect(physicalRange(cfg({ keyCount: 25, lowestNote: 60 }), null)).toEqual({ low: 60, high: 84 });
    expect(physicalRange(cfg({ keyCount: 88, lowestNote: 100 }), null)).toEqual({ low: 40, high: 127 });
  });

  it('dải nhận được sau quãng tám + transpose', () => {
    expect(mappedRange(cfg({ octave: 1, transpose: -2 }), micro25)).toEqual({ low: 58, high: 82 });
  });
});

describe('mapNote', () => {
  it('dịch quãng tám và transpose', () => {
    expect(mapNote(60, cfg(), null)).toBe(60);
    expect(mapNote(60, cfg({ octave: -1 }), null)).toBe(48);
    expect(mapNote(60, cfg({ transpose: 2, octave: 1 }), null)).toBe(74);
  });

  it('dịch ra ngoài 0–127 → bỏ', () => {
    expect(mapNote(125, cfg({ octave: 1 }), null)).toBeNull();
    expect(mapNote(2, cfg({ transpose: -5 }), null)).toBeNull();
  });

  it('chỉ nhận phím trong dải (so với phím thô)', () => {
    const c = cfg({ limitToRange: true, octave: 1 });
    expect(mapNote(47, c, micro25)).toBeNull();
    expect(mapNote(48, c, micro25)).toBe(60);
    expect(mapNote(72, c, micro25)).toBe(84);
    expect(mapNote(73, c, micro25)).toBeNull();
  });
});

describe('kênh, lực gõ, tiếng', () => {
  it('lọc kênh: người dùng đánh số 1–16, thông điệp 0–15', () => {
    expect(acceptsChannel(cfg(), 9)).toBe(true);
    expect(acceptsChannel(cfg({ channel: 1 }), 0)).toBe(true);
    expect(acceptsChannel(cfg({ channel: 1 }), 1)).toBe(false);
  });

  it('đường cong lực gõ giữ trong 1–127, đơn điệu', () => {
    expect(applyVelocityCurve(64, 'normal')).toBe(64);
    expect(applyVelocityCurve(40, 'soft')).toBeGreaterThan(40);
    expect(applyVelocityCurve(40, 'hard')).toBeLessThan(40);
    expect(applyVelocityCurve(5, 'fixed')).toBe(100);
    expect(applyVelocityCurve(127, 'soft')).toBe(127);
    expect(applyVelocityCurve(1, 'hard')).toBe(1);
    expect(applyVelocityCurve(0, 'normal')).toBe(1);
  });

  it('tự phát tiếng chỉ cho controller không loa; tuỳ chỉnh bật/tắt', () => {
    expect(shouldPlaySound(cfg(), micro25)).toBe(true);
    expect(shouldPlaySound(cfg(), piano)).toBe(false);
    expect(shouldPlaySound(cfg(), identifyDevice('USB MIDI'))).toBe(false);
    expect(shouldPlaySound(cfg({ sound: 'on' }), piano)).toBe(true);
    expect(shouldPlaySound(cfg({ sound: 'off' }), micro25)).toBe(false);
  });

  it('gợi ý khi dải không phủ tầm bài học', () => {
    expect(rangeAdvice(cfg(), micro25)).toMatch(/C3–C5/);
    expect(rangeAdvice(cfg(), piano)).toBeNull();
    expect(rangeAdvice(cfg({ keyCount: 37 }), null)).toBeNull();
  });
});

describe('sanitizeDeviceConfig', () => {
  it('dữ liệu hỏng → mặc định; giới hạn giá trị', () => {
    expect(sanitizeDeviceConfig(null)).toEqual(DEFAULT_DEVICE_CONFIG);
    expect(sanitizeDeviceConfig({ keyCount: 30, transpose: 40, octave: -9, channel: 17, velocityCurve: 'x', sound: 'loud', enabled: 0 })).toEqual({
      ...DEFAULT_DEVICE_CONFIG,
      transpose: 12,
      octave: -3,
    });
    expect(sanitizeDeviceConfig({ enabled: false, keyCount: 61, lowestNote: 200, channel: 10, limitToRange: true })).toMatchObject({
      enabled: false,
      keyCount: 61,
      lowestNote: 127,
      channel: 10,
      limitToRange: true,
    });
  });
});
