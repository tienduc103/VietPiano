import { describe, expect, it } from 'vitest';
import { parseNotes } from '../lessons/notation';
import { blackGroupOf, highlightedKeys, matchesKeyTarget } from './keys';
import { lessonTimeline, pieceToLesson, timedNotes, timelineToMidi } from './piece';
import { QuizEngine } from './QuizEngine';

describe('phím đàn', () => {
  it('nhóm 2 / nhóm 3 phím đen', () => {
    expect([61, 63].map(blackGroupOf)).toEqual([2, 2]);
    expect([66, 68, 70].map(blackGroupOf)).toEqual([3, 3, 3]);
    expect(blackGroupOf(60)).toBeNull();
  });

  it('phím cần tìm', () => {
    expect(matchesKeyTarget({ type: 'midi', midi: 60 }, 60)).toBe(true);
    expect(matchesKeyTarget({ type: 'midi', midi: 60 }, 72)).toBe(false);
    expect(matchesKeyTarget({ type: 'pitch-class', pc: 0 }, 72)).toBe(true);
    expect(matchesKeyTarget({ type: 'pitch-class', pc: 0, exclude: [60] }, 60)).toBe(false);
    expect(matchesKeyTarget({ type: 'black' }, 61)).toBe(true);
    expect(matchesKeyTarget({ type: 'white' }, 61)).toBe(false);
    expect(matchesKeyTarget({ type: 'black-group', size: 3 }, 70)).toBe(true);
    expect(matchesKeyTarget({ type: 'black-group', size: 3 }, 61)).toBe(false);
  });

  it('phím tô sáng trên hình minh hoạ', () => {
    expect(highlightedKeys('all-c', 48, 72)).toEqual([48, 60, 72]);
    expect(highlightedKeys('black-group-2', 60, 71)).toEqual([61, 63]);
    expect(highlightedKeys([40, 60], 48, 72)).toEqual([60]);
    expect(highlightedKeys(undefined, 48, 72)).toEqual([]);
  });
});

describe('dòng thời gian bản nhạc', () => {
  it('pitch, midiNote, startBeat, durationBeats, hand, finger, measureIndex (C4 = 60)', () => {
    const lesson = pieceToLesson({ notation: 'RH C4:1 D4/h:2 R | LH C3/w:5', clef: 'grand', hand: 'both', bpm: 60 }, 'x');
    expect(lessonTimeline(lesson)).toEqual([
      { index: 0, pitch: 'C4', midiNote: 60, startBeat: 0, durationBeats: 1, hand: 'right', finger: 1, velocity: 80, measureIndex: 0 },
      { index: 1, pitch: 'D4', midiNote: 62, startBeat: 1, durationBeats: 2, hand: 'right', finger: 2, velocity: 80, measureIndex: 0 },
      { index: 2, pitch: 'R', midiNote: null, startBeat: 3, durationBeats: 1, hand: 'right', velocity: 80, measureIndex: 0 },
      { index: 3, pitch: 'C3', midiNote: 48, startBeat: 4, durationBeats: 4, hand: 'left', finger: 5, velocity: 80, measureIndex: 1 },
    ]);
  });

  it('chỉ chấm một tay: nốt tay kia thành dấu lặng', () => {
    const lesson = pieceToLesson({ notation: 'RH C4/h | LH C3/h', clef: 'grand', hand: 'both', bpm: 60, timeSignature: [2, 4] }, 'x');
    expect(timedNotes(lessonTimeline(lesson), 'left').map((n) => n.midi)).toEqual([null, 48]);
  });

  it('xuất MIDI chuẩn: header MThd, track MTrk, Note On / Note Off theo thứ tự', () => {
    const lesson = { ...pieceToLesson({ notation: 'C4 R D4/h', clef: 'treble', hand: 'right', bpm: 120 }, 'x'), notes: parseNotes('C4 R D4/h') };
    const bytes = timelineToMidi(lessonTimeline(lesson), 120);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(String.fromCharCode(...bytes.slice(14, 18))).toBe('MTrk');
    const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    expect(bytes.length).toBe(22 + len);
    // Tempo 120 bpm = 500000 µs mỗi nốt đen.
    const tempoAt = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0x51);
    expect([...bytes.slice(tempoAt + 3, tempoAt + 6)]).toEqual([0x07, 0xa1, 0x20]);
    const noteOns = [...bytes].filter((b, i) => b === 0x90 && bytes[i + 2] === 80).length;
    expect(noteOns).toBe(2);
    expect([...bytes.slice(-4)]).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });
});

describe('QuizEngine', () => {
  const isC = (m: number) => m % 12 === 0;

  it('kiểm tra (không thử lại): mỗi lượt một lần, sai vẫn sang lượt sau', () => {
    const q = new QuizEngine<number>([isC, isC, isC], { retry: false, minIntervalMs: 0 });
    expect(q.answer(60, 1)).toBe('correct');
    expect(q.answer(61, 2)).toBe('wrong');
    expect(q.answer(72, 3)).toBe('correct');
    expect(q.getState()).toMatchObject({ status: 'finished', correct: 2, wrong: 1, results: ['correct', 'wrong', 'correct'] });
    expect(q.getState().mistakes).toEqual([{ round: 1, answer: 61 }]);
    expect(q.answer(60, 4)).toBe('finished');
  });

  it('luyện tập (thử lại): sai thì ở lại, đúng sau khi sai = corrected, không tính đúng lần đầu', () => {
    const q = new QuizEngine<number>([isC, isC], { retry: true, minIntervalMs: 0 });
    expect(q.answer(62, 1)).toBe('wrong');
    expect(q.getState().index).toBe(0);
    expect(q.answer(48, 2)).toBe('correct');
    expect(q.answer(60, 3)).toBe('correct');
    expect(q.getState()).toMatchObject({ status: 'finished', correct: 1, wrong: 1, results: ['corrected', 'correct'] });
  });

  it('câu trả lời quá sát lần chuyển lượt bị bỏ qua (micro phát lặp)', () => {
    const q = new QuizEngine<number>([isC, isC], { minIntervalMs: 250 });
    q.answer(60, 1000);
    expect(q.answer(60, 1100)).toBe('ignored');
    expect(q.getState().index).toBe(1);
  });

  it('xem gợi ý: đúng sau đó tính là corrected, không phải đúng lần đầu', () => {
    const q = new QuizEngine<number>([isC, isC], { minIntervalMs: 0 });
    q.hint();
    q.answer(60, 1);
    q.answer(60, 2);
    expect(q.getState()).toMatchObject({ correct: 1, results: ['corrected', 'correct'] });
  });

  it('restart xoá kết quả', () => {
    const q = new QuizEngine<number>([isC], { minIntervalMs: 0 });
    q.answer(60, 1);
    q.restart();
    expect(q.getState()).toMatchObject({ status: 'active', index: 0, correct: 0, results: ['pending'] });
  });
});
