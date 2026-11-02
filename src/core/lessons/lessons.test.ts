import { hasHandChoice } from '../practice/handPractice';
import { DEFAULT_PRACTICE_CONFIG, PracticeEngine } from '../practice/PracticeEngine';
import { describe, expect, it } from 'vitest';
import { LESSONS } from './library';
import { parseAccompaniment, parseNotes, splitMeasures } from './notation';
import { lessonManager } from './LessonManager';
import { buildAccompaniment } from './repertoire';
import { accompanimentByNote, fingerText, isAccompanimentMidi, measureLength, sectionAt, type Hand, type Lesson } from './types';

describe('ký hiệu bài học', () => {
  it('phân tích chuỗi nốt với trường độ mặc định', () => {
    expect(parseNotes('C4 D4/h | E4/8')).toEqual([
      { pitch: 'C4', midi: 60, duration: 'q' },
      { pitch: 'D4', midi: 62, duration: 'h' },
      { pitch: 'E4', midi: 64, duration: '8' },
    ]);
  });

  it('phân tích số ngón tay', () => {
    expect(parseNotes('C4:1 E4/h:3')).toEqual([
      { pitch: 'C4', midi: 60, duration: 'q', finger: 1 },
      { pitch: 'E4', midi: 64, duration: 'h', finger: 3 },
    ]);
    expect(() => parseNotes('C4:6')).toThrow();
    expect(() => parseNotes('C4/h:')).toThrow();
    expect(parseNotes('Bb4:(3)')[0]).toMatchObject({ finger: 3, fingerCircled: true });
    expect(() => parseNotes('C4:(6)')).toThrow();
    expect(() => parseNotes('C4:(3')).toThrow();
    expect(fingerText(3)).toBe('3');
    expect(fingerText(3, true)).toBe('③');
  });

  it('phân tích dấu lặng (R), không cho ghi ngón trên dấu lặng', () => {
    expect(parseNotes('C4 R | LH R/h')).toEqual([
      { pitch: 'C4', midi: 60, duration: 'q' },
      { pitch: 'R', midi: -1, duration: 'q', rest: true },
      { pitch: 'R', midi: -1, duration: 'h', rest: true, hand: 'left' },
    ]);
    expect(() => parseNotes('R:1')).toThrow();
    expect(splitMeasures(parseNotes('C4 R C4/h'), 4)[0].beats).toBe(4);
  });

  it('báo lỗi với nốt hoặc trường độ sai', () => {
    expect(() => parseNotes('X4')).toThrow();
    expect(() => parseNotes('C4/z')).toThrow();
  });

  it('chia ô nhịp và phát hiện nốt vắt vạch nhịp', () => {
    expect(splitMeasures(parseNotes('C4 C4 C4 C4 D4/w'), 4).map((m) => m.items.length)).toEqual([4, 1]);
    expect(() => splitMeasures(parseNotes('C4 C4 C4 D4/h'), 4)).toThrow();
  });

  it('phân tích phần đệm: hợp âm, trường độ, số ngón tay', () => {
    expect(parseAccompaniment('A3+D3+F3/hd:1+5+3 | G2:5 C#3')).toEqual([
      { pitches: ['D3', 'F3', 'A3'], midis: [50, 53, 57], duration: 'hd', fingers: [5, 3, 1], fingersCircled: [false, false, false] },
      { pitches: ['G2'], midis: [43], duration: 'q', fingers: [5], fingersCircled: [false] },
      { pitches: ['C#3'], midis: [49], duration: 'q', fingers: [undefined], fingersCircled: [false] },
    ]);
    expect(parseAccompaniment('G2+Bb2/h:5+(3)')[0].fingersCircled).toEqual([false, true]);
    expect(parseAccompaniment('D3+F3/h:+3')[0].fingers).toEqual([undefined, 3]);
    expect(() => parseAccompaniment('D3+F3:1+2+3')).toThrow();
    expect(() => parseAccompaniment('D3:7')).toThrow();
  });

  it('hỗ trợ nhịp 3/8, móc kép và nhịp lấy đà', () => {
    expect(measureLength([3, 8])).toBe(1.5);
    const m = splitMeasures(parseNotes('E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/8d C4/16 E4/16 A4/16'), 1.5, 0.5);
    expect(m.map((x) => x.items.length)).toEqual([2, 6, 4]);
    expect(m.map((x) => x.beats)).toEqual([0.5, 1.5, 1.5]);
    expect(() => splitMeasures(parseNotes('E5/16 D5/8'), 1.5, 0.5)).toThrow();
  });
});

describe('thư viện bài học', () => {
  it('có đủ các nhóm bài bắt buộc', () => {
    const count = (c: string) => LESSONS.filter((l) => l.category === c).length;
    expect(count('notes')).toBeGreaterThanOrEqual(1);
    expect(count('scale')).toBeGreaterThanOrEqual(1);
    expect(count('right-hand')).toBeGreaterThanOrEqual(1);
    expect(count('left-hand')).toBeGreaterThanOrEqual(1);
    expect(count('song')).toBeGreaterThanOrEqual(5);
  });

  it('id bài học là duy nhất', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: mọi ô nhịp đầy đủ phách', (_id, lesson) => {
    const full = measureLength(lesson.timeSignature);
    const measures = splitMeasures(lesson.notes, full, lesson.pickup);
    measures.forEach((m, i) => expect(m.beats).toBeCloseTo(i === 0 && lesson.pickup ? lesson.pickup : full, 9));
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: nốt nằm trong tầm nhận diện micro, không có dấu lặng', (_id, lesson) => {
    for (const n of lesson.notes) {
      // Màn Luyện tập (PracticeEngine) chờ từng nốt — dấu lặng chỉ dùng ở bài tiết tấu của giáo trình.
      expect(n.rest).toBeUndefined();
      expect(n.midi).toBeGreaterThanOrEqual(36);
      expect(n.midi).toBeLessThanOrEqual(84);
    }
  });

  /** Thế tay cố định: mỗi ngón ứng với đúng một phím; tay phải ngón số lớn ở phím cao hơn, tay trái ngược lại. */
  function expectFixedPosition(notes: Lesson['notes'], hand: Hand) {
    const keyOf = new Map<number, number>();
    for (const n of notes) {
      expect(n.finger).toBeDefined();
      const f = n.finger!;
      expect(keyOf.get(f) ?? n.midi).toBe(n.midi);
      keyOf.set(f, n.midi);
    }
    const sorted = [...keyOf.entries()].sort(([a], [b]) => a - b).map(([, midi]) => midi);
    expect(sorted).toEqual([...sorted].sort((a, b) => (hand === 'right' ? a - b : b - a)));
  }

  const bothHands = LESSONS.filter((l) => l.category === 'both-hands');

  it('ký hiệu RH / LH đặt tay cho các nốt phía sau', () => {
    expect(parseNotes('LH C3:5 RH C4:1 E4').map((n) => n.hand)).toEqual(['left', 'right', 'right']);
    expect(parseNotes('C4').map((n) => n.hand)).toEqual([undefined]);
  });

  it.each(bothHands.map((l) => [l.id, l] as const))('%s: khuông đôi, nốt nào cũng ghi tay, mỗi tay một thế cố định', (_id, lesson) => {
    expect(lesson.clef).toBe('grand');
    expect(lesson.hand).toBe('both');
    const right = lesson.notes.filter((n) => n.hand === 'right');
    const left = lesson.notes.filter((n) => n.hand === 'left');
    expect(right.length + left.length).toBe(lesson.notes.length);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    // Tay phải ở khoá Sol (từ Đô giữa trở lên), tay trái ở khoá Fa (dưới Đô giữa).
    right.forEach((n) => expect(n.midi).toBeGreaterThanOrEqual(60));
    left.forEach((n) => expect(n.midi).toBeLessThan(60));
    expectFixedPosition(right, 'right');
    expectFixedPosition(left, 'left');
  });

  const withAccompaniment = LESSONS.filter((l) => l.accompaniment);

  it.each(withAccompaniment.map((l) => [l.id, l] as const))('%s: phần đệm khớp ô nhịp với giai điệu, nằm dưới giai điệu', (_id, lesson) => {
    expect(lesson.clef).toBe('grand');
    const full = measureLength(lesson.timeSignature);
    const melody = splitMeasures(lesson.notes, full, lesson.pickup);
    const acc = splitMeasures(lesson.accompaniment!, full, lesson.pickup);
    expect(acc.length).toBe(melody.length);
    acc.forEach((m, i) => expect(m.beats).toBeCloseTo(i === 0 && lesson.pickup ? lesson.pickup : full, 9));
    const accMidis = lesson.accompaniment!.flatMap((n) => n.midis);
    accMidis.forEach((m) => expect(m).toBeGreaterThanOrEqual(36));
    // Giai điệu là tay phải; mọi nốt đệm thấp hơn giai điệu để lọc được nốt tay trái khi chấm.
    lesson.notes.forEach((n) => expect(n.hand ?? 'right').toBe('right'));
    expect(Math.max(...accMidis)).toBeLessThan(Math.min(...lesson.notes.map((n) => n.midi)));
    accMidis.forEach((m) => expect(isAccompanimentMidi(lesson, m)).toBe(true));
    lesson.notes.forEach((n) => expect(isAccompanimentMidi(lesson, n.midi)).toBe(false));
  });

  it('chữ đánh dấu đoạn theo số ô nhịp in trên bản nhạc (ô lấy đà không đánh số)', () => {
    const sections = [{ measure: 1, label: 'A' }, { measure: 17, label: 'B' }];
    expect(sectionAt({ sections }, 0)).toBe('A');
    expect(sectionAt({ sections }, 16)).toBe('B');
    expect(sectionAt({ sections }, 1)).toBeUndefined();
    expect(sectionAt({ sections, pickup: 1 }, 1)).toBe('A');
    expect(sectionAt({}, 0)).toBeUndefined();
  });

  it.each(LESSONS.filter((l) => l.sections).map((l) => [l.id, l] as const))('%s: chữ đánh dấu đoạn nằm trong bài', (_id, lesson) => {
    const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup).length;
    for (const s of lesson.sections!) {
      expect(s.measure).toBeGreaterThanOrEqual(1);
      expect(s.measure).toBeLessThanOrEqual(lesson.pickup ? count - 1 : count);
    }
  });

  it.each(withAccompaniment.map((l) => [l.id, l] as const))('%s: mọi nốt đệm được gán cho một nốt giai điệu (chấm hai tay)', (_id, lesson) => {
    const left = accompanimentByNote(lesson)!;
    expect(left).toHaveLength(lesson.notes.length);
    expect(left.flatMap((s) => s.midis)).toEqual(lesson.accompaniment!.flatMap((n) => n.midis));
    left.forEach((s) => expect(s.fingers).toHaveLength(s.midis.length));
  });

  it('Romance hai tay: hợp âm giữ cả ô (đoạn A) chỉ đánh ở nốt đầu ô; rải hợp âm (đoạn B) mỗi nốt một nốt đệm', () => {
    const lesson = LESSONS.find((l) => l.id === 'song-romance-2-hands')!;
    const left = accompanimentByNote(lesson)!;
    expect(left.slice(0, 4).map((s) => s.pitches)).toEqual([['D3', 'F3', 'A3'], [], [], ['D3', 'F3', 'A3']]);
    expect(left[0].fingers).toEqual([5, 3, 1]);
    // Bước không đánh mới: đang giữ hợp âm.
    expect(left[1]).toMatchObject({ midis: [], held: ['D3', 'F3', 'A3'] });
    // Đoạn B bắt đầu ở ô 17.
    const b = splitMeasures(lesson.notes, measureLength(lesson.timeSignature)).slice(0, 16).reduce((n, m) => n + m.items.length, 0);
    expect(left.slice(b, b + 3).map((s) => s.pitches)).toEqual([['D3'], ['F3'], ['A3']]);
    expect(left[b + 1].held).toEqual([]);
    expect(accompanimentByNote(LESSONS[0])).toBeUndefined();
  });

  it('Romance hai tay: pedal thay mỗi ô nhịp, đủ 32 ô', () => {
    const lesson = LESSONS.find((l) => l.id === 'song-romance-2-hands')!;
    const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature)).length;
    expect(count).toBe(32);
    expect(lesson.pedal).toEqual(Array.from({ length: count }, (_, i) => ({ from: i, to: i })));
  });

  it('Für Elise hai tay: 17 ô (gồm ô lấy đà), tay trái nghỉ ở ô chỉ có tay phải, pedal ở ô rải hợp âm', () => {
    const lesson = LESSONS.find((l) => l.id === 'song-fur-elise-2-hands')!;
    const full = measureLength(lesson.timeSignature);
    expect(splitMeasures(lesson.notes, full, lesson.pickup)).toHaveLength(17);
    const acc = splitMeasures(lesson.accompaniment!, full, lesson.pickup);
    const silent = acc.map((m, i) => (m.items.every((n) => n.midis.length === 0) ? i : -1)).filter((i) => i >= 0);
    expect(silent).toEqual([0, 1, 5, 9, 13]);
    // Pedal đúng ở các ô tay trái có nốt.
    expect(lesson.pedal!.map((p) => p.from)).toEqual(acc.map((_, i) => i).filter((i) => !silent.includes(i)));
    // Ô 2: nốt La4 chờ cả ba nốt rải tay trái; nốt kế (Đô4) tay trái đang nghỉ.
    const left = accompanimentByNote(lesson)!;
    const a4 = lesson.notes.findIndex((n) => n.pitch === 'A4');
    expect(left[a4].pitches).toEqual(['A2', 'E3', 'A3']);
    expect(left[a4 + 1]).toMatchObject({ midis: [], held: [] });
  });

  const pedalSongs = [
    'song-ode-to-joy-2-hands',
    'song-amazing-grace-2-hands',
    'song-silent-night-2-hands',
    'song-greensleeves-2-hands',
    'song-auld-lang-syne-2-hands',
  ];

  it.each(pedalSongs)('%s: hai tay, pedal thay mỗi ô có tay trái (ô lấy đà không đạp)', (id) => {
    const lesson = LESSONS.find((l) => l.id === id)!;
    expect(lesson).toMatchObject({ clef: 'grand', hand: 'both', category: 'song' });
    const acc = splitMeasures(lesson.accompaniment!, measureLength(lesson.timeSignature), lesson.pickup);
    const played = acc.map((m, i) => (m.items.some((n) => n.midis.length) ? i : -1)).filter((i) => i >= 0);
    expect(lesson.pedal).toEqual(played.map((i) => ({ from: i, to: i })));
    expect(played).toHaveLength(lesson.pickup ? acc.length - 1 : acc.length);
  });

  it('mọi bài khuông đôi trong thư viện đều có pedal và chọn được tay', () => {
    const grand = LESSONS.filter((l) => l.clef === 'grand');
    expect(grand.length).toBeGreaterThanOrEqual(12);
    for (const l of grand) {
      expect(l.pedal?.length, l.id).toBeGreaterThan(0);
      expect(hasHandChoice(l), l.id).toBe(true);
      // Pedal nằm trong bài: chỉ số ô hợp lệ, không chồng nhau.
      const count = splitMeasures(l.notes, measureLength(l.timeSignature), l.pickup).length;
      l.pedal!.forEach((p, i) => {
        expect(p.to, l.id).toBeLessThan(count);
        if (i > 0) expect(p.from, l.id).toBeGreaterThan(l.pedal![i - 1].to);
      });
    }
  });

  it.each(['bh-echo', 'bh-parallel', 'bh-hot-cross-buns', 'bh-relay', 'bh-ode-to-joy'])('%s: hai tay thay phiên, pedal thay mỗi ô từ đầu đến hết bài', (id) => {
    const lesson = LESSONS.find((l) => l.id === id)!;
    const count = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup).length;
    expect(lesson.pedal).toEqual(Array.from({ length: count }, (_, i) => ({ from: i, to: i })));
  });

  describe('tuyển tập khuông đôi (trang Thư viện bài hát)', () => {
    const repertoire = LESSONS.filter((l) => l.repertoire);

    it('đủ 50 bài, không hiện ở Thư viện bài trang chủ, đều nằm trong trang bài hát', () => {
      expect(repertoire).toHaveLength(50);
      const home = lessonManager.byCategory().flatMap((g) => g.lessons);
      expect(home.filter((l) => l.repertoire)).toEqual([]);
      expect(home.filter((l) => l.category === 'song')).toHaveLength(30);
      expect(lessonManager.songs()).toHaveLength(80);
    });

    it.each(repertoire.map((l) => [l.id, l] as const))('%s: khuông đôi hai tay, có nguồn, chọn được tay, tập được tay trái, pedal đủ dùng', (_id, l) => {
      expect(l).toMatchObject({ clef: 'grand', hand: 'both', category: 'song' });
      expect(l.source).toMatch(/phạm vi công cộng/);
      expect(hasHandChoice(l)).toBe(true);
      expect(accompanimentByNote(l)).toHaveLength(l.notes.length);
      const measures = splitMeasures(l.notes, measureLength(l.timeSignature), l.pickup).length;
      // Ô đổi hợp âm giữa chừng không đạp, nhưng ít nhất 40% số ô có ký hiệu pedal để chấm.
      expect(l.pedal!.length / measures).toBeGreaterThanOrEqual(0.4);
      // Ô lấy đà không đạp.
      if (l.pickup) expect(l.pedal![0].from).toBeGreaterThanOrEqual(1);
    });

    it.each(repertoire.map((l) => [l.id, l] as const))('%s: đánh hai tay đúng theo khuông → hết bài, không lỗi nào', (_id, l) => {
      const left = accompanimentByNote(l)!;
      const engine = new PracticeEngine(l.notes.map((n) => n.midi), { ...DEFAULT_PRACTICE_CONFIG, twoHands: true }, left.map((s) => s.midis));
      let time = 1000;
      l.notes.forEach((n, i) => {
        engine.handleNote(n.midi, (time += 1000));
        for (const m of left[i].midis) engine.handleNote(m, (time += 1000));
      });
      expect(engine.getState()).toMatchObject({ status: 'finished', wrong: 0, correct: l.notes.length });
    });

    it('dựng tay trái: hợp âm cả ô có pedal, ô đổi hợp âm không; có nghỉ ở ô lấy đà', () => {
      const built = buildAccompaniment({ time: [3, 4], pickup: 1, chords: 'C | G C', pattern: 'hold' });
      expect(parseAccompaniment(built.notation).map((n) => [n.pitches.join('+'), n.duration])).toEqual([
        ['', 'q'],
        ['C3+E3+G3', 'hd'],
        ['G2+B2+D3', 'h'],
        ['C3+E3+G3', 'q'],
      ]);
      expect(built.pedal).toEqual([{ from: 1, to: 1 }]);
      expect(() => buildAccompaniment({ time: [4, 4], chords: 'H', pattern: 'hold' })).toThrow();
      expect(parseAccompaniment(buildAccompaniment({ time: [6, 8], chords: 'C', pattern: 'arp8' }).notation).map((n) => n.pitches[0])).toEqual(['C3', 'E3', 'G3', 'C3', 'E3', 'G3']);
      expect(parseAccompaniment(buildAccompaniment({ time: [4, 4], chords: 'C', pattern: 'alberti' }).notation).map((n) => n.pitches[0]).slice(0, 4)).toEqual(['C3', 'G3', 'E3', 'G3']);
      expect(parseAccompaniment(buildAccompaniment({ time: [3, 4], chords: 'C', pattern: 'oompah' }).notation).map((n) => n.pitches.join('+'))).toEqual(['C3', 'E3+G3', 'E3+G3']);
    });
  });

  it('dấu lặng tay trái "R" trong phần đệm', () => {
    expect(parseAccompaniment('R/8 C3+E3/q')).toEqual([
      { pitches: [], midis: [], duration: '8', fingers: [], fingersCircled: [] },
      expect.objectContaining({ pitches: ['C3', 'E3'] }),
    ]);
    expect(() => parseAccompaniment('R:1')).toThrow();
  });

  it('đệm bắt đầu lúc giai điệu nghỉ → gộp vào nốt giai điệu kế tiếp', () => {
    const lesson = { notes: parseNotes('C4 R D4/h'), accompaniment: parseAccompaniment('C3 G2 E2/h') };
    const left = accompanimentByNote(lesson)!;
    expect(left.map((s) => s.pitches)).toEqual([['C3'], [], ['G2', 'E2']]);
  });

  it('bài không có phần đệm không lọc nốt nào', () => {
    expect(isAccompanimentMidi(LESSONS[0], 36)).toBe(false);
  });

  const kids = LESSONS.filter((l) => l.category === 'kids');

  it('có bài cho bé ở cả tay phải và tay trái', () => {
    expect(kids.filter((l) => l.hand === 'right').length).toBeGreaterThanOrEqual(3);
    expect(kids.filter((l) => l.hand === 'left').length).toBeGreaterThanOrEqual(3);
  });

  it.each(kids.map((l) => [l.id, l] as const))('%s: mọi nốt có số ngón, thế tay cố định', (_id, lesson) => {
    // Bé không phải đổi thế tay trong cả bài.
    expectFixedPosition(lesson.notes, lesson.hand === 'left' ? 'left' : 'right');
  });

  it('LessonManager tìm bài và bài kế tiếp', () => {
    const first = LESSONS[0];
    expect(lessonManager.get(first.id)).toBe(first);
    expect(lessonManager.next(first.id)).toBe(LESSONS[1]);
    expect(lessonManager.next(LESSONS[LESSONS.length - 1].id)).toBeUndefined();
    expect(lessonManager.byCategory()[0].category).toBe('notes');
  });
});
