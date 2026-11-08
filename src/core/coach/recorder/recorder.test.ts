import { describe, expect, it } from 'vitest';
import { PerformanceRecorder, type SessionMeta } from './PerformanceRecorder';
import { activeTimeMapper, buildPerformance, estimateClock } from './buildPerformance';
import type { PerformanceEvent, RecordedSession } from '../types';

const META: SessionMeta = {
  id: 's1',
  profileKey: 'p1',
  lessonId: 'scale-c-major',
  lessonTitle: 'Gam Đô trưởng',
  hand: 'both',
  mode: 'technical',
  targetBpm: 60,
  metronome: false,
  input: { source: 'midi', capabilities: { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true } },
  latencyMs: 0,
};

/** Đồng hồ giả: `clock.t` = performance.now(). */
function makeRecorder(meta: Partial<SessionMeta> = {}) {
  const clock = { t: 1000, wall: 1_700_000_000_000 };
  const rec = new PerformanceRecorder({ ...META, ...meta }, { now: () => clock.t, wallClock: () => clock.wall });
  return { rec, clock };
}

/** Phát nốt MIDI: mốc nguồn = mốc nhận (trừ khi truyền `skew`). */
function play(rec: PerformanceRecorder, clock: { t: number }, midi: number, at: number, len: number, velocity = 80, skew = 0) {
  clock.t = at;
  rec.noteOn({ midi, time: at + skew, source: 'midi', velocity, channel: 0, port: 'p' });
  clock.t = at + len;
  rec.noteOff({ midi, time: at + len + skew, source: 'midi', channel: 0, port: 'p' });
}

describe('PerformanceRecorder', () => {
  it('ghi log gốc: mốc nguồn và mốc nhận tương đối t0, không làm tròn; bỏ sự kiện trước khi bắt đầu / sau khi dừng', () => {
    const { rec, clock } = makeRecorder();
    expect(rec.noteOn({ midi: 60, time: 900, source: 'midi' })).toBe(false);
    rec.start(1000);
    clock.t = 1250.25;
    rec.noteOn({ midi: 60, time: 1248.125, source: 'midi', velocity: 77, channel: 2, raw: 61, port: 'p' });
    clock.t = 1500;
    rec.noteOff({ midi: 60, time: 1499.5, source: 'midi', channel: 2, raw: 61, port: 'p' });
    rec.stop(1600);
    expect(rec.noteOn({ midi: 62, time: 1700, source: 'midi' })).toBe(false);
    const { session, events } = rec.snapshot();
    expect(session.status).toBe('completed');
    expect(session.eventCount).toBe(4);
    expect(events[1]).toEqual({ k: 'on', t: 248.125, rt: 250.25, n: 60, v: 77, ch: 2, raw: 61, port: 'p', src: 'midi' });
    expect(events[2]).toMatchObject({ k: 'off', t: 499.5, rt: 500, n: 60 });
    expect(events.map((e) => (e.k === 'mark' ? e.m : e.k))).toEqual(['start', 'on', 'off', 'stop']);
  });

  it('velocity 0 / không có → null (bàn phím ảo); chỉ ghi CC pedal + tắt tiếng', () => {
    const { rec } = makeRecorder();
    rec.start(0);
    rec.noteOn({ midi: 60, time: 10, source: 'virtual' });
    expect(rec.control({ controller: 1, value: 50, time: 20 })).toBe(false); // mod wheel: không ghi
    expect(rec.control({ controller: 64, value: 100, time: 30, channel: 0 })).toBe(true);
    expect(rec.control({ controller: 67, value: 127, time: 31 })).toBe(true);
    const ev = rec.snapshot().events;
    expect(ev[1]).toMatchObject({ k: 'on', v: null, src: 'virtual' });
    expect(ev.filter((e) => e.k === 'cc').map((e) => (e as Extract<PerformanceEvent, { k: 'cc' }>).c)).toEqual([64, 67]);
  });

  it('tạm dừng: sự kiện vẫn ghi nhưng có cờ p; thời gian ghi thực không tính tạm dừng', () => {
    const { rec, clock } = makeRecorder();
    rec.start(0);
    play(rec, clock, 60, 100, 200);
    clock.t = 1000;
    rec.pause(1000);
    play(rec, clock, 62, 1500, 100);
    clock.t = 3000;
    rec.resume(3000);
    play(rec, clock, 64, 3100, 200);
    clock.t = 4000;
    expect(rec.state.activeMs).toBe(2000);
    expect(rec.state.notes).toBe(2);
    const paused = rec.snapshot().events.filter((e) => e.k !== 'mark' && e.p === 1);
    expect(paused).toHaveLength(2);
  });

  it('pedal đạp sẵn lúc bắt đầu → mốc pedal-initial; mất kết nối / kết nối lại chỉ ghi mốc', () => {
    const { rec } = makeRecorder();
    rec.start(0, { pedalDown: true });
    expect(rec.state.sustainDown).toBe(true);
    rec.disconnect(500, 'Test Piano');
    rec.reconnect(900);
    expect(rec.status).toBe('recording');
    expect(rec.snapshot().events.map((e) => (e.k === 'mark' ? e.m : e.k))).toEqual(['start', 'pedal-initial', 'disconnect', 'reconnect']);
  });

  it('takeDirty báo có thay đổi một lần (lưu nháp)', () => {
    const { rec } = makeRecorder();
    rec.start(0);
    expect(rec.takeDirty()).toBe(true);
    expect(rec.takeDirty()).toBe(false);
    rec.noteOn({ midi: 60, time: 1, source: 'virtual' });
    expect(rec.takeDirty()).toBe(true);
  });

  it('huỷ → aborted, không nhận thêm', () => {
    const { rec } = makeRecorder();
    rec.start(0);
    rec.abort(10, 'người dùng huỷ');
    expect(rec.status).toBe('aborted');
    expect(rec.noteOn({ midi: 60, time: 20, source: 'midi' })).toBe(false);
  });
});

function session(events: PerformanceEvent[], meta: Partial<SessionMeta> = {}): RecordedSession {
  return {
    session: { ...META, ...meta, status: 'completed', startedAt: 0, updatedAt: 0, eventCount: events.length, recorderVersion: '1.0.0' },
    events,
  };
}
const on = (t: number, n: number, v = 80, extra: Partial<Extract<PerformanceEvent, { k: 'on' }>> = {}): PerformanceEvent => ({ k: 'on', t, rt: t, n, v, ch: 0, port: 'p', src: 'midi', ...extra });
const off = (t: number, n: number, extra: Partial<Extract<PerformanceEvent, { k: 'off' }>> = {}): PerformanceEvent => ({ k: 'off', t, rt: t, n, ch: 0, port: 'p', src: 'midi', ...extra });
const cc = (t: number, c: number, v: number): PerformanceEvent => ({ k: 'cc', t, rt: t, c, v, ch: 0, port: 'p', src: 'midi' });
const mark = (t: number, m: Extract<PerformanceEvent, { k: 'mark' }>['m'], info?: string): PerformanceEvent => ({ k: 'mark', t, rt: t, m, ...(info ? { info } : {}) });

describe('PerformanceRecorder — tiếng click metronome (M1-T7)', () => {
  it('chỉ ghi lúc đang ghi; phách mạnh có info "a"; không báo giao diện, vẫn cần lưu nháp', () => {
    const { rec } = makeRecorder({ metronome: true });
    rec.click(900, true);
    rec.start(1000);
    rec.takeDirty();
    let notified = 0;
    rec.subscribe(() => notified++);
    notified = 0;
    rec.click(1250, true);
    rec.click(1750.5, false);
    expect(notified).toBe(0);
    expect(rec.takeDirty()).toBe(true);
    rec.pause(2000);
    rec.click(2250, true);
    rec.resume(3000);
    rec.click(3100, false);
    rec.stop(3500);
    rec.click(3600, true);
    const clicks = rec.snapshot().events.filter((e) => e.k === 'mark' && e.m === 'click');
    expect(clicks).toEqual([
      { k: 'mark', t: 250, rt: 250, m: 'click', info: 'a' },
      { k: 'mark', t: 750.5, rt: 750.5, m: 'click' },
      { k: 'mark', t: 2100, rt: 2100, m: 'click' },
    ]);
  });
});

describe('buildPerformance', () => {
  it('ghép On/Off: hợp âm nhả lệch thứ tự vẫn đúng từng phím', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), on(103, 64), on(105, 67), off(600, 67), off(650, 60), off(700, 64), mark(1000, 'stop')]));
    expect(b.notes.map((n) => [n.midi, n.onMs, n.heldMs])).toEqual([
      [60, 100, 550],
      [64, 103, 597],
      [67, 105, 495],
    ]);
    expect(b.notes.every((n) => n.endedBy === 'release')).toBe(true);
  });

  it('Note On lặp khi chưa thả → đóng nốt cũ (retrigger); Note Off mồ côi bị bỏ và đếm', () => {
    const b = buildPerformance(session([mark(0, 'start'), off(50, 72), on(100, 60), on(300, 60), off(500, 60), mark(800, 'stop')]));
    expect(b.orphanOffs).toBe(1);
    expect(b.notes).toHaveLength(2);
    expect(b.notes[0]).toMatchObject({ onMs: 100, offMs: 300, endedBy: 'retrigger', heldMs: 200 });
    expect(b.notes[1]).toMatchObject({ onMs: 300, offMs: 500, retriggered: true });
  });

  it('còn giữ phím lúc dừng → offMs null + heldAtLeastMs', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), mark(900, 'stop')]));
    expect(b.notes[0]).toMatchObject({ offMs: null, heldMs: null, endedBy: 'stop', heldAtLeastMs: 800 });
    expect(b.endMs).toBe(900);
  });

  it('tạm dừng: bỏ nốt đánh lúc tạm dừng, dồn thời gian sau khi tiếp tục', () => {
    const b = buildPerformance(
      session([mark(0, 'start'), on(100, 60), off(300, 60), mark(1000, 'pause'), on(1500, 62, 80, { p: 1 }), off(1600, 62, { p: 1 }), mark(3000, 'resume'), on(3100, 64), off(3300, 64), mark(4000, 'stop')]),
    );
    expect(b.notes.map((n) => [n.midi, n.onMs, n.offMs])).toEqual([
      [60, 100, 300],
      [64, 1100, 1300],
    ]);
    expect(b.pausedIntervals).toEqual([{ from: 1000, to: 3000 }]);
    expect(b.endMs).toBe(2000);
    expect(b.orphanOffs).toBe(1); // Off của nốt đánh lúc tạm dừng
  });

  it('nốt giữ qua lúc tạm dừng: thời gian giữ không tính khoảng tạm dừng', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), mark(500, 'pause'), mark(2500, 'resume'), off(2700, 60), mark(3000, 'stop')]));
    expect(b.notes[0]).toMatchObject({ onMs: 100, offMs: 700, heldMs: 600 });
  });

  it('pedal vang: thả phím lúc đạp → ngân tới lúc nhả pedal; không phải lúc Note Off', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), cc(150, 64, 127), off(400, 60), on(500, 62), off(700, 62), cc(900, 64, 0), on(1000, 64), off(1200, 64), mark(1500, 'stop')]));
    expect(b.sustainSeen).toBe(true);
    expect(b.sustain.intervals).toEqual([{ down: 150, up: 900 }]);
    const [c, d, e] = b.notes;
    expect(c).toMatchObject({ heldMs: 300, releasedUnderPedal: true, soundingEndMs: 900 });
    expect(d).toMatchObject({ releasedUnderPedal: true, soundingEndMs: 900 });
    expect(e).toMatchObject({ releasedUnderPedal: false, soundingEndMs: 1200 });
  });

  it('pedal đạp sẵn: theo mốc pedal-initial, hoặc suy ra khi tín hiệu đầu là "nhả"', () => {
    const a = buildPerformance(session([mark(0, 'start'), mark(0, 'pedal-initial', 'sustain-down'), on(100, 60), off(200, 60), cc(500, 64, 0), mark(800, 'stop')]));
    expect(a.sustain.initialDown).toBe(true);
    expect(a.sustain.intervals).toEqual([{ down: 0, up: 500 }]);
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), off(200, 60), cc(500, 64, 0), mark(800, 'stop')]));
    expect(b.sustain.initialDown).toBe(true);
    expect(b.notes[0].soundingEndMs).toBe(500);
  });

  it('half-pedal: giữ giá trị 0–127, đánh dấu liên tục; ngưỡng đạp 64', () => {
    const b = buildPerformance(session([mark(0, 'start'), cc(100, 64, 30), cc(120, 64, 70), cc(140, 64, 110), cc(400, 64, 50), cc(420, 64, 0), mark(800, 'stop')]));
    expect(b.sustain.continuous).toBe(true);
    expect(b.sustain.intervals).toEqual([{ down: 120, up: 400 }]);
    expect(b.sustain.changes.map((c) => c.value)).toEqual([30, 70, 110, 50, 0]);
  });

  it('sostenuto giữ nốt đang giữ phím lúc đạp; pedal mềm đánh dấu nốt', () => {
    const b = buildPerformance(
      session([mark(0, 'start'), on(100, 48), cc(200, 66, 127), off(300, 48), on(400, 60), off(500, 60), cc(800, 66, 0), cc(850, 67, 127), on(900, 64), off(1000, 64), mark(1200, 'stop')]),
    );
    const [low, mid, high] = b.notes;
    expect(low.soundingEndMs).toBe(800);
    expect(mid.soundingEndMs).toBe(500);
    expect(high.softPedal).toBe(true);
  });

  it('đồng hồ: mốc driver lệch hằng số → hiệu chỉnh theo mốc nhận (tạm dừng vẫn đúng chỗ)', () => {
    const skew = -5000; // driver gắn mốc sớm hơn 5 s
    const ev: PerformanceEvent[] = [
      mark(0, 'start'),
      { ...on(100, 60), t: 100 + skew },
      { ...off(300, 60), t: 300 + skew },
      mark(1000, 'pause'),
      mark(2000, 'resume'),
      { ...on(2100, 62), t: 2100 + skew, rt: 2102 },
      { ...off(2300, 62), t: 2300 + skew, rt: 2301 },
      mark(3000, 'stop'),
    ];
    const b = buildPerformance(session(ev));
    expect(b.clock.basis).toBe('source');
    expect(b.clock.offsetMs).toBeCloseTo(5000.5, 5);
    expect(b.notes.map((n) => Math.round(n.onMs))).toEqual([101, 1101]);
  });

  it('đồng hồ: mốc nguồn dao động mạnh → dùng mốc nhận', () => {
    const ev = [0, 1, 2, 3, 4, 5].map((i) => ({ ...on(i * 200, 60 + i), t: i * 200 + (i % 2 ? 300 : -300) }));
    expect(estimateClock(ev)).toMatchObject({ basis: 'receive' });
  });

  it('rút đàn: Note Off lớp MIDI thả hộ ngay trước mốc mất kết nối → không đo trường độ', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), on(150, 64), off(500, 60), off(800, 64), mark(803, 'disconnect'), mark(1200, 'stop')]));
    expect(b.disconnects).toBe(1);
    expect(b.notes[0]).toMatchObject({ endedBy: 'release', heldMs: 400 });
    expect(b.notes[1]).toMatchObject({ endedBy: 'disconnect', heldMs: null, heldAtLeastMs: 650 });
  });

  it('micro: bù trễ khi phân tích, không có trường độ, không gộp hai lần cùng phím', () => {
    const mic = (t: number, n: number): PerformanceEvent => ({ k: 'on', t, rt: t, n, v: null, ch: null, src: 'microphone', lv: 0.05 });
    const b = buildPerformance(session([mark(0, 'start'), mic(560, 60), mic(1060, 60), mark(1500, 'stop')], { latencyMs: 60 }));
    expect(b.notes.map((n) => [n.onMs, n.heldMs, n.endedBy, n.level])).toEqual([
      [500, null, 'stop', 0.05],
      [1000, null, 'stop', 0.05],
    ]);
    expect(b.notes[0].heldAtLeastMs).toBeUndefined();
  });

  it('CC 123 (thả mọi phím) đóng các nốt đang giữ trên kênh đó', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(100, 60), on(110, 64), cc(400, 123, 0), mark(800, 'stop')]));
    expect(b.notes.map((n) => n.offMs)).toEqual([400, 400]);
  });

  it('activeTimeMapper: mốc trong lúc tạm dừng dồn về đầu khoảng', () => {
    const f = activeTimeMapper([
      { from: 100, to: 200 },
      { from: 500, to: 600 },
    ]);
    expect([50, 150, 250, 550, 700].map(f)).toEqual([50, 100, 150, 400, 500]);
  });

  it('độ trễ máy (M1-T7) trừ cho MỌI sự kiện người chơi: nốt, thả phím và pedal — nốt và pedal không lệch nhau', () => {
    const b = buildPerformance(session([mark(0, 'start'), on(1100, 60), cc(1150, 64, 127), off(1400, 60), cc(1900, 64, 0), mark(3000, 'stop')], { latencyMs: 100 }));
    expect(b.notes[0]).toMatchObject({ onMs: 1000, offMs: 1300, releasedUnderPedal: true, soundingEndMs: 1800 });
    expect(b.sustain.intervals).toEqual([{ down: 1050, up: 1800 }]);
  });

  it('tiếng click: mốc chuẩn (không bù trễ), bỏ khoảng tạm dừng, không kéo dài phiên dở dang', () => {
    const b = buildPerformance(
      session([mark(0, 'start'), mark(500, 'click', 'a'), on(560, 60), off(800, 60), mark(1000, 'click'), mark(1200, 'pause'), mark(2200, 'resume'), mark(2500, 'click', 'a'), on(2600, 62), off(2700, 62), mark(3000, 'click')], { latencyMs: 60 }),
    );
    // Không có mốc dừng (app tắt giữa chừng): hết phiên = sự kiện cuối của NGƯỜI CHƠI (2700), không phải tiếng click 3000
    // → tiếng click sau đó không dùng.
    expect(b.clicks).toEqual([500, 1000, 1500]);
    expect(b.notes.map((n) => n.onMs)).toEqual([500, 1540]);
    expect(b.endMs).toBe(1700);
  });

  it('round-trip: bộ ghi → log → ghép lại đúng chuỗi nốt đã phát', () => {
    const { rec, clock } = makeRecorder();
    rec.start(1000);
    const played: [number, number, number][] = [
      [60, 1100, 300],
      [62, 1500, 250],
      [64, 1900, 400],
    ];
    for (const [m, at, len] of played) play(rec, clock, m, at, len, 70 + m - 60);
    clock.t = 2600;
    rec.stop(2600);
    const b = buildPerformance(JSON.parse(JSON.stringify(rec.snapshot())) as RecordedSession);
    expect(b.notes.map((n) => [n.midi, n.onMs, n.heldMs, n.velocity])).toEqual(played.map(([m, at, len]) => [m, at - 1000, len, 70 + m - 60]));
  });
});
