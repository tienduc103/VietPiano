import { describe, expect, it } from 'vitest';
import { lessonTimeline, lessonToMidi, pedalRanges, soundingNotes } from '../../curriculum/piece';
import { listenPlan } from '../../practice/listenSample';
import { parseChordSymbol } from '../../music/chordSymbols';
import { DEFAULT_PRACTICE_CONFIG, PracticeEngine } from '../../practice/PracticeEngine';
import { LESSONS } from '../library';
import { parseNotes, splitMeasures } from '../notation';
import { measureStarts, noteStarts } from '../positions';
import { accompanimentByNote, chordMidis, DURATION_BEATS, harmonyMidis, measureLength, type Lesson } from '../types';
import { familyLessons, levelMastered, nextLevel, practicePlan, recommendedLevel } from './index';
import { HAPPY_BIRTHDAY_FAMILY, HAPPY_BIRTHDAY_LESSONS, HAPPY_BIRTHDAY_MELODY } from './happyBirthday';

const [beginner, intermediate, advanced] = HAPPY_BIRTHDAY_LESSONS;
const melody = parseNotes(HAPPY_BIRTHDAY_MELODY);
const pc = (midi: number) => ((midi % 12) + 12) % 12;

/** Phần đệm tay trái kèm phách bắt đầu. */
function leftItems(lesson: Lesson) {
  let beat = 0;
  return lesson.accompaniment!.map((c) => {
    const item = { ...c, start: beat };
    beat += DURATION_BEATS[c.duration];
    return item;
  });
}

/** Mọi nốt đang được đánh theo từng tay: [phách, midis] (tay phải = chùm nốt, tay trái = nốt / hợp âm đệm). */
function chordsOf(lesson: Lesson) {
  const starts = noteStarts(lesson);
  return {
    right: lesson.notes.map((n, i) => ({ start: starts[i], midis: chordMidis(n), fingers: [...(n.harmony ?? []).map((h) => h.finger), n.finger] })),
    left: leftItems(lesson)
      .filter((c) => c.midis.length > 0)
      .map((c) => ({ start: c.start, midis: c.midis, fingers: c.fingers })),
  };
}

describe('Happy Birthday — ba bản phối hai tay', () => {
  it('đăng ký vào thư viện: ba cấp chung một bài, đứng sau bài một bè, mở được bằng LessonManager', () => {
    expect(familyLessons(HAPPY_BIRTHDAY_FAMILY).map((l) => l.id)).toEqual([
      'song-happy-birthday-beginner',
      'song-happy-birthday-intermediate',
      'song-happy-birthday-advanced',
    ]);
    const at = LESSONS.findIndex((l) => l.id === 'song-happy-birthday');
    expect(LESSONS.slice(at + 1, at + 4)).toEqual(HAPPY_BIRTHDAY_LESSONS);
    for (const l of HAPPY_BIRTHDAY_LESSONS) {
      expect(l).toMatchObject({ category: 'song', clef: 'grand', hand: 'both', timeSignature: [3, 4], pickup: 1, arrangement: { family: HAPPY_BIRTHDAY_FAMILY } });
      expect(l.keySignature ?? 'C').toBe('C');
      expect(l.source).toMatch(/phạm vi công cộng/);
      expect(l.repertoire).toBeUndefined();
    }
    expect(HAPPY_BIRTHDAY_LESSONS.map((l) => l.arrangement!.level)).toEqual([1, 2, 3]);
    expect(HAPPY_BIRTHDAY_LESSONS.map((l) => l.difficulty)).toEqual([1, 2, 3]);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: giai điệu (nốt cao nhất tay phải) đúng nguyên bản cả cao độ lẫn trường độ', (_id, l) => {
    const top = l.notes.slice(0, melody.length).map((n) => [n.pitch, n.duration]);
    expect(top).toEqual(melody.map((n) => [n.pitch, n.duration]));
    // Hoà âm luôn nằm dưới giai điệu, cùng trường độ (chung một đuôi nốt).
    for (const n of l.notes) for (const h of n.harmony ?? []) expect(h.midi).toBeLessThan(n.midi);
  });

  it('chỉ bản Nâng cao thêm một ô coda sau giai điệu', () => {
    const count = (l: Lesson) => splitMeasures(l.notes, measureLength(l.timeSignature), l.pickup).length;
    expect([beginner, intermediate].map(count)).toEqual([9, 9]);
    expect(count(advanced)).toBe(10);
    expect(advanced.notes.slice(melody.length).map((n) => n.duration)).toEqual(['hd']);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: tổng trường độ từng ô hai tay khớp nhịp 3/4 (ô lấy đà 1 phách)', (_id, l) => {
    for (const ms of [splitMeasures(l.notes, 3, 1), splitMeasures(l.accompaniment!, 3, 1)]) {
      expect(ms[0].beats).toBe(1);
      ms.slice(1).forEach((m) => expect(m.beats).toBeCloseTo(3, 9));
    }
    expect(measureStarts(l)).toEqual(Array.from({ length: measureStarts(l).length }, (_, i) => (i === 0 ? 0 : 1 + (i - 1) * 3)));
    // Ô lấy đà: tay trái nghỉ.
    expect(l.accompaniment![0]).toMatchObject({ pitches: [], duration: 'q' });
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: tay trái và tay phải tách tầm (mọi nốt tay trái thấp hơn mọi nốt tay phải), trong tầm đàn của app', (_id, l) => {
    const { right, left } = chordsOf(l);
    const rh = right.flatMap((c) => c.midis);
    const lh = left.flatMap((c) => c.midis);
    expect(Math.max(...lh)).toBeLessThan(Math.min(...rh));
    for (const m of [...rh, ...lh]) {
      expect(m).toBeGreaterThanOrEqual(36);
      expect(m).toBeLessThanOrEqual(84);
    }
    // Nốt nào cũng thuộc đúng một tay: tay phải ở khoá Sol (từ Rê4), tay trái ở khoá Fa (tới Đô4).
    expect(Math.min(...rh)).toBeGreaterThanOrEqual(62);
    expect(Math.max(...lh)).toBeLessThanOrEqual(60);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: chùm nốt bấm được — tối đa quãng 8 mỗi tay, số ngón khác nhau và theo đúng chiều phím', (_id, l) => {
    const { right, left } = chordsOf(l);
    for (const c of right) {
      expect(c.midis.length).toBeLessThanOrEqual(4);
      expect(c.midis[c.midis.length - 1] - c.midis[0]).toBeLessThanOrEqual(12);
      const f = c.fingers.filter((x): x is NonNullable<typeof x> => x !== undefined);
      // Tay phải: nốt cao hơn → ngón số lớn hơn.
      if (f.length === c.midis.length) expect(f).toEqual([...f].sort((a, b) => a - b).filter((x, i, a) => a.indexOf(x) === i));
    }
    for (const c of left) {
      expect(c.midis.length).toBeLessThanOrEqual(3);
      expect(c.midis[c.midis.length - 1] - c.midis[0]).toBeLessThanOrEqual(12);
      const f = c.fingers.filter((x): x is NonNullable<typeof x> => x !== undefined);
      // Tay trái: nốt cao hơn → ngón số nhỏ hơn.
      if (f.length === c.midis.length) expect(f).toEqual([...f].sort((a, b) => b - a).filter((x, i, a) => a.indexOf(x) === i));
    }
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: phần đệm và hoà âm đúng hợp âm ghi trên khuông', (id, l) => {
    const starts = noteStarts(l);
    const end = measureStarts(l).at(-1)!;
    const symbols = l.chordSymbols!.map((c, i, all) => ({ ...parseChordSymbol(c.symbol), symbol: c.symbol, from: starts[c.index], to: i + 1 < all.length ? starts[all[i + 1].index] : end }));
    // Ký hiệu đầu tiên ở ô 1 (ô lấy đà không có hợp âm), theo thứ tự thời gian.
    expect(symbols[0].from).toBe(1);
    const lh = leftItems(l).filter((c) => c.midis.length > 0);
    // Hai nốt dựa (Si/Sol → La/Fa trên hợp âm Fa) ở ô 6 phách 1 là chủ ý của bản phối.
    const appoggiatura = id === beginner.id ? [] : [starts[l.notes.findIndex((_, i) => starts[i] === 1 + 5 * 3)]];
    for (const s of symbols) {
      const atStart = lh.find((c) => Math.abs(c.start - s.from) < 1e-9);
      expect(atStart, `${s.symbol}: tay trái đánh ở chỗ đổi hợp âm`).toBeDefined();
      expect(pc(atStart!.midis[0]), `${s.symbol}: nốt trầm`).toBe(s.bass);
      for (const c of lh.filter((c) => c.start >= s.from - 1e-9 && c.start < s.to - 1e-9)) {
        for (const m of c.midis) expect(s.tones, `${s.symbol}: tay trái ${m}`).toContain(pc(m));
      }
      l.notes.forEach((n, i) => {
        if (starts[i] < s.from - 1e-9 || starts[i] >= s.to - 1e-9 || appoggiatura.includes(starts[i])) return;
        for (const m of harmonyMidis(n)) expect(s.tones, `${s.symbol}: hoà âm tay phải ${m}`).toContain(pc(m));
      });
    }
  });

  it('Cơ bản: tay phải từng nốt, đủ số ngón; tay trái một nốt trầm (cuối bài quãng 5) chỉ C – F – G, không dời thế Đô', () => {
    expect(beginner.notes.every((n) => !n.harmony?.length && n.finger)).toBe(true);
    const { left } = chordsOf(beginner);
    expect(left.every((c) => c.midis.length === 1 || (c.midis.length === 2 && c.midis[1] - c.midis[0] === 7))).toBe(true);
    // Thế Đô tay trái: Đô3 (48) … Sol3 (55).
    for (const m of left.flatMap((c) => c.midis)) {
      expect(m).toBeGreaterThanOrEqual(48);
      expect(m).toBeLessThanOrEqual(55);
    }
    expect(new Set(beginner.chordSymbols!.map((c) => c.symbol))).toEqual(new Set(['C', 'F', 'G']));
    // Mỗi ô một nốt trầm ở phách mạnh (ô 7 thêm Sol ở phách 3).
    const strong = leftItems(beginner).filter((c) => c.midis.length && (c.start - 1) % 3 === 0);
    expect(strong).toHaveLength(8);
    expect(beginner.pedalOptional).toBe(true);
    expect(beginner.dynamics).toBeUndefined();
  });

  it('Trung cấp: tay phải có quãng 3 và quãng 6; tay trái đệm valse (trầm phách 1, hợp âm phách 2 – 3) và rải hợp âm; có C7 chuyển tiếp', () => {
    const intervals = intermediate.notes.filter((n) => n.harmony?.length === 1).map((n) => n.midi - n.harmony![0].midi);
    expect(intervals.some((d) => d === 3 || d === 4)).toBe(true);
    expect(intervals.some((d) => d === 8 || d === 9)).toBe(true);
    const items = leftItems(intermediate);
    for (const m of [1, 2, 3, 5, 6]) {
      const inMeasure = items.filter((c) => c.start >= 1 + (m - 1) * 3 - 1e-9 && c.start < 1 + m * 3 - 1e-9);
      expect(inMeasure.map((c) => c.midis.length > 1), `ô ${m}`).toEqual([false, true, true]);
    }
    // Ô 4 và ô 8: rải hợp âm Đô từng nốt đen.
    for (const m of [4, 8]) {
      const inMeasure = items.filter((c) => c.start >= 1 + (m - 1) * 3 - 1e-9 && c.start < 1 + m * 3 - 1e-9);
      expect(inMeasure.map((c) => c.pitches.join('+'))).toEqual(['C3', 'G3', 'C4']);
    }
    expect(intermediate.chordSymbols!.map((c) => c.symbol)).toContain('C7');
    expect(new Set(intermediate.dynamics!.map((d) => d.mark))).toEqual(new Set(['p', 'mp', 'mf']));
    expect(intermediate.hairpins).toEqual([expect.objectContaining({ type: 'cresc' })]);
  });

  it('Nâng cao: có quãng 8 và hợp âm ba bè tay phải, bè trầm đi xuống nửa cung, sắc thái đầy đủ, pedal đổi giữa ô theo hợp âm', () => {
    expect(advanced.notes.some((n) => n.harmony?.length && n.midi - n.harmony[0].midi === 12)).toBe(true);
    expect(advanced.notes.filter((n) => (n.harmony?.length ?? 0) >= 2).length).toBeGreaterThanOrEqual(10);
    // Bè trầm ở chỗ đổi hợp âm ô 5 – 8: Đô3 – Si♭2 – La2 – La♭2 – Sol2 – Đô2.
    const lh = leftItems(advanced).filter((c) => c.midis.length);
    const bassAt = (beat: number) => lh.find((c) => Math.abs(c.start - beat) < 1e-9)!.pitches[0];
    expect([13, 15, 16, 18, 19, 22].map(bassAt)).toEqual(['C3', 'Bb2', 'A2', 'Ab2', 'G2', 'C2']);
    // Có móc đơn rải hợp âm / câu nối.
    expect(advanced.accompaniment!.filter((c) => c.duration === '8').length).toBeGreaterThanOrEqual(18);
    expect(new Set(advanced.dynamics!.map((d) => d.mark))).toEqual(new Set(['p', 'mp', 'mf', 'f']));
    expect(advanced.hairpins!.map((h) => h.type).sort()).toEqual(['cresc', 'dim', 'dim']);
    // Pedal đổi giữa ô đúng chỗ đổi hợp âm (ô 5, 6, 7 phách 3).
    const ranges = pedalRanges(advanced);
    const changes = ranges.slice(1).map((r) => r.startBeat).filter((b) => (b - 1) % 3 !== 0);
    // Ô n bắt đầu ở phách 1 + 3(n − 1): ô 5 phách 3 = 15, ô 6 phách 2 = 17, phách 3 = 18, ô 7 phách 3 = 21.
    expect(changes).toEqual([15, 17, 18, 21]);
    const chordStarts = advanced.chordSymbols!.map((c) => noteStarts(advanced)[c.index]);
    // Mọi chỗ đổi pedal giữa ô đều là chỗ đổi hợp âm, trừ phách 2 ô 6 (hết nốt dựa).
    expect(changes.filter((b) => !chordStarts.includes(b))).toEqual([17]);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: nhịp độ mặc định nằm trong khoảng tham khảo; có lộ trình 5 bước, bước cuối là Biểu diễn', (_id, l) => {
    const [lo, hi] = l.tempoRange!;
    expect(l.tempo!).toBeGreaterThanOrEqual(lo);
    expect(l.tempo!).toBeLessThanOrEqual(hi);
    const plan = practicePlan(l.id);
    expect(plan).toHaveLength(5);
    expect(plan.map((s) => s.hand)).toContain('right');
    expect(plan.map((s) => s.hand)).toContain('left');
    expect(plan.at(-1)!.mode).toBe('perform');
  });

  it('khoảng nhịp độ đúng yêu cầu từng cấp', () => {
    expect(HAPPY_BIRTHDAY_LESSONS.map((l) => l.tempoRange)).toEqual([
      [60, 80],
      [75, 100],
      [85, 115],
    ]);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: Wait Mode hai tay (đàn MIDI) — đánh đủ chùm nốt hai tay đúng thứ tự bất kỳ → hết bài, không lỗi', (_id, l) => {
    const left = accompanimentByNote(l)!;
    const extras = l.notes.map((n, i) => [...harmonyMidis(n), ...left[i].midis]);
    const engine = new PracticeEngine(l.notes.map((n) => n.midi), { ...DEFAULT_PRACTICE_CONFIG, twoHands: true }, extras);
    let time = 1000;
    l.notes.forEach((n, i) => {
      // Tay trái trước, rồi hoà âm, giai điệu cuối — thứ tự nào cũng được.
      for (const m of [...left[i].midis, ...harmonyMidis(n)]) expect(engine.handleNote(m, (time += 1000))).toBe('partial');
      engine.handleNote(n.midi, (time += 1000));
    });
    expect(engine.getState()).toMatchObject({ status: 'finished', wrong: 0, correct: l.notes.length });
  });

  it('Wait Mode hai tay: thiếu nốt hoà âm thì chưa sang nốt; đánh sai nốt hoà âm tính lỗi, không nhảy nốt', () => {
    const l = intermediate;
    const left = accompanimentByNote(l)!;
    const extras = l.notes.map((n, i) => [...harmonyMidis(n), ...left[i].midis]);
    const engine = new PracticeEngine(l.notes.map((n) => n.midi), { ...DEFAULT_PRACTICE_CONFIG, twoHands: true }, extras);
    let time = 1000;
    // Đi tới ô 2 phách 1: Sol4 + Si4 (quãng 3) trên Si2 (G7/B) — chỉ số nốt 5 (ô lấy đà 2 nốt + ô 1 ba nốt).
    for (let i = 0; i < 5; i++) {
      for (const m of extras[i]) engine.handleNote(m, (time += 1000));
      engine.handleNote(l.notes[i].midi, (time += 1000));
    }
    expect(engine.getState().index).toBe(5);
    expect(l.notes[5]).toMatchObject({ pitch: 'B4', harmony: [{ pitch: 'G4' }] });
    expect(engine.handleNote(71, (time += 1000))).toBe('partial'); // Si4 giai điệu
    expect(engine.handleNote(47, (time += 1000))).toBe('partial'); // Si2 tay trái
    expect(engine.getState().index).toBe(5); // còn thiếu Sol4
    expect(engine.handleNote(65, (time += 1000))).toBe('wrong'); // Fa4 thay vì Sol4
    expect(engine.getState()).toMatchObject({ index: 5, wrong: 1 });
    expect(engine.handleNote(67, (time += 1000))).toBe('partial');
    // Hợp âm valse phách 2 (Fa3 + Sol3) bắt đầu lúc Si4 nốt trắng đang ngân → cùng bước với Si4.
    expect(extras[5]).toEqual([67, 47, 53, 55]);
    expect(engine.handleNote(53, (time += 1000))).toBe('partial');
    expect(engine.handleNote(55, (time += 1000))).toBe('correct');
    expect(engine.getState()).toMatchObject({ index: 6, wrong: 1 });
    expect(engine.getState().results[5]).toBe('corrected');
  });

  it('gợi ý cấp độ: cấp thấp nhất chưa vững; hoàn thành ≥ 90% thì gợi ý lên cấp kế', () => {
    const p = (id: string, completions: number, bestAccuracy: number) => ({
      [id]: { lessonId: id, sessions: 1, completions, bestAccuracy, totalCorrect: 0, totalWrong: 0, totalPracticeMs: 0, lastPracticedAt: 0 },
    });
    expect(recommendedLevel(HAPPY_BIRTHDAY_FAMILY, {})?.id).toBe(beginner.id);
    expect(recommendedLevel(HAPPY_BIRTHDAY_FAMILY, p(beginner.id, 1, 0.85))?.id).toBe(beginner.id);
    expect(recommendedLevel(HAPPY_BIRTHDAY_FAMILY, p(beginner.id, 2, 0.95))?.id).toBe(intermediate.id);
    expect(recommendedLevel(HAPPY_BIRTHDAY_FAMILY, { ...p(beginner.id, 1, 1), ...p(intermediate.id, 1, 0.9), ...p(advanced.id, 1, 0.97) })?.id).toBe(advanced.id);
    expect(levelMastered(undefined)).toBe(false);
    expect(nextLevel(beginner)?.id).toBe(intermediate.id);
    expect(nextLevel(intermediate)?.id).toBe(advanced.id);
    expect(nextLevel(advanced)).toBeUndefined();
    expect(nextLevel(LESSONS[0])).toBeUndefined();
  });
});

describe('Happy Birthday — phát lại và file MIDI', () => {
  /** Đọc file MIDI một track: các cặp Note On / Note Off → { tick, off, midi, channel, velocity }. */
  function readMidi(bytes: Uint8Array) {
    const text = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
    expect(text(0, 4)).toBe('MThd');
    expect(text(14, 18)).toBe('MTrk');
    let i = 22;
    let tick = 0;
    const open = new Map<string, { tick: number; velocity: number }>();
    const notes: { tick: number; off: number; midi: number; channel: number; velocity: number }[] = [];
    while (i < bytes.length) {
      let delta = 0;
      let b: number;
      do {
        b = bytes[i++];
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80);
      tick += delta;
      const status = bytes[i++];
      if (status === 0xff) {
        const len = bytes[i + 1];
        i += 2 + len;
        continue;
      }
      const [midi, velocity] = [bytes[i++], bytes[i++]];
      const channel = status & 0x0f;
      const key = `${channel}:${midi}`;
      if ((status & 0xf0) === 0x90 && velocity > 0) open.set(key, { tick, velocity });
      else {
        const on = open.get(key)!;
        open.delete(key);
        notes.push({ tick: on.tick, off: tick, midi, channel, velocity: on.velocity });
      }
    }
    return notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  }

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: nguồn phát gồm mọi phím hai tay đúng phách, trường độ, theo thứ tự thời gian', (_id, l) => {
    const sounding = soundingNotes(l);
    const { right, left } = chordsOf(l);
    expect(sounding).toHaveLength(right.flatMap((c) => c.midis).length + left.flatMap((c) => c.midis).length);
    expect(sounding.every((n, i) => i === 0 || sounding[i - 1].startBeat <= n.startBeat)).toBe(true);
    // Mỗi chùm nốt tay phải phát đủ các phím ở đúng phách + trường độ của nốt giai điệu.
    const starts = noteStarts(l);
    l.notes.forEach((n, i) => {
      for (const m of chordMidis(n)) {
        expect(sounding.some((s) => s.hand === 'right' && s.midiNote === m && Math.abs(s.startBeat - starts[i]) < 1e-9 && s.durationBeats === DURATION_BEATS[n.duration])).toBe(true);
      }
    });
    for (const c of leftItems(l)) for (const m of c.midis) expect(sounding.some((s) => s.hand === 'left' && s.midiNote === m && Math.abs(s.startBeat - c.start) < 1e-9)).toBe(true);
  });

  it.each(HAPPY_BIRTHDAY_LESSONS.map((l) => [l.id, l] as const))('%s: file MIDI đúng cao độ, trường độ, thứ tự; tay phải kênh 1, tay trái kênh 2', (_id, l) => {
    const notes = readMidi(lessonToMidi(l, 90));
    const sounding = soundingNotes(l);
    expect(notes).toHaveLength(sounding.length);
    const expected = sounding
      .map((s) => ({ tick: Math.round(s.startBeat * 480), off: Math.round((s.startBeat + s.durationBeats) * 480), midi: s.midiNote, channel: s.hand === 'left' ? 1 : 0 }))
      .sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    expect(notes.map(({ tick, off, midi, channel }) => ({ tick, off, midi, channel }))).toEqual(expected);
  });

  it('nghe mẫu: chùm nốt tay phải + tay trái kêu cùng lúc, pedal làm nốt ngân tới chỗ đổi pedal', () => {
    const plan = listenPlan(advanced, 0);
    expect(plan.notes).toHaveLength(soundingNotes(advanced).length);
    // Ô 5 phách 1 (phách 13 của bài): Sol4 + Si♭4 + Sol5 tay phải, Đô3 tay trái.
    const at13 = plan.notes.filter((n) => Math.abs(n.startBeat - 13) < 1e-9).map((n) => n.midiNote).sort((a, b) => a - b);
    expect(at13).toEqual([48, 67, 70, 79]);
    // Đô3 (nốt đen) ngân tới chỗ đổi pedal ở phách 3 của ô (phách 15).
    expect(plan.notes.find((n) => n.midiNote === 48 && Math.abs(n.startBeat - 13) < 1e-9)!.durationBeats).toBe(2);
  });

  it('to dần: lực gõ tăng dần dưới hình nêm, tới đúng sắc thái đứng sau (mf ở ô 5)', () => {
    const tl = lessonTimeline(intermediate);
    const h = intermediate.hairpins![0];
    const v = tl.slice(h.from, h.to + 2).map((n) => n.velocity);
    expect(v.every((x, i) => i === 0 || x >= v[i - 1])).toBe(true);
    expect(v[0]).toBeLessThan(v[v.length - 1]);
    expect(tl[h.to + 1].dynamic).toBe('mf');
  });
});
