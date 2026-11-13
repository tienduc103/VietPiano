import { describe, expect, it } from 'vitest';
import { PressTracker, type MidiEvent } from './PressTracker';

const on = (n: number, t: number, velocity = 80): MidiEvent => ({ noteNumber: n, eventType: 'noteOn', velocity, timestamp: t, sourceDevice: 'midi' });
const off = (n: number, t: number): MidiEvent => ({ noteNumber: n, eventType: 'noteOff', timestamp: t, sourceDevice: 'midi' });
const pedal = (down: boolean, t: number): MidiEvent => ({ noteNumber: 64, eventType: down ? 'pedalDown' : 'pedalUp', timestamp: t, sourceDevice: 'midi' });

describe('PressTracker', () => {
  it('đo thời gian giữ phím từ note-on tới note-off', () => {
    const tr = new PressTracker();
    expect(tr.handle(on(60, 1000))?.kind).toBe('start');
    const r = tr.handle(off(60, 1600));
    expect(r?.kind === 'end' && r.press.durationMs).toBe(600);
  });

  it('note-on velocity 0 tương đương note-off', () => {
    const tr = new PressTracker();
    tr.handle(on(60, 0));
    const r = tr.handle(on(60, 2000, 0));
    expect(r?.kind === 'end' && r.press.durationMs).toBe(2000);
    expect(tr.heldKeys()).toHaveLength(0);
  });

  it('nhiều phím cùng lúc: mỗi phím một mốc riêng', () => {
    const tr = new PressTracker();
    tr.handle(on(60, 0));
    tr.handle(on(64, 200));
    tr.handle(on(67, 300));
    expect(tr.heldKeys().map((k) => k.midi)).toEqual([60, 64, 67]);
    expect(tr.current()?.midi).toBe(60);
    const a = tr.handle(off(64, 500));
    const b = tr.handle(off(60, 1800));
    expect(a?.kind === 'end' && a.press.durationMs).toBe(300);
    expect(b?.kind === 'end' && b.press.durationMs).toBe(1800);
    expect(tr.heldKeys().map((k) => k.midi)).toEqual([67]);
  });

  it('note-on lặp khi đang giữ → giữ mốc đầu; note-off lạ → bỏ', () => {
    const tr = new PressTracker();
    tr.handle(on(60, 0));
    expect(tr.handle(on(60, 500))).toBeNull();
    expect(tr.handle(off(62, 600))).toBeNull();
    const r = tr.handle(off(60, 1000));
    expect(r?.kind === 'end' && r.press.durationMs).toBe(1000);
  });

  it('pedal vang KHÔNG kéo dài thời gian giữ phím vật lý', () => {
    const tr = new PressTracker();
    tr.handle(pedal(true, 0));
    tr.handle(on(60, 100));
    const r = tr.handle(off(60, 400)); // thả phím sau 0,3 s, pedal vẫn đạp → âm còn ngân
    tr.handle(pedal(false, 3000));
    expect(r?.kind).toBe('end');
    if (r?.kind === 'end') {
      expect(r.press.durationMs).toBe(300);
      expect(r.press.sustainedByPedal).toBe(true);
    }
    tr.handle(on(60, 4000));
    const r2 = tr.handle(off(60, 6000));
    expect(r2?.kind === 'end' && r2.press.sustainedByPedal).toBe(false);
  });

  it('mất kết nối: releaseAll đóng mọi phím, đánh dấu aborted, nhả pedal', () => {
    const tr = new PressTracker();
    tr.handle(pedal(true, 0));
    tr.handle(on(60, 0));
    tr.handle(on(72, 10));
    const out = tr.releaseAll(900);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.aborted)).toBe(true);
    expect(tr.heldKeys()).toHaveLength(0);
    expect(tr.pedalDown()).toBe(false);
  });

  it('mốc thả trước mốc nhấn (đồng hồ lệch) → thời lượng 0, không âm', () => {
    const tr = new PressTracker();
    tr.handle(on(60, 1000));
    const r = tr.handle(off(60, 900));
    expect(r?.kind === 'end' && r.press.durationMs).toBe(0);
  });

  it('lực gõ được ghi lại nhưng không ảnh hưởng thời lượng', () => {
    const tr = new PressTracker();
    tr.handle(on(60, 0, 127));
    const r = tr.handle(off(60, 500));
    expect(r?.kind === 'end' && r.press.velocity).toBe(127);
    expect(r?.kind === 'end' && r.press.durationMs).toBe(500);
  });
});
