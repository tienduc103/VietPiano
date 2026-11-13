import { describe, expect, it } from 'vitest';
import { referenceFromLesson } from '../coach/reference/fromLesson';
import { LESSONS } from '../lessons/library';
import { splitMeasures } from '../lessons/notation';
import { DURATION_BEATS, measureLength } from '../lessons/types';
import { handSequences, moveKind, pattern, RH_C, stretchProblems, transitionRefIds } from './build';
import { exerciseById, exerciseForLesson, FINGER_EXERCISES, TECHNIQUE_LIBRARY_LINKS } from './catalog';
import { TECHNIQUE_GROUP_ORDER, type TechniqueLevel } from './types';

const own = FINGER_EXERCISES.filter((e) => !e.libraryLessonId);

describe('thư viện bài kỹ thuật ngón tay', () => {
  it('id duy nhất, có tiền tố tech-, không trùng bài Thư viện', () => {
    const ids = FINGER_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('tech-')).toBe(true);
    for (const e of own) expect(LESSONS.some((l) => l.id === e.lesson.id)).toBe(false);
  });

  it('đủ 13 nhóm bài và đủ 5 cấp, mỗi cấp có ít nhất 4 bài', () => {
    for (const g of TECHNIQUE_GROUP_ORDER) expect(FINGER_EXERCISES.some((e) => e.group === g), g).toBe(true);
    for (const lv of [1, 2, 3, 4, 5] as TechniqueLevel[]) expect(FINGER_EXERCISES.filter((e) => e.level === lv).length, `cấp ${lv}`).toBeGreaterThanOrEqual(4);
  });

  it('mọi ô nhịp đủ phách; tay trái cùng độ dài với tay phải', () => {
    for (const e of own) {
      const full = measureLength(e.lesson.timeSignature);
      const m = splitMeasures(e.lesson.notes, full);
      for (const x of m) expect(x.beats, `${e.id}`).toBeCloseTo(full);
      if (e.lesson.accompaniment) {
        const a = splitMeasures(e.lesson.accompaniment, full);
        expect(a.length, e.id).toBe(m.length);
        for (const x of a) expect(x.beats, `${e.id} tay trái`).toBeCloseTo(full);
        const total = (xs: { duration: keyof typeof DURATION_BEATS }[]) => xs.reduce((s, n) => s + DURATION_BEATS[n.duration], 0);
        expect(total(e.lesson.accompaniment)).toBeCloseTo(total(e.lesson.notes));
      }
    }
  });

  it('nốt nằm trong tầm 36–84 (như thư viện) và nốt nào cũng có số ngón gợi ý', () => {
    for (const e of own) {
      for (const n of e.lesson.notes) {
        if (n.rest) continue;
        expect(n.midi, `${e.id} ${n.pitch}`).toBeGreaterThanOrEqual(36);
        expect(n.midi, `${e.id} ${n.pitch}`).toBeLessThanOrEqual(84);
        expect(n.finger, `${e.id} ${n.pitch} thiếu ngón`).toBeDefined();
      }
      for (const a of e.lesson.accompaniment ?? []) {
        for (const m of a.midis) expect(m).toBeGreaterThanOrEqual(36);
        a.midis.forEach((_, k) => expect(a.fingers[k], `${e.id} tay trái thiếu ngón`).toBeDefined());
      }
    }
  });

  it('không bài tự biên soạn nào ép giãn ngón (khoảng cách phím so với số ngón)', () => {
    // Bài áp dụng dùng nguyên bài Thư viện (có quãng tám 1–5 của Happy Birthday) — không thuộc quy tắc này.
    expect(own.flatMap((e) => stretchProblems(e.lesson))).toEqual([]);
  });

  it('tiên quyết tồn tại, không cao cấp hơn bài, không vòng lặp', () => {
    for (const e of FINGER_EXERCISES)
      for (const p of e.prerequisites) {
        const pre = exerciseById(p);
        expect(pre, `${e.id} → ${p}`).toBeDefined();
        expect(pre!.level).toBeLessThanOrEqual(e.level);
      }
    const visiting = new Set<string>();
    const done = new Set<string>();
    const dfs = (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`vòng lặp tiên quyết ở ${id}`);
      visiting.add(id);
      for (const p of exerciseById(id)!.prerequisites) dfs(p);
      visiting.delete(id);
      done.add(id);
    };
    for (const e of FINGER_EXERCISES) dfs(e.id);
  });

  it('bài áp dụng trỏ tới bài Thư viện có thật', () => {
    for (const [id, lib] of Object.entries(TECHNIQUE_LIBRARY_LINKS)) {
      const e = exerciseById(id);
      expect(e?.lesson.id).toBe(lib);
      expect(exerciseForLesson(lib)?.id).toBe(id);
    }
  });

  it('khoảng tempo hợp lệ, tempo bài nằm trong khoảng, điểm đạt hợp lệ', () => {
    for (const e of FINGER_EXERCISES) {
      expect(e.tempoRange[0]).toBeLessThan(e.tempoRange[1]);
      if (!e.libraryLessonId) {
        expect(e.lesson.tempo!).toBeGreaterThanOrEqual(e.tempoRange[0]);
        expect(e.lesson.tempo!).toBeLessThanOrEqual(e.tempoRange[1]);
      }
      expect(e.scoringConfig.passScore).toBeGreaterThan(0);
      expect(e.estimatedMinutes).toBeGreaterThan(0);
      expect(e.tips.length).toBeGreaterThan(10);
    }
  });

  it('Coach dựng được bản nhạc tham chiếu; bài hai tay chấm cả hai tay', () => {
    for (const e of FINGER_EXERCISES) {
      const ref = referenceFromLesson(e.lesson);
      expect(ref.notes.length, e.id).toBeGreaterThan(0);
      if (e.handMode === 'together' || e.handMode === 'alternate') expect(ref.twoHands, e.id).toBe(true);
      for (const id of e.transitionNotes) expect(ref.notes.some((n) => n.id === id), `${e.id} ${id}`).toBe(true);
    }
  });

  it('có đủ các mẫu đặc tả: 5 ngón, 8 ngón (2–5), chuỗi 8 nốt, chuyển ngón', () => {
    const fingers = (id: string) => exerciseById(id)!.lesson.notes.filter((n) => !n.rest).map((n) => n.finger).join('');
    expect(fingers('tech-l1-5f-updown-rh').startsWith('12345')).toBe(true);
    expect(fingers('tech-l1-5f-downup-lh').startsWith('54321')).toBe(true);
    expect(fingers('tech-l2-13243-rh').startsWith('132435')).toBe(true);
    expect(fingers('tech-l2-thumb-pivot-rh').startsWith('12131415')).toBe(true);
    // Bài 8 ngón không dùng ngón cái.
    for (const id of ['tech-l2-8f-rh', 'tech-l2-8f-lh', 'tech-l2-8f-2435-rh', 'tech-l2-8f-mirror', 'tech-l2-8f-different', 'tech-l2-8f-alternate']) {
      const e = exerciseById(id)!;
      const all = [...e.lesson.notes.map((n) => n.finger), ...(e.lesson.accompaniment ?? []).flatMap((a) => a.fingers)];
      expect(all.includes(1), id).toBe(false);
    }
    expect(fingers('tech-l2-8f-2435-rh')).toContain('2435');
    expect(fingers('tech-l2-8f-2435-rh')).toContain('5342');
    // Chuỗi 8 nốt Đô – Đô: ngón 1-2-3-1-2-3-4-5 tay phải.
    expect(fingers('tech-l3-run8-up-rh')).toBe('12312345');
    expect(fingers('tech-l3-run8-up-lh')).toBe('54321321');
    expect(exerciseById('tech-l3-run16-rh')!.lesson.notes.length).toBe(16);
    expect(exerciseById('tech-l4-run32-rh')!.lesson.notes.length).toBe(32);
  });
});

describe('suy chỗ chuyển ngón từ số ngón', () => {
  it('gam đi lên tay phải: luồn ngón cái ở Fa', () => {
    expect(transitionRefIds(exerciseById('tech-l3-run8-up-rh')!.lesson)).toEqual(['m:3']);
  });
  it('tay trái đi lên: ngón 3 vắt qua ngón cái ở La', () => {
    expect(transitionRefIds(exerciseById('tech-l3-run8-up-lh')!.lesson)).toEqual(['m:5']);
  });
  it('hai tay ngược chiều: chuyển ngón của tay trái nằm ở phần đệm', () => {
    const ids = transitionRefIds(exerciseById('tech-l3-scale-c-contrary')!.lesson);
    expect(ids).toContain('m:3');
    expect(ids.some((id) => id.startsWith('a:'))).toBe(true);
  });
  it('đổi ngón trên cùng phím và đổi vị trí cùng ngón', () => {
    const l = exerciseById('tech-l3-substitute-rh')!.lesson;
    const seq = handSequences(l).right;
    expect(moveKind(seq[2], seq[3])).toBe('substitution');
    expect(transitionRefIds(l)).toContain('m:3');
  });
  it('mẫu 5 ngón không có chuyển ngón', () => {
    expect(transitionRefIds(exerciseById('tech-l1-5f-updown-rh')!.lesson)).toEqual([]);
  });
  it('mẫu số ngón: phím đen vẽ số ngón khoanh tròn, mẫu sai báo lỗi', () => {
    expect(pattern(RH_C, '1 2/h | R/q')).toBe('C4:1 D4/h:2 | R/q');
    expect(exerciseById('tech-l3-black-d-rh')!.lesson.notes[2].fingerCircled).toBe(true);
    expect(() => pattern(RH_C, '6')).toThrow();
  });
});
