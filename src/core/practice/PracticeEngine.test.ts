import { describe, expect, it } from 'vitest';
import { PracticeEngine, computeAccuracy } from './PracticeEngine';
import { NoteRecognizer, type TimedPitchFrame } from '../audio/NoteRecognizer';
import { midiToFrequency } from '../music/notes';

const C4 = 60, D4 = 62, E4 = 64, G4 = 67, C5 = 72;

describe('PracticeEngine — Wait Mode', () => {
  it('bắt đầu ở trạng thái chờ nốt đầu tiên', () => {
    const e = new PracticeEngine([C4, D4]);
    expect(e.getState().status).toBe('waiting');
    expect(e.expectedMidi).toBe(C4);
  });

  it('đánh đúng → chuyển sang nốt tiếp theo', () => {
    const e = new PracticeEngine([C4, D4, E4]);
    expect(e.handleNote(C4, 1000)).toBe('correct');
    expect(e.getState().index).toBe(1);
    expect(e.getState().status).toBe('correct');
    expect(e.expectedMidi).toBe(D4);
  });

  it('đánh sai → giữ nguyên vị trí và đếm lỗi', () => {
    const e = new PracticeEngine([C4, D4]);
    expect(e.handleNote(E4, 1000)).toBe('wrong');
    expect(e.handleNote(G4, 2000)).toBe('wrong');
    const s = e.getState();
    expect(s.index).toBe(0);
    expect(s.status).toBe('wrong');
    expect(s.wrong).toBe(2);
    expect(s.lastPlayedMidi).toBe(G4);
  });

  it('sai rồi sửa đúng được đánh dấu "corrected"', () => {
    const e = new PracticeEngine([C4, D4]);
    e.handleNote(E4, 1000);
    e.handleNote(C4, 2000);
    expect(e.getState().results).toEqual(['corrected', 'pending']);
  });

  it('hoàn thành bài khi đánh đúng nốt cuối', () => {
    const e = new PracticeEngine([C4, D4]);
    e.handleNote(C4, 1000);
    expect(e.handleNote(D4, 2000)).toBe('finished');
    const s = e.getState();
    expect(s.status).toBe('finished');
    expect(s.finishedAt).toBe(2000);
    expect(s.startedAt).toBe(1000);
    expect(e.expectedMidi).toBeNull();
    expect(e.handleNote(D4, 3000)).toBe('finished');
    expect(s.correct).toBe(2);
  });

  it('không có sự kiện → không thay đổi gì', () => {
    const e = new PracticeEngine([C4]);
    const before = e.getState();
    expect(e.getState()).toBe(before);
  });

  it('một sự kiện chỉ tiến tối đa một nốt, kể cả khi các nốt kế tiếp giống nhau', () => {
    const e = new PracticeEngine([C4, C4, C4, C4]);
    e.handleNote(C4, 1000);
    expect(e.getState().index).toBe(1);
  });

  it('bỏ qua sự kiện đến quá sát lần chuyển nốt trước', () => {
    const e = new PracticeEngine([C4, C4, D4]);
    e.handleNote(C4, 1000);
    expect(e.handleNote(C4, 1050)).toBe('ignored');
    expect(e.handleNote(E4, 1050)).toBe('ignored');
    expect(e.getState().index).toBe(1);
    expect(e.getState().wrong).toBe(0);
    expect(e.handleNote(C4, 1300)).toBe('correct');
  });

  it('octaveTolerant chấp nhận sai quãng tám', () => {
    const strict = new PracticeEngine([C4]);
    expect(strict.handleNote(C5, 1000)).toBe('wrong');
    const tolerant = new PracticeEngine([C4], { minAdvanceIntervalMs: 0, octaveTolerant: true });
    expect(tolerant.handleNote(C5, 1000)).toBe('finished');
  });

  it('nút bỏ qua, quay lại, chơi lại từ đầu', () => {
    const e = new PracticeEngine([C4, D4, E4]);
    e.skip(1000);
    expect(e.getState().index).toBe(1);
    expect(e.getState().results[0]).toBe('skipped');
    e.handleNote(D4, 2000);
    expect(e.getState().index).toBe(2);
    e.back(3000);
    expect(e.getState().index).toBe(1);
    expect(e.getState().results[1]).toBe('pending');
    e.back(3100);
    e.back(3200);
    expect(e.getState().index).toBe(0);
    e.restart();
    expect(e.getState()).toMatchObject({ index: 0, correct: 0, wrong: 0, skipped: 0, status: 'waiting' });
  });

  it('quay lại sau khi hoàn thành mở lại nốt cuối', () => {
    const e = new PracticeEngine([C4, D4]);
    e.handleNote(C4, 1000);
    e.handleNote(D4, 2000);
    e.back(3000);
    expect(e.getState()).toMatchObject({ index: 1, status: 'waiting', finishedAt: null });
    expect(e.handleNote(D4, 4000)).toBe('finished');
  });

  it('bỏ qua nốt cuối cũng hoàn thành bài', () => {
    const e = new PracticeEngine([C4]);
    e.skip(1000);
    expect(e.getState().status).toBe('finished');
  });

  it('tính độ chính xác', () => {
    expect(computeAccuracy({ correct: 3, wrong: 1 })).toBe(0.75);
    expect(computeAccuracy({ correct: 0, wrong: 0 })).toBe(0);
  });

  it('thông báo cho listener khi trạng thái đổi', () => {
    const e = new PracticeEngine([C4, D4]);
    const seen: number[] = [];
    const unsub = e.subscribe((s) => seen.push(s.index));
    e.handleNote(C4, 1000);
    unsub();
    e.handleNote(D4, 2000);
    expect(seen).toEqual([1]);
  });
});

describe('Tích hợp NoteRecognizer + PracticeEngine: chống nhảy nhiều nốt', () => {
  const HOP = (1024 / 48000) * 1000;

  function sustained(midi: number, startMs: number, durationMs: number, peak = 0.2): TimedPitchFrame[] {
    const frames: TimedPitchFrame[] = [];
    for (let t = 0; t < durationMs; t += HOP) {
      const attack = Math.min(1, (t + HOP) / 30);
      frames.push({
        time: startMs + t,
        frequency: midiToFrequency(midi),
        confidence: 0.95,
        rms: peak * attack * Math.exp((-0.6 * t) / 1000),
      });
    }
    return frames;
  }

  function feed(engine: PracticeEngine, recognizer: NoteRecognizer, frames: TimedPitchFrame[]) {
    for (const f of frames) {
      const out = recognizer.process(f);
      if (out.noteOn) engine.handleNote(out.noteOn.midi, out.noteOn.time);
    }
  }

  it('một nốt C4 ngân 5 giây chỉ tiến 1 nốt trong bài C4 C4 C4 C4', () => {
    const engine = new PracticeEngine([C4, C4, C4, C4]);
    const recognizer = new NoteRecognizer();
    feed(engine, recognizer, sustained(C4, 0, 5000));
    expect(engine.getState().index).toBe(1);
    expect(engine.getState().wrong).toBe(0);
  });

  it('âm ngân của nốt đúng không bị tính là nốt sai ở bước tiếp theo', () => {
    const engine = new PracticeEngine([C4, G4]);
    const recognizer = new NoteRecognizer();
    feed(engine, recognizer, sustained(C4, 0, 3000));
    expect(engine.getState()).toMatchObject({ index: 1, wrong: 0, status: 'correct' });
  });

  it('đánh lại 4 lần riêng biệt → hoàn thành C4 C4 C4 C4', () => {
    const engine = new PracticeEngine([C4, C4, C4, C4]);
    const recognizer = new NoteRecognizer();
    // Mỗi lần đánh mới cách 600 ms, nốt trước vẫn còn ngân (không có khoảng lặng)
    for (let i = 0; i < 4; i++) feed(engine, recognizer, sustained(C4, i * 600, 600));
    expect(engine.getState().status).toBe('finished');
    expect(engine.getState().correct).toBe(4);
  });

  it('chuỗi giai điệu C4 D4 E4 C4 chơi liền mạch được nhận đầy đủ', () => {
    const melody = [C4, D4, E4, C4];
    const engine = new PracticeEngine(melody);
    const recognizer = new NoteRecognizer();
    melody.forEach((m, i) => feed(engine, recognizer, sustained(m, i * 500, 500)));
    expect(engine.getState()).toMatchObject({ status: 'finished', correct: 4, wrong: 0 });
  });
});
