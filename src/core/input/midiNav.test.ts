import { describe, expect, it } from 'vitest';
import { MidiNav, actionFor, isBlackKey, type MidiNavAction } from './midiNav';

function target(action: MidiNavAction, opts: { available?: () => boolean } = {}) {
  const t = { action, clicks: 0, available: opts.available ?? (() => true), activate: () => t.clicks++ };
  return t;
}

const note = (midi: number, time: number) => ({ kind: 'note' as const, midi, time });

describe('isBlackKey / actionFor', () => {
  it('phím trắng → đi tới, phím đen → lùi lại, pedal → đi tới', () => {
    for (const m of [60, 62, 64, 65, 67, 69, 71, 21, 108]) expect(isBlackKey(m)).toBe(false);
    for (const m of [61, 63, 66, 68, 70, 22, 106]) expect(isBlackKey(m)).toBe(true);
    expect(actionFor(note(48, 0))).toBe('forward');
    expect(actionFor(note(49, 0))).toBe('back');
    expect(actionFor({ kind: 'pedal', time: 0 })).toBe('forward');
  });
});

describe('MidiNav', () => {
  it('phím trắng bấm nút đi tới, phím đen bấm nút lùi lại', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    const back = target('back');
    nav.register(fwd, 0);
    nav.register(back, 0);
    expect(nav.press(note(64, 2000))).toBe('forward');
    expect(fwd.clicks).toBe(1);
    // Phím đen chờ 200 ms xem có phím đen thứ hai không rồi mới "lùi lại".
    expect(nav.press(note(63, 4000))).toBe('pending');
    expect(nav.flush(4100)).toBeNull();
    expect(back.clicks).toBe(0);
    expect(nav.flush(4200)).toBe('back');
    expect(back.clicks).toBe(1);
    expect(nav.press({ kind: 'pedal', time: 6000 })).toBe('forward');
    expect(fwd.clicks).toBe(2);
  });

  it('bỏ phím trong 1,2 s đầu sau khi nút xuất hiện', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    nav.register(fwd, 1000);
    expect(nav.press(note(60, 1500))).toBeNull();
    expect(nav.press(note(60, 2199))).toBeNull();
    expect(nav.press(note(60, 2200))).toBe('forward');
    expect(fwd.clicks).toBe(1);
  });

  it('sau mỗi lần điều hướng chờ lại 1,2 s (bấm nhiều phím một lúc chỉ đi một bước)', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    nav.register(fwd, 0);
    expect(nav.press(note(60, 5000))).toBe('forward');
    expect(nav.press(note(64, 5010))).toBeNull();
    expect(nav.press(note(67, 6000))).toBeNull();
    expect(nav.press(note(67, 6200))).toBe('forward');
    expect(fwd.clicks).toBe(2);
  });

  it('chạm màn hình → chờ lại 1,2 s', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    nav.register(fwd, 0);
    nav.touched(5000);
    expect(nav.press(note(60, 5500))).toBeNull();
    expect(nav.press(note(60, 6300))).toBe('forward');
  });

  it('đang có màn nghe nốt → phím đàn vẫn là phím đàn', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    nav.register(fwd, 0);
    const stop = nav.listen();
    const stop2 = nav.listen();
    expect(nav.listening).toBe(true);
    expect(nav.press(note(60, 5000))).toBeNull();
    stop();
    stop(); // gỡ hai lần không làm sai bộ đếm
    expect(nav.press(note(60, 5000))).toBeNull();
    stop2();
    expect(nav.listening).toBe(false);
    expect(nav.press(note(60, 5000))).toBe('forward');
  });

  it('ưu tiên nút xuất hiện sau cùng còn dùng được; nút ẩn / tắt bị bỏ qua', () => {
    const nav = new MidiNav(1200);
    const older = target('forward');
    let shown = true;
    const newer = target('forward', { available: () => shown });
    nav.register(older, 0);
    nav.register(newer, 100);
    expect(nav.press(note(60, 2000))).toBe('forward');
    expect(newer.clicks).toBe(1);
    shown = false;
    expect(nav.press(note(60, 4000))).toBe('forward');
    expect(older.clicks).toBe(1);
  });

  it('không có nút phù hợp hoặc nút đã gỡ → không làm gì', () => {
    const nav = new MidiNav(1200);
    const fwd = target('forward');
    const off = nav.register(fwd, 0);
    expect(nav.press(note(61, 2000))).toBe('pending');
    expect(nav.flush(2200)).toBeNull();
    off();
    expect(nav.press(note(60, 3000))).toBeNull();
    expect(fwd.clicks).toBe(0);
  });

  it('hai phím đen bất kỳ cùng lúc → về Trang chủ, không "lùi lại"', () => {
    const nav = new MidiNav(1200, 200);
    let home = 0;
    nav.setHome(() => home++);
    const back = target('back');
    nav.register(target('forward'), 0);
    nav.register(back, 0);
    expect(nav.press(note(61, 2000))).toBe('pending');
    expect(nav.press(note(78, 2150))).toBe('home');
    expect(home).toBe(1);
    expect(nav.flush(2400)).toBeNull();
    expect(back.clicks).toBe(0);
    // Sau khi về Trang chủ cũng chờ 1,2 s.
    expect(nav.press(note(61, 2500))).toBeNull();
  });

  it('hai phím đen cách nhau quá 200 ms → hai lần "lùi lại" riêng (lần sau còn bị chặn 1,2 s)', () => {
    const nav = new MidiNav(1200, 200);
    let home = 0;
    nav.setHome(() => home++);
    const back = target('back');
    nav.register(back, 0);
    expect(nav.press(note(61, 2000))).toBe('pending');
    expect(nav.flush(2200)).toBe('back');
    expect(nav.press(note(63, 2300))).toBeNull();
    expect(home).toBe(0);
    expect(back.clicks).toBe(1);
  });

  it('về Trang chủ chỉ ở màn chờ bấm nút (có nút đang hiện), không khi đang nghe nốt', () => {
    const nav = new MidiNav(1200, 200);
    let home = 0;
    nav.setHome(() => home++);
    // Không có nút điều hướng nào → không làm gì.
    expect(nav.press(note(61, 2000))).toBeNull();
    expect(nav.press(note(63, 2050))).toBeNull();
    // Chỉ có nút "đi tới" → hai phím đen vẫn về Trang chủ; một phím đen thì không làm gì.
    nav.register(target('forward'), 0);
    expect(nav.press(note(61, 3000))).toBe('pending');
    expect(nav.flush(3200)).toBeNull();
    // Đang nghe nốt → phím đàn vẫn là phím đàn.
    const stop = nav.listen();
    expect(nav.press(note(61, 5000))).toBeNull();
    expect(nav.press(note(63, 5050))).toBeNull();
    stop();
    // Phím đen thứ nhất đang chờ thì màn bắt đầu nghe nốt → bỏ.
    expect(nav.press(note(61, 7000))).toBe('pending');
    const stop2 = nav.listen();
    expect(nav.flush(7300)).toBeNull();
    stop2();
    expect(home).toBe(0);
    expect(nav.press(note(61, 9000))).toBe('pending');
    expect(nav.press(note(63, 9010))).toBe('home');
    expect(home).toBe(1);
  });
});
