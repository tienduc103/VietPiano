import { describe, expect, it } from 'vitest';
import { lessonManager } from '../lessons/LessonManager';
import { CURRICULUM } from './content/curriculum';
import { LEVEL1_LESSONS, LEVEL1_WEEKS } from './content/level1';
import { LEVEL2_LESSONS, LEVEL2_WEEKS } from './content/level2';
import { LEVEL3_LESSONS, LEVEL3_WEEKS } from './content/level3';
import { LEVEL4_LESSONS, LEVEL4_WEEKS } from './content/level4';
import { LEVEL5_LESSONS, LEVEL5_WEEKS } from './content/level5';
import { LEVEL6_LESSONS, LEVEL6_WEEKS } from './content/level6';
import { keysMatching } from './keys';
import { lessonTimeline, pieceToLesson } from './piece';
import { orderedLessons } from './unlock';
import { validateCurriculum, validatePiece } from './validate';
import type { Curriculum, CurriculumLesson, Piece, PlayExercise } from './types';

describe('nội dung giáo trình', () => {
  it('toàn bộ giáo trình hợp lệ (đủ phách, tầm nốt, tiên quyết, đáp án…)', () => {
    expect(validateCurriculum(CURRICULUM)).toEqual([]);
  });

  it('có 6 cấp độ, cấp nào cũng đã có nội dung', () => {
    expect(CURRICULUM.levels.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CURRICULUM.levels.map((l) => l.availability)).toEqual(Array(6).fill('available'));
  });

  it('cấp 1: 4 tuần × 5 buổi, số buổi 1–20 theo đúng thứ tự', () => {
    expect(LEVEL1_WEEKS).toHaveLength(4);
    LEVEL1_WEEKS.forEach((w) => expect(w.lessonIds).toHaveLength(5));
    const ordered = orderedLessons(CURRICULUM.levels[0]);
    expect(ordered.map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL1_LESSONS).toHaveLength(20);
  });

  it('buổi 5, 10, 15, 20 là buổi kiểm tra, cần 80 điểm', () => {
    for (const n of [5, 10, 15, 20]) {
      const l = LEVEL1_LESSONS.find((x) => x.number === n)!;
      expect(l.assessment).toEqual({ passScore: 80, checkpoint: true });
    }
  });

  it('mỗi buổi (trừ buổi 1) cần buổi liền trước', () => {
    const ordered = orderedLessons(CURRICULUM.levels[0]);
    ordered.forEach((l, i) => expect(l.prerequisites).toEqual(i === 0 ? [] : [ordered[i - 1].lessonId]));
  });

  it('đúng yêu cầu từng buổi: kiểm tra 5 lượt đúng ≥ 4, tìm C ≥ 80%, Đô–Rê–Mi ≥ 85%', () => {
    const ex = (lesson: string, id: string) => LEVEL1_LESSONS.find((l) => l.lessonId === lesson)!.exercises.find((e) => e.id === id)!;
    const b1 = ex('l1-01-keyboard', 'test');
    expect(b1.kind === 'key-quiz' && b1.rounds.length).toBe(5);
    expect(b1.pass.minCorrect).toBe(4);
    expect(ex('l1-02-find-c', 'test').pass.minAccuracy).toBe(0.8);
    expect(ex('l1-04-cde', 'test').pass.minAccuracy).toBe(0.85);
  });

  it('tuần 3 có dấu lặng đen; bài biểu diễn dùng ngưỡng đạt chuẩn (80 điểm, 80% nốt, 90% hoàn thành)', () => {
    const rest = LEVEL1_LESSONS.find((l) => l.lessonId === 'l1-14-rest')!;
    const pieces = rest.exercises.filter((e): e is PlayExercise => e.kind === 'play');
    expect(pieces.every((p) => pieceToLesson(p.piece, 'x').notes.some((n) => n.rest))).toBe(true);
    for (const l of LEVEL1_LESSONS) {
      for (const e of l.exercises) {
        if (e.kind === 'play' && e.mode === 'performance') expect(e.pass).toEqual({ minScore: 80, minAccuracy: 0.8, minCompletion: 0.9 });
      }
    }
  });

  it('tuần 4 có tay trái C3–G3 và bài 4, 8 ô nhịp', () => {
    const lhLesson = LEVEL1_LESSONS.find((l) => l.number === 16)!;
    const lhMidis = lhLesson.exercises
      .filter((e): e is PlayExercise => e.kind === 'play')
      .flatMap((e) => pieceToLesson(e.piece, 'x').notes.map((n) => n.midi));
    expect(Math.min(...lhMidis)).toBe(48);
    expect(Math.max(...lhMidis)).toBe(55);
    const measures = (n: number) => {
      const p = LEVEL1_LESSONS.find((l) => l.number === n)!.exercises.find((e): e is PlayExercise => e.kind === 'play')!;
      return Math.max(...lessonTimeline(pieceToLesson(p.piece, 'x')).map((t) => t.measureIndex)) + 1;
    };
    expect(measures(18)).toBe(4);
    expect(measures(19)).toBe(8);
  });

  it('mọi bản nhạc ghi nguồn gốc (tự soạn)', () => {
    for (const l of LEVEL1_LESSONS) for (const e of l.exercises) if (e.kind === 'play') expect(e.piece.source).toBeTruthy();
  });

  it('bài luyện thêm (gộp từ khoá học cũ) trỏ tới bài có trong thư viện', () => {
    const extras = LEVEL1_WEEKS.flatMap((w) => w.extraPractice ?? []);
    expect(extras.length).toBe(12);
    for (const e of extras) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });

  it('mọi lượt tìm phím có ít nhất một phím đúng', () => {
    for (const l of LEVEL1_LESSONS)
      for (const e of l.exercises)
        if (e.kind === 'key-quiz') for (const r of e.rounds) expect(keysMatching(r.target, e.keyboard.from, e.keyboard.to).length).toBeGreaterThan(0);
  });
});

describe('thứ tự kiến thức', () => {
  /** Ký hiệu đọc được trên khuông: trường độ ("q", "Rh"…) và cao độ theo khoá ("treble:C4", "bass:G2"). */
  const symbols = (p: Piece): string[] => {
    const l = pieceToLesson(p, 'x');
    const out = l.notes.map((n) => `${n.rest ? 'R' : ''}${n.duration}`);
    for (const n of l.notes) if (!n.rest) out.push(`${(p.hand === 'both' ? n.hand : p.hand) === 'left' ? 'bass' : 'treble'}:${n.pitch}`);
    for (const c of l.accompaniment ?? []) out.push(c.duration, ...c.pitches.map((q) => `bass:${q}`));
    return out;
  };
  const pieceKey = (p: Piece) => `${p.notation}|${p.accompaniment ?? ''}`;
  /** Trang giới thiệu có khuông nhạc — trừ trang "Nghe mẫu" của chính bản nhạc trong bài tập (nghe thôi chưa phải học). */
  const introSymbols = (l: CurriculumLesson) => {
    const played = new Set(l.exercises.flatMap((e) => (e.kind === 'play' ? [pieceKey(e.piece)] : [])));
    return l.activities.flatMap((a) =>
      a.pages.flatMap((p) => (p.illustration && 'piece' in p.illustration && !played.has(pieceKey(p.illustration.piece)) ? symbols(p.illustration.piece) : [])),
    );
  };
  const exerciseSymbols = (l: CurriculumLesson) =>
    l.exercises.flatMap((e) => (e.kind === 'play' ? symbols(e.piece) : e.kind === 'note-reading' ? e.sequence.map((s) => `${e.clef}:${s}`) : []));
  /**
   * Ngoại lệ có chủ đích: buổi 3–4 cấp 1 chơi theo số ngón ở Wait Mode trước khi học khuông (tuần 2)
   * và trường độ (tuần 3) — Wait Mode không chấm nhịp.
   */
  const ALLOWED: Record<string, string[]> = { 'l1-03-fingers': ['q', 'h', 'treble:C4', 'treble:D4', 'treble:E4'], 'l1-04-cde': ['w'] };

  it('trường độ và nốt mới được giới thiệu (trang giới thiệu hoặc buổi trước) trước khi dùng trong bài tập', () => {
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const level of CURRICULUM.levels)
      for (const l of orderedLessons(level)) {
        const known = new Set([...seen, ...introSymbols(l), ...(ALLOWED[l.lessonId] ?? [])]);
        for (const s of new Set(exerciseSymbols(l))) if (!known.has(s)) missing.push(`${l.lessonId}: ${s}`);
        for (const s of [...introSymbols(l), ...exerciseSymbols(l)]) seen.add(s);
      }
    expect(missing).toEqual([]);
  });
});

describe('nội dung cấp 2', () => {
  const plays = (id: string) => LEVEL2_LESSONS.find((l) => l.lessonId === id)!.exercises.filter((e): e is PlayExercise => e.kind === 'play');
  const midis = (id: string) => plays(id).flatMap((e) => pieceToLesson(e.piece, 'x').notes.filter((n) => !n.rest).map((n) => n.midi));

  it('4 tuần × 5 buổi, số buổi 1–20, buổi đầu cần buổi cuối cấp 1', () => {
    expect(LEVEL2_WEEKS.map((w) => w.lessonIds.length)).toEqual([5, 5, 5, 5]);
    expect(orderedLessons(CURRICULUM.levels[1]).map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL2_LESSONS[0].prerequisites).toEqual(['l1-20-final']);
    for (const n of [5, 10, 15, 20]) expect(LEVEL2_LESSONS.find((l) => l.number === n)!.assessment).toEqual({ passScore: 80, checkpoint: true });
  });

  it('thế tay Sol tay phải G4–D5, tay trái thế Sol G2–D3', () => {
    expect([Math.min(...midis('l2-03-c5-d5')), Math.max(...midis('l2-03-c5-d5'))]).toEqual([67, 74]);
    expect([Math.min(...midis('l2-07-lh-g-position')), Math.max(...midis('l2-07-lh-g-position'))]).toEqual([43, 50]);
  });

  it('tuần 3 dùng nhịp 3/4, có nốt trắng chấm dôi và dấu lặng trắng', () => {
    const w3 = LEVEL2_WEEKS[2].lessonIds.flatMap(plays);
    expect(w3.some((e) => e.piece.timeSignature?.[0] === 3)).toBe(true);
    const notes = w3.flatMap((e) => pieceToLesson(e.piece, 'x').notes);
    expect(notes.some((n) => n.duration === 'hd' && !n.rest)).toBe(true);
    expect(notes.some((n) => n.duration === 'h' && n.rest)).toBe(true);
  });

  it('bài luyện thêm trỏ tới bài có trong thư viện', () => {
    for (const e of LEVEL2_WEEKS.flatMap((w) => w.extraPractice ?? [])) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });
});

describe('nội dung cấp 3', () => {
  const plays = (id: string) => LEVEL3_LESSONS.find((l) => l.lessonId === id)!.exercises.filter((e): e is PlayExercise => e.kind === 'play');
  const notesOf = (ids: string[]) => ids.flatMap(plays).flatMap((e) => pieceToLesson(e.piece, 'x').notes);

  it('4 tuần × 5 buổi, số buổi 1–20, buổi đầu cần buổi cuối cấp 2, kiểm tra ở buổi 5/10/15/20', () => {
    expect(LEVEL3_WEEKS.map((w) => w.lessonIds.length)).toEqual([5, 5, 5, 5]);
    expect(orderedLessons(CURRICULUM.levels[2]).map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL3_LESSONS[0].prerequisites).toEqual(['l2-20-final']);
    for (const n of [5, 10, 15, 20]) expect(LEVEL3_LESSONS.find((l) => l.number === n)!.assessment).toEqual({ passScore: 80, checkpoint: true });
  });

  it('tuần 1 có móc đơn và lặng móc đơn; tuần 2 có đen chấm dôi (cả nhịp 3/4)', () => {
    const w1 = notesOf(LEVEL3_WEEKS[0].lessonIds);
    expect(w1.some((n) => n.duration === '8' && !n.rest)).toBe(true);
    expect(w1.some((n) => n.duration === '8' && n.rest)).toBe(true);
    const w2 = LEVEL3_WEEKS[1].lessonIds.flatMap(plays);
    expect(w2.some((e) => e.piece.timeSignature?.[0] === 3 && pieceToLesson(e.piece, 'x').notes.some((n) => n.duration === 'qd'))).toBe(true);
  });

  it('bài móc đơn để chậm (≤ 66 BPM) — micro kịp nhận từng tiếng gõ', () => {
    for (const l of LEVEL3_LESSONS)
      for (const e of l.exercises)
        if (e.kind === 'play' && pieceToLesson(e.piece, 'x').notes.some((n) => n.duration === '8')) expect(e.piece.bpm, `${l.lessonId}/${e.id}`).toBeLessThanOrEqual(66);
  });

  it('giai điệu móc đơn không lặp cùng một nốt liền nhau (micro cần tiếng gõ mới) — trừ bài tiết tấu', () => {
    for (const l of LEVEL3_LESSONS)
      for (const e of l.exercises) {
        if (e.kind !== 'play' || e.mode === 'rhythm') continue;
        const ns = pieceToLesson(e.piece, 'x').notes.filter((n) => !n.rest);
        for (let i = 1; i < ns.length; i++) expect(ns[i].midi === ns[i - 1].midi && (ns[i].duration === '8' || ns[i - 1].duration === '8'), `${l.lessonId}/${e.id} nốt ${i}`).toBe(false);
      }
  });

  it('bài luyện thêm trỏ tới bài có trong thư viện', () => {
    for (const e of LEVEL3_WEEKS.flatMap((w) => w.extraPractice ?? [])) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });
});

describe('nội dung cấp 4', () => {
  const plays = (id: string) => LEVEL4_LESSONS.find((l) => l.lessonId === id)!.exercises.filter((e): e is PlayExercise => e.kind === 'play');

  it('4 tuần × 5 buổi, số buổi 1–20, buổi đầu cần buổi cuối cấp 3, kiểm tra ở buổi 5/10/15/20', () => {
    expect(LEVEL4_WEEKS.map((w) => w.lessonIds.length)).toEqual([5, 5, 5, 5]);
    expect(orderedLessons(CURRICULUM.levels[3]).map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL4_LESSONS[0].prerequisites).toEqual(['l3-20-final']);
    for (const n of [5, 10, 15, 20]) expect(LEVEL4_LESSONS.find((l) => l.number === n)!.assessment).toEqual({ passScore: 80, checkpoint: true });
  });

  it('bài có hoá biểu chỉ dùng đúng dấu hoá của giọng (Sol trưởng: F♯; Fa trưởng: B♭)', () => {
    const allowed = { G: /^(?:[A-EG]\d|F#\d)$/, F: /^(?:[AC-G]\d|Bb\d)$/ } as const;
    for (const l of LEVEL4_LESSONS)
      for (const e of l.exercises) {
        const key = e.kind === 'play' ? e.piece.keySignature : e.kind === 'note-reading' ? e.keySignature : undefined;
        if (key !== 'G' && key !== 'F') continue;
        const pitches = e.kind === 'play' ? pieceToLesson(e.piece, 'x').notes.filter((n) => !n.rest).map((n) => n.pitch) : e.kind === 'note-reading' ? e.sequence : [];
        for (const p of pitches) expect(p, `${l.lessonId}/${e.id}`).toMatch(allowed[key]);
      }
  });

  it('tuần 1 có Fa thăng, tuần 2 có Si giáng; mọi giọng Sol / Fa trưởng đều có hoá biểu', () => {
    const pitches = (ids: string[]) => ids.flatMap(plays).flatMap((e) => pieceToLesson(e.piece, 'x').notes.map((n) => n.pitch));
    expect(pitches(LEVEL4_WEEKS[0].lessonIds)).toContain('F#4');
    expect(pitches(LEVEL4_WEEKS[1].lessonIds)).toContain('Bb4');
    expect(plays('l4-13-pine-hill').every((e) => e.piece.keySignature === 'G')).toBe(true);
    expect(plays('l4-17-evening').every((e) => e.piece.keySignature === 'F' && e.piece.timeSignature?.[0] === 3)).toBe(true);
  });

  it('bài luyện thêm trỏ tới bài có trong thư viện', () => {
    for (const e of LEVEL4_WEEKS.flatMap((w) => w.extraPractice ?? [])) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });
});

describe('nội dung cấp 5', () => {
  const plays = LEVEL5_LESSONS.flatMap((l) => l.exercises.filter((e): e is PlayExercise => e.kind === 'play').map((e) => ({ l, e })));

  it('4 tuần × 5 buổi, số buổi 1–20, buổi đầu cần buổi cuối cấp 4, kiểm tra ở buổi 5/10/15/20', () => {
    expect(LEVEL5_WEEKS.map((w) => w.lessonIds.length)).toEqual([5, 5, 5, 5]);
    expect(orderedLessons(CURRICULUM.levels[4]).map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL5_LESSONS[0].prerequisites).toEqual(['l4-20-final']);
    for (const n of [5, 10, 15, 20]) expect(LEVEL5_LESSONS.find((l) => l.number === n)!.assessment).toEqual({ passScore: 80, checkpoint: true });
  });

  it('mọi buổi có bài hai tay CÙNG LÚC (phần đệm) và nhắc rằng app chỉ chấm tay phải', () => {
    for (const l of LEVEL5_LESSONS) {
      expect(plays.some((x) => x.l === l && x.e.piece.accompaniment), l.lessonId).toBe(true);
      expect(l.notes?.some((n) => String(n).includes('chỉ chấm giai điệu tay phải')), l.lessonId).toBe(true);
    }
  });

  it('có hợp âm khối (≥ 3 nốt), đệm valse 3/4 và hợp âm rải', () => {
    const acc = plays.filter((x) => x.e.piece.accompaniment).map((x) => pieceToLesson(x.e.piece, 'x'));
    expect(acc.some((les) => les.accompaniment!.some((c) => c.midis.length >= 3))).toBe(true);
    expect(acc.some((les) => les.timeSignature[0] === 3)).toBe(true);
    expect(acc.some((les) => les.accompaniment!.filter((c) => c.midis.length === 1 && c.duration === 'q').length >= 8)).toBe(true);
  });

  it('bài luyện thêm trỏ tới bài có trong thư viện', () => {
    for (const e of LEVEL5_WEEKS.flatMap((w) => w.extraPractice ?? [])) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });
});

describe('nội dung cấp 6', () => {
  const plays = LEVEL6_LESSONS.flatMap((l) => l.exercises.filter((e): e is PlayExercise => e.kind === 'play').map((e) => ({ l, e })));

  it('4 tuần × 5 buổi, số buổi 1–20, buổi đầu cần buổi cuối cấp 5, kiểm tra ở buổi 5/10/15/20', () => {
    expect(LEVEL6_WEEKS.map((w) => w.lessonIds.length)).toEqual([5, 5, 5, 5]);
    expect(orderedLessons(CURRICULUM.levels[5]).map((l) => l.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(LEVEL6_LESSONS[0].prerequisites).toEqual(['l5-20-final']);
    for (const n of [5, 10, 15, 20]) expect(LEVEL6_LESSONS.find((l) => l.number === n)!.assessment).toEqual({ passScore: 80, checkpoint: true });
  });

  it('mọi bài biểu diễn có dấu sắc thái (≥ 2 mức) và mọi buổi nhắc cách app chấm mạnh – nhẹ', () => {
    for (const { l, e } of plays) if (e.mode === 'performance') expect(new Set(Object.values(e.piece.dynamics ?? {})).size, `${l.lessonId}/${e.id}`).toBeGreaterThanOrEqual(2);
    for (const l of LEVEL6_LESSONS) expect(l.notes?.some((n) => String(n).includes('Mạnh – nhẹ')), l.lessonId).toBe(true);
  });

  it('đủ bốn mức p / mp / mf / f; có hình thức A – B – A; có bài phạm vi công cộng ghi nguồn', () => {
    const marks = new Set(plays.flatMap((x) => Object.values(x.e.piece.dynamics ?? {})));
    for (const m of ['p', 'mp', 'mf', 'f']) expect(marks.has(m as never), m).toBe(true);
    expect(plays.some((x) => x.e.piece.sections?.map((s) => s.label).join('') === 'ABA')).toBe(true);
    expect(plays.some((x) => x.e.piece.source?.includes('phạm vi công cộng'))).toBe(true);
  });

  it('bài có phần đệm thì buổi nhắc rằng app chỉ chấm tay phải', () => {
    for (const { l, e } of plays) if (e.piece.accompaniment) expect(l.notes?.some((n) => String(n).includes('chỉ chấm giai điệu tay phải')), l.lessonId).toBe(true);
  });

  it('bài móc đơn để chậm (≤ 66 BPM) và không lặp cùng nốt liền móc đơn', () => {
    for (const { l, e } of plays) {
      const notes = pieceToLesson(e.piece, 'x').notes;
      if (!notes.some((n) => n.duration === '8')) continue;
      expect(e.piece.bpm, l.lessonId).toBeLessThanOrEqual(66);
      notes.forEach((n, i) => {
        const prev = notes[i - 1];
        if (prev && !n.rest && !prev.rest && (n.duration === '8' || prev.duration === '8')) expect(n.midi, `${l.lessonId} nốt ${i}`).not.toBe(prev.midi);
      });
    }
  });

  it('phát mẫu theo sắc thái: nốt p nhẹ hơn nốt f', () => {
    const { e } = plays.find((x) => x.l.lessonId === 'l6-01-forte-piano' && x.e.mode === 'performance')!;
    const tl = lessonTimeline(pieceToLesson(e.piece, 'x'));
    expect(tl[0].dynamic).toBe('f');
    expect(tl[tl.length - 1].dynamic).toBe('p');
    expect(tl[0].velocity).toBeGreaterThan(tl[tl.length - 1].velocity);
  });

  it('bài luyện thêm trỏ tới bài có trong thư viện', () => {
    for (const e of LEVEL6_WEEKS.flatMap((w) => w.extraPractice ?? [])) expect(lessonManager.get(e.lessonId)).toBeDefined();
  });
});

describe('validateCurriculum bắt lỗi dữ liệu', () => {
  const base = (): Curriculum => structuredClone(CURRICULUM);

  it('ô nhịp thiếu phách, nốt ngoài tầm micro, ký hiệu sai, nhịp độ lạ', () => {
    const piece = { clef: 'treble' as const, hand: 'right' as const, bpm: 60 };
    expect(validatePiece({ ...piece, notation: 'C4 C4 C4' }, 'p')).toEqual(['p: ô nhịp 1 có 3 phách, cần 4']);
    expect(validatePiece({ ...piece, notation: 'C7/w' }, 'p')).toEqual(['p: nốt C7 ngoài tầm micro']);
    expect(validatePiece({ ...piece, notation: 'X9' }, 'p')[0]).toMatch(/ký hiệu lỗi/);
    expect(validatePiece({ ...piece, notation: 'C4/w', bpm: 500 }, 'p')[0]).toMatch(/nhịp độ/);
    expect(validatePiece({ ...piece, notation: 'R/w' }, 'p')).toEqual(['p: không có nốt nào để chơi']);
    expect(validatePiece({ ...piece, notation: 'C4 C4 C4/h', hand: 'both', clef: 'grand' }, 'p')[0]).toMatch(/RH\/LH/);
  });

  it('dấu sắc thái: ô nhịp phải có trong bài, cần ≥ 2 mức khác nhau; gắn vào nốt đầu ô', () => {
    const piece = { clef: 'treble' as const, hand: 'right' as const, bpm: 60, notation: 'C4/w | D4 E4 F4 G4' };
    expect(validatePiece({ ...piece, dynamics: { 1: 'p', 2: 'f' } }, 'p')).toEqual([]);
    expect(pieceToLesson({ ...piece, dynamics: { 2: 'f', 1: 'p' } }, 'x').dynamics).toEqual([
      { index: 0, mark: 'p' },
      { index: 1, mark: 'f' },
    ]);
    expect(validatePiece({ ...piece, dynamics: { 1: 'p', 3: 'f' } }, 'p')[0]).toMatch(/ô nhịp 3/);
    expect(validatePiece({ ...piece, dynamics: { 1: 'p', 2: 'p' } }, 'p')[0]).toMatch(/hai mức/);
  });

  it('phần đệm: khuông đôi + tay phải, đủ phách, cùng số ô, thấp hơn giai điệu', () => {
    const grand = { clef: 'grand' as const, hand: 'right' as const, bpm: 60, notation: 'E4 F4 G4/h | C4/w' };
    expect(validatePiece({ ...grand, accompaniment: 'C3+E3+G3/w | C3/w' }, 'p')).toEqual([]);
    expect(validatePiece({ ...grand, accompaniment: 'C3/w | C3/h' }, 'p')).toContain('p: phần đệm ô nhịp 2 có 2 phách, cần 4');
    expect(validatePiece({ ...grand, accompaniment: 'C3/w' }, 'p')).toContain('p: phần đệm có 1 ô nhịp, giai điệu có 2');
    expect(validatePiece({ ...grand, accompaniment: 'C3+E3+C4/w | C3/w' }, 'p')).toContain('p: nốt đệm C4 không thấp hơn giai điệu');
    expect(validatePiece({ ...grand, clef: 'treble', accompaniment: 'C3/w | C3/w' }, 'p')[0]).toMatch(/khuông đôi, giai điệu tay phải/);
  });

  it('tiên quyết đi sau / không tồn tại, buổi không thuộc tuần nào', () => {
    const c = base();
    const lessons = c.levels[0].lessons;
    lessons[0].prerequisites = [lessons[3].lessonId];
    lessons[1].unlockCriteria.lessonsPassed = ['khong-co'];
    c.levels[0].weeks[0].lessonIds = c.levels[0].weeks[0].lessonIds.filter((id) => id !== lessons[4].lessonId);
    const errors = validateCurriculum(c);
    expect(errors).toContain(`${lessons[0].lessonId}: tiên quyết ${lessons[3].lessonId} không đi trước`);
    expect(errors).toContain(`${lessons[1].lessonId}: tiên quyết không tồn tại khong-co`);
    expect(errors).toContain(`${lessons[4].lessonId}: không thuộc tuần nào`);
  });

  it('đáp án trắc nghiệm ngoài lựa chọn, nốt nhận diện không có trong lựa chọn', () => {
    const c = base();
    const l = c.levels[0].lessons.find((x) => x.lessonId === 'l1-03-fingers')!;
    const quiz = l.exercises.find((e) => e.kind === 'choice-quiz')!;
    if (quiz.kind === 'choice-quiz') quiz.questions[0].answer = 9;
    const reading = c.levels[0].lessons.find((x) => x.lessonId === 'l1-06-staff')!.exercises.find((e) => e.id === 'name')!;
    if (reading.kind === 'note-reading') reading.sequence.push('A4');
    const errors = validateCurriculum(c);
    expect(errors).toContain('l1-03-fingers/quiz: câu 1 đáp án ngoài lựa chọn');
    expect(errors).toContain('l1-06-staff/name: A4 không có trong lựa chọn');
  });
});
