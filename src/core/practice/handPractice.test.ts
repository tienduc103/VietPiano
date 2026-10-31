import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/library';
import { DURATION_BEATS, isAccompanimentMidi } from '../lessons/types';
import { hasHandChoice, isMelodyMidi, leftHandSteps, practiceTrack, resultsOnScore, stepIndexAtBeat } from './handPractice';
import { PracticeEngine, DEFAULT_PRACTICE_CONFIG } from './PracticeEngine';
import { listenPlanAtBeat } from './listenSample';

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;
const romance = lesson('song-romance-2-hands');
const elise = lesson('song-fur-elise-2-hands');
const ode = lesson('song-ode-to-joy-2-hands');
const twinkle = lesson('song-twinkle');

describe('chọn tay — dòng tập', () => {
  it('chỉ bài có phần đệm mới cho chọn tay; bài một tay luôn là "both", giữ nguyên nốt', () => {
    expect(hasHandChoice(romance)).toBe(true);
    expect(hasHandChoice(twinkle)).toBe(false);
    const t = practiceTrack(twinkle, 'left', true)!;
    expect(t.hand).toBe('both');
    expect(t.steps.map((s) => s.midis[0])).toEqual(twinkle.notes.map((n) => n.midi));
  });

  it('tay phải / hai tay: bước = nốt giai điệu, scoreIndex trùng chỉ số nốt', () => {
    for (const hand of ['right', 'both'] as const) {
      const t = practiceTrack(elise, hand, true)!;
      expect(t.hand).toBe(hand);
      expect(t.staff).toBe('melody');
      expect(t.steps).toHaveLength(elise.notes.length);
      expect(t.steps.every((s, i) => s.scoreIndex === i)).toBe(true);
    }
  });

  it('tay trái: mỗi nốt / hợp âm đệm là một bước, bỏ dấu lặng, phách bắt đầu đúng', () => {
    const t = practiceTrack(elise, 'left', false)!;
    expect(t.staff).toBe('accompaniment');
    const nonRest = elise.accompaniment!.filter((c) => c.midis.length > 0);
    expect(t.steps).toHaveLength(nonRest.length);
    // Ô lấy đà (R/8) + ô 1 (R/qd) chỉ có tay phải → nốt đệm đầu tiên (A2) ở phách 0.5 + 1.5 = 2, chỉ số 2 trong phần đệm.
    expect(t.steps[0]).toMatchObject({ midis: [45], startBeat: 2, scoreIndex: 2 });
    // Trường độ cho Theo nhịp: cộng lại đúng tới hết bài.
    const end = elise.notes.reduce((b, n) => b + DURATION_BEATS[n.duration], 0);
    const last = t.steps[t.steps.length - 1];
    expect(last.startBeat + last.beats).toBeCloseTo(end, 9);
    t.steps.slice(0, -1).forEach((s, k) => expect(s.startBeat + s.beats).toBeCloseTo(t.steps[k + 1].startBeat, 9));
  });

  it('tay trái + micro: bỏ hợp âm (micro chỉ nhận một nốt), đếm số hợp âm bị bỏ', () => {
    const full = practiceTrack(ode, 'left', false)!;
    const mic = practiceTrack(ode, 'left', true)!;
    expect(full.steps.some((s) => s.midis.length === 3)).toBe(true);
    expect(mic.steps.every((s) => s.midis.length === 1)).toBe(true);
    expect(mic.skippedChords).toBe(full.steps.filter((s) => s.midis.length > 1).length);
    expect(mic.steps.length + mic.skippedChords).toBe(full.steps.length);
  });

  it('tay trái toàn hợp âm + micro → không tập được (undefined)', () => {
    const allChords = { ...romance, accompaniment: romance.accompaniment!.filter((c) => c.midis.length > 1) };
    expect(leftHandSteps(allChords, true).steps).toHaveLength(0);
    expect(practiceTrack(allChords, 'left', true)).toBeUndefined();
    expect(practiceTrack(allChords, 'left', false)!.hand).toBe('left');
  });

  it('lọc nốt tay kia: tay trái bỏ nốt giai điệu, tay phải bỏ nốt đệm', () => {
    expect(isMelodyMidi(elise, 76)).toBe(true); // E5
    expect(isMelodyMidi(elise, 45)).toBe(false); // A2
    expect(isAccompanimentMidi(elise, 45)).toBe(true);
    expect(isMelodyMidi(twinkle, 60)).toBe(false);
  });

  it('kết quả theo bước → theo nốt trên khuông', () => {
    const t = practiceTrack(elise, 'left', false)!;
    const out = resultsOnScore(t, ['correct', 'wrong'], elise.accompaniment!.length, 'pending');
    expect(out[0]).toBe('pending'); // dấu lặng ô lấy đà
    expect(out[t.steps[0].scoreIndex]).toBe('correct');
    expect(out[t.steps[1].scoreIndex]).toBe('wrong');
    expect(out.filter((r) => r !== 'pending')).toHaveLength(2);
  });

  it('nghe mẫu khi tập tay trái: phát từ đầu ô nhịp chứa nốt đệm, con trỏ theo bước tay trái', () => {
    const t = practiceTrack(elise, 'left', false)!;
    const k = 5;
    const plan = listenPlanAtBeat(elise, t.steps[k].startBeat);
    expect(plan.fromBeat).toBeLessThanOrEqual(t.steps[k].startBeat);
    expect(stepIndexAtBeat(t.steps, t.steps[k].startBeat)).toBe(k);
    expect(stepIndexAtBeat(t.steps, t.steps[k].startBeat + 1e-3)).toBe(k);
    expect(stepIndexAtBeat(t.steps, 0)).toBe(0);
  });
});

describe('chọn tay — PracticeEngine với dòng tay trái', () => {
  /** Engine như màn Luyện tập: nốt thấp nhất là nốt chính, các nốt còn lại của hợp âm là phần phụ. */
  const leftEngine = (singleNotesOnly: boolean) => {
    const t = practiceTrack(ode, 'left', singleNotesOnly)!;
    const engine = new PracticeEngine(
      t.steps.map((s) => s.midis[0]),
      { ...DEFAULT_PRACTICE_CONFIG, twoHands: true },
      t.steps.map((s) => s.midis.slice(1)),
    );
    return { t, engine };
  };

  it('hợp âm: đánh đủ ba nốt (thứ tự bất kỳ) mới sang bước, mỗi sự kiện tối đa một bước', () => {
    const { t, engine } = leftEngine(false);
    const [c, e, g] = t.steps[0].midis; // C3+E3+G3
    expect(engine.handleNote(g, 1000)).toBe('partial');
    expect(engine.handleNote(c, 1200)).toBe('partial');
    expect(engine.getState().index).toBe(0);
    expect(engine.handleNote(e, 1400)).toBe('correct');
    expect(engine.getState().index).toBe(1);
  });

  it('micro (nốt đơn): mỗi nốt đúng sang một bước, sai giữ nguyên', () => {
    const { t, engine } = leftEngine(true);
    expect(engine.handleNote(t.steps[0].midis[0] + 1, 1000)).toBe('wrong');
    expect(engine.getState().index).toBe(0);
    expect(engine.handleNote(t.steps[0].midis[0], 1500)).toBe('correct');
    expect(engine.handleNote(t.steps[1].midis[0], 1550)).toBe('ignored'); // sát lần chuyển nốt
    expect(engine.getState().index).toBe(1);
  });
});
