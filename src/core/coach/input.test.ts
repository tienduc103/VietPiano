import { describe, expect, it } from 'vitest';
import { resolveInput } from './input';

describe('resolveInput', () => {
  it('tự động: có đàn MIDI → MIDI (+ bàn phím ảo); pedal chỉ khi đã thấy tín hiệu', () => {
    const r = resolveInput('auto', true, true, false);
    expect(r.primary).toBe('midi');
    expect([...r.sources].sort()).toEqual(['midi', 'virtual']);
    expect(r.capabilities).toEqual({ noteOff: true, velocity: true, relativeLevel: false, pedal: false, polyphonic: true });
    expect(resolveInput('auto', true, false, true).capabilities.pedal).toBe(true);
  });

  it('tự động không có đàn: micro đang bật → micro (nốt đơn, không Note Off); micro tắt → bàn phím ảo', () => {
    const mic = resolveInput('auto', false, true, true);
    expect(mic.primary).toBe('microphone');
    expect(mic.capabilities).toEqual({ noteOff: false, velocity: false, relativeLevel: true, pedal: false, polyphonic: false });
    const v = resolveInput('auto', false, false, true);
    expect(v.primary).toBe('virtual');
    expect(v.capabilities).toMatchObject({ velocity: false, pedal: false, noteOff: true });
  });

  it('chọn cố định: "Phím ảo" bỏ qua đàn MIDI; "Đàn MIDI" chưa nối → bàn phím ảo; "Micro" dùng micro dù có đàn', () => {
    expect(resolveInput('virtual', true, true, true).primary).toBe('virtual');
    expect(resolveInput('midi', false, true, true).primary).toBe('virtual');
    expect(resolveInput('microphone', true, false, true).primary).toBe('microphone'); // người dùng chủ động chọn micro
  });
});
