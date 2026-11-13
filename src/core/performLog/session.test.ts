import { describe, expect, it } from 'vitest';
import type { NoteInputEvent } from '../input/NoteInputProvider';
import { PerformanceTracker, type TimedNote } from '../practice/PerformanceTracker';
import { performScore, PerformLogSession, type SessionNote } from './session';
import type { PerformSetup } from './types';

/** 60 bpm → 1 nốt đen = 1000 ms; bấm bắt đầu lúc t = 0, đếm vào 4 phách → phách 0 ở t = 4000. */
const T0 = 4000;
const at = (beat: number) => T0 + beat * 1000;

const SETUP: PerformSetup = {
  hand: 'both',
  scored: true,
  bpm: 60,
  tempoPercent: 100,
  countInBeats: 4,
  checkPitch: true,
  octaveTolerant: false,
  maxWindowBeats: 0.5,
  onTimeMs: 150,
  minOnsetIntervalMs: 80,
  debounceSamePitch: false,
  singleNotesOnly: false,
  micLatencyMs: 60,
  metronome: true,
  pedalScored: false,
  pedalInput: false,
  inputSource: 'auto',
  mic: { status: 'idle', fallback: false },
  midi: { status: 'ready', devices: [] },
  recognizer: { a4: 440, noiseGate: 0.008, minConfidence: 0.85, stableMs: 70, onsetRatio: 1.35 },
  outputLatencyMs: null,
};

const META = {
  id: 'log-1',
  at: '2026-11-08T10:00:00.000Z',
  app: 'test',
  device: { id: 'dev-1', name: 'Máy thử' },
  player: { id: 'p1', name: 'Bé An', age: 7, experience: 'new' },
  env: { ua: 'test', platform: 'test', language: 'vi', timeZone: 'Asia/Saigon', screen: '1x1@1', viewport: '1x1', standalone: false, touchPoints: 0, cores: null, memoryGb: null, webMidi: false, page: 'http://x/' },
};

function setup(midis: (number | null)[], extra: Partial<SessionNote>[] = []) {
  const notes: SessionNote[] = midis.map((midi, i) => ({ startBeat: i, durationBeats: 1, midi, ...(extra[i] ?? {}) }));
  const tracker = new PerformanceTracker(notes as TimedNote[], { bpm: 60, countInBeats: 4 });
  const session = new PerformLogSession({
    screen: 'practice',
    notes,
    lesson: { id: 'scale-c-major', title: 'Gam Đô trưởng', timeSignature: [4, 4], pickup: 0, tempo: 60 },
    setup: SETUP,
    startTime: 0,
  });
  tracker.start(0);
  session.mark('start', 0, -4, 60);
  /** Như màn thật: người nghe riêng của nhật ký thấy nốt thô, màn chuyển nốt cho tracker rồi báo kết quả. */
  const play = (midi: number, time: number, source: NoteInputEvent['source'] = 'virtual', recvTime = time) => {
    const e: NoteInputEvent = { midi, time, source, ...(source === 'midi' ? { velocity: 64 } : {}) };
    session.input(e, recvTime, tracker.beatAt(time));
    const before = tracker.getState();
    const out = tracker.handleNoteOn(midi, time);
    session.graded(e, out, recvTime, tracker.beatAt(time), before, tracker.getState());
    return e;
  };
  const finish = (time: number, end: 'finished' | 'restart' | 'left' = 'finished') => {
    tracker.tick(time);
    return session.build(end, time, tracker.getState(), tracker.result(), tracker.getConfig(), META);
  };
  return { tracker, session, play, finish };
}

describe('PerformLogSession', () => {
  it('ghi nốt cần đánh + kết quả, sự kiện kèm nốt được chấm, lệch nhịp, điểm theo rubric Biểu diễn', () => {
    const { play, finish } = setup([60, 62, null, 64], [{ pitch: 'C4', hand: 'right', measure: 1 }]);
    play(60, at(0) + 40);
    play(61, at(1) - 30);
    const entry = finish(at(5));
    expect(entry).toMatchObject({ v: 1, type: 'perform', screen: 'practice', end: 'finished', device: { id: 'dev-1' }, player: { name: 'Bé An' } });
    // Dấu lặng không ghi; chỉ số i giữ nguyên theo tracker.
    expect(entry.notes.map((n) => [n.i, n.m, n.r])).toEqual([
      [0, 60, 'correct'],
      [1, 62, 'wrong'],
      [3, 64, 'skipped'],
    ]);
    expect(entry.notes[0]).toMatchObject({ p: 'C4', h: 'right', ms: 1, off: 40, pm: 60 });
    expect(entry.events).toEqual([
      { t: 4040, src: 'virtual', m: 60, lag: 0, beat: 0.04, out: 'hit', note: 0, off: 40 },
      { t: 4970, src: 'virtual', m: 61, lag: 0, beat: 0.97, out: 'wrong', note: 1, off: -30 },
    ]);
    expect(entry.result).toMatchObject({ notes: 3, correct: 1, wrong: 1, missed: 1, extras: 0 });
    expect(entry.result.score).toBe(performScore({ ...entry.result }));
    expect(entry.durationMs).toBe(at(5));
    expect(entry.summary).toContain('"Gam Đô trưởng" [scale-c-major]');
    expect(entry.summary).toContain('3 nốt: đúng 1, sai 1, lỡ 1, thừa 0');
    expect(entry.summary).toContain('bàn phím ảo');
    // Nhãn tay theo nốt được chấm (chỉ có nốt tay phải), không theo lựa chọn "hai tay" mặc định.
    expect(entry.summary).toContain(' · tay phải · ');
  });

  it('nốt bị màn bỏ: lý do của màn; không tới bộ chấm và không có lý do → lý do đoán lúc nhận, rồi "filtered"', () => {
    const { session, play, tracker, finish } = setup([60, 62, 64]);
    play(60, at(0));
    const e1: NoteInputEvent = { midi: 48, time: at(1), source: 'midi', velocity: 30 };
    session.input(e1, at(1), tracker.beatAt(at(1)));
    session.dropped(e1, 'accompaniment', at(1), tracker.beatAt(at(1)));
    const e2: NoteInputEvent = { midi: 62, time: at(1.1), source: 'microphone', level: 0.05 };
    session.input(e2, at(1.1), tracker.beatAt(at(1.1)), 'mic-while-midi');
    const e3: NoteInputEvent = { midi: 64, time: at(2), source: 'virtual' };
    session.input(e3, at(2), tracker.beatAt(at(2)));
    const entry = finish(at(4));
    expect(entry.events.map((e) => [e.m, e.out, e.why])).toEqual([
      [60, 'hit', undefined],
      [48, 'dropped', 'accompaniment'],
      [62, 'dropped', 'mic-while-midi'],
      [64, 'dropped', 'filtered'],
    ]);
    expect(entry.events[1]).toMatchObject({ vel: 30 });
    expect(entry.events[2]).toMatchObject({ lvl: 0.05 });
    // Nốt 64 lỡ vì sự kiện cùng phím bị bỏ trước khi chấm. Nốt 62: lượt có nốt MIDI nên micro bị bỏ là bình thường
    // (micro nghe chính tiếng đàn) → không tính là nguyên nhân, nốt 62 coi như không có tín hiệu.
    expect(entry.diagnosis.missed).toMatchObject({ dropped: 1, noInput: 1 });
    expect(entry.diagnosis.inputs.dropped).toEqual({ accompaniment: 1, 'mic-while-midi': 1, filtered: 1 });
  });

  it('thứ tự người nghe không quan trọng: màn chấm trước, người nghe riêng tới sau vẫn một bản ghi', () => {
    const { session, tracker, finish } = setup([60]);
    const e: NoteInputEvent = { midi: 60, time: at(0), source: 'virtual' };
    const before = tracker.getState();
    const out = tracker.handleNoteOn(60, at(0));
    session.graded(e, out, at(0), tracker.beatAt(at(0)), before, tracker.getState());
    session.input(e, at(0), tracker.beatAt(at(0)), 'playback');
    const entry = finish(at(2));
    expect(entry.events).toHaveLength(1);
    expect(entry.events[0]).toMatchObject({ out: 'hit', note: 0 });
    expect(entry.events[0].why).toBeUndefined();
  });

  it('lag = lúc nhận − mốc của sự kiện (đồng hồ driver MIDI lệch) → nghi vấn clock-skew', () => {
    const { play, finish } = setup([60, 62, 64, 65]);
    // Đàn gắn mốc sớm 300 ms so với lúc trang nhận được.
    [60, 62, 64, 65].forEach((m, i) => play(m, at(i) - 300, 'midi', at(i)));
    const entry = finish(at(5));
    expect(entry.events.every((e) => e.lag === 300)).toBe(true);
    expect(entry.diagnosis.lagMs.midi).toBe(300);
    expect(entry.diagnosis.hints).toContain('clock-skew');
    expect(entry.summary).toContain('mốc đàn MIDI lệch +300 ms');
  });

  it('nốt tắt, pedal, mốc điều khiển, cao độ micro (chỉ ghi khi đổi)', () => {
    const { session, finish } = setup([60]);
    session.noteOff({ midi: 60, time: 4500, source: 'midi' });
    session.pedal(true, 4100);
    session.mark('pause', 4600, 0.6);
    session.pitchFrame(4000, { midi: 60, cents: 3.4, confidence: 0.951 }, 0.04, true);
    session.pitchFrame(4020, { midi: 60, cents: 2, confidence: 0.95 }, 0.03, false);
    session.pitchFrame(4040, null, 0.001, false);
    const entry = finish(at(2));
    expect(entry.offs).toEqual([[4500, 60, 'midi']]);
    expect(entry.pedal).toEqual([[4100, true]]);
    expect(entry.marks).toEqual([
      { t: 0, k: 'start', beat: -4, bpm: 60 },
      { t: 4600, k: 'pause', beat: 0.6 },
    ]);
    expect(entry.pitch).toEqual([
      [4000, 60, 3, 0.95, 0.04, 1],
      [4040, null, 0, 0, 0.001, 0],
    ]);
  });

  it('inputCount: lượt chưa có nốt nào', () => {
    const { session, play } = setup([60]);
    expect(session.inputCount).toBe(0);
    play(60, at(0));
    expect(session.inputCount).toBe(1);
  });
});
