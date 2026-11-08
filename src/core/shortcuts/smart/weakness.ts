/**
 * Quy tắc "Luyện lại điểm yếu" (đặc tả 2.2) — CHỈ khi có đủ dữ liệu; không đủ thì không đề xuất gì (không suy đoán,
 * không tạo số liệu). Nguồn:
 *  - Nốt hay sai ở màn Luyện tập: `PracticeSession.noteTallies` của 20 phiên gần nhất (như đánh giá hồ sơ).
 *  - Nốt hay nhầm / lỡ ở bài tập giáo trình: `LessonRecord.mistakes` ("note:F4>G4", "miss:F4") của buổi luyện ≤ 30 ngày.
 *  - Bài Thư viện tỉ lệ nốt đúng thấp qua nhiều phiên.
 *  - Đọc nốt chậm: thời gian tới lần đánh đầu tiên (chế độ Chờ / Đếm nốt) so với mục tiêu theo tuổi.
 *  - "5 ngón · 8 nốt": tỉ lệ nốt đúng từng tay.
 * KHÔNG có quy tắc "sai ngón": micro / đàn MIDI không biết người học dùng ngón nào (fiveFinger/stats.ts chỉ có ngón
 * ĐƯỢC HƯỚNG DẪN) → không có dữ liệu đáng tin cậy.
 */
import { LETTERS, type Letter } from '../../balloonPop/notes';
import { handAccuracy } from '../../fiveFinger/stats';
import type { Lesson } from '../../lessons/types';
import { midiToLabel, midiToPitchClass, nameToMidi } from '../../music/notes';
import { mergeNoteTallies } from '../../practice/NoteStats';
import { targetReadingMs } from '../../profile/assessment';
import type { BalloonPreset, ShortcutTarget } from '../types';
import { bonus, cmp, DAY_MS, pct, seconds, type SmartInput } from './context';
import { BASE_SCORE, MAX_BONUS, type SmartDraft, type SmartEvidence } from './types';

/** Ngưỡng "đủ dữ liệu" — chỉnh ở đây, test bám theo các hằng số này. */
export const WEAKNESS_RULES = {
  /** Cửa sổ phiên Luyện tập (như "Nốt hay sai" ở đánh giá hồ sơ). */
  noteWindowSessions: 20,
  /** Tổng lượt nốt tối thiểu trong cửa sổ. */
  minTotalNoteAttempts: 20,
  /** Mỗi nốt: tối thiểu số lượt, số lần sai và tỉ lệ sai. */
  minNoteAttempts: 6,
  minNoteMisses: 3,
  minMissRate: 0.25,
  /** Lỗi bài tập giáo trình: chỉ tính buổi luyện trong chừng này ngày, tối thiểu số lần cùng một nốt. */
  curriculumWindowDays: 30,
  minCurriculumMistakes: 5,
  /** Bài Thư viện: tỉ lệ đúng dưới ngưỡng sau ≥ 2 phiên, ≥ 30 nốt, luyện trong 30 ngày. */
  lowAccuracy: 0.7,
  minLessonSessions: 2,
  minLessonNotes: 30,
  lessonWindowDays: 30,
  /** Đọc nốt chậm: ≥ 1,5 × mục tiêu theo tuổi, tính trên ≥ 20 nốt có đo của 10 phiên gần nhất. */
  slowReadingFactor: 1.5,
  minReadingNotes: 20,
  /** 5 ngón: ≥ 40 nốt của tay đó, đúng < 75%. */
  fiveFingerMinNotes: 40,
  fiveFingerLowAccuracy: 0.75,
} as const;

const W = WEAKNESS_RULES;
const WHITE_LETTER: Record<number, Letter> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
const FIVE_FINGER_LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G'];

/** Tên nốt không kèm quãng tám ("Fa", "F#") theo kiểu tên người dùng chọn. */
export function noteWord(midi: number, input: Pick<SmartInput, 'labelStyle'>): string {
  return midiToLabel(midi, input.labelStyle).replace(/-?\d+$/, '');
}

/**
 * Bóng bay kiểu "Tìm nốt" một nốt, bóng hiện HÌNH nốt trên khuông, mức Dễ — cùng cấu hình nút "Tìm nốt" của bài
 * "Làm quen từng nốt" (`components/curriculum/SupplementGames`). La / Si cần chế độ 7 nốt (5 nốt chỉ Đô → Sol).
 */
export function findNotePreset(letter: Letter, midi: number, labelStyle: SmartInput['labelStyle']): BalloonPreset {
  const bass = midi < 60;
  return {
    game: 'hunt',
    huntLetters: [letter],
    mode: FIVE_FINGER_LETTERS.includes(letter) ? 'one-hand' : 'seven',
    hand: bass ? 'left' : 'right',
    difficulty: 'easy',
    display: 'staff',
    staffClef: bass ? 'bass' : 'treble',
    labelStyle,
  };
}

/** Bài Thư viện vừa sức có nốt đó nhiều nhất (≥ 2 lần) — đích luyện nốt khi trò chơi đang khoá / nốt đen. */
function lessonWithNote(input: SmartInput, midi: number): Lesson | undefined {
  let best: { lesson: Lesson; count: number } | undefined;
  for (const lesson of input.library) {
    if (lesson.repertoire || lesson.difficulty > 2) continue;
    const count = lesson.notes.filter((n) => n.midi === midi).length;
    if (count >= 2 && (!best || count > best.count || (count === best.count && lesson.difficulty < best.lesson.difficulty))) best = { lesson, count };
  }
  return best?.lesson;
}

/** Đích luyện một nốt: Bóng bay "Tìm nốt" (phím trắng, còn giờ chơi), không thì bài Thư viện có nốt đó. */
function noteTarget(input: SmartInput, midi: number): ShortcutTarget | null {
  const letter = WHITE_LETTER[midiToPitchClass(midi)];
  if (letter && LETTERS.includes(letter) && input.gameTimeRemainingMs > 0) {
    return { type: 'game', id: 'balloon-pop', params: { preset: findNotePreset(letter, midi, input.labelStyle) } };
  }
  const lesson = lessonWithNote(input, midi);
  return lesson ? { type: 'practice', id: lesson.id } : null;
}

function noteDraft(input: SmartInput, midi: number, reason: string, evidence: SmartEvidence, score: number): SmartDraft | null {
  const target = noteTarget(input, midi);
  if (!target) return null;
  return { type: 'weakness', target, label: `Luyện lại nốt ${noteWord(midi, input)}`, icon: '🎯', reason, evidence, score };
}

/** Nốt hay sai ở màn Luyện tập (đúng / sai theo từng nốt cần đánh). */
function troubleNoteDrafts(input: SmartInput): SmartDraft[] {
  const recent = [...input.sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-W.noteWindowSessions)
    .filter((s) => (s.noteTallies?.length ?? 0) > 0);
  const tallies = mergeNoteTallies(recent.map((s) => s.noteTallies));
  const total = tallies.reduce((a, t) => a + t.hits + t.misses, 0);
  if (total < W.minTotalNoteAttempts) return [];
  return tallies
    .map((t) => ({ t, attempts: t.hits + t.misses }))
    .filter(({ t, attempts }) => attempts >= W.minNoteAttempts && t.misses >= W.minNoteMisses && t.misses / attempts >= W.minMissRate)
    .sort((a, b) => b.t.misses - a.t.misses || b.t.misses / b.attempts - a.t.misses / a.attempts || a.t.midi - b.t.midi)
    .slice(0, 2)
    .map(({ t, attempts }) => {
      const top = Object.entries(t.confusions).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0];
      const confusedWith = top ? Number(top[0]) : null;
      const rate = t.misses / attempts;
      const confusion = confusedWith !== null && Number.isFinite(confusedWith) ? ` · hay nhầm thành ${midiToLabel(confusedWith, input.labelStyle)}` : '';
      return noteDraft(
        input,
        t.midi,
        `${midiToLabel(t.midi, input.labelStyle)} sai ${t.misses}/${attempts} lần (${pct(rate)}) ở ${recent.length} lần tập gần đây${confusion}`,
        { kind: 'trouble-note', midi: t.midi, attempts, misses: t.misses, sessions: recent.length, confusedWith: confusedWith !== null && Number.isFinite(confusedWith) ? confusedWith : null },
        BASE_SCORE.weakness + bonus((rate - W.minMissRate) * 20, MAX_BONUS.weakness),
      );
    })
    .filter((d): d is SmartDraft => !!d);
}

/** Nốt hay nhầm / lỡ trong bài tập giáo trình (khoá lỗi `note:<cần>><đánh>`, `miss:<cần>`). */
function curriculumMistakeDrafts(input: SmartInput): SmartDraft[] {
  const since = input.now - W.curriculumWindowDays * DAY_MS;
  const byPitch = new Map<string, { count: number; lessons: Set<string> }>();
  for (const rec of Object.values(input.records)) {
    if (!rec || rec.lastPracticedAt < since) continue;
    for (const [key, n] of Object.entries(rec.mistakes)) {
      const m = /^note:([^>]+)>/.exec(key) ?? /^miss:(.+)$/.exec(key);
      if (!m) continue;
      const e = byPitch.get(m[1]) ?? { count: 0, lessons: new Set<string>() };
      e.count += n;
      e.lessons.add(rec.lessonId);
      byPitch.set(m[1], e);
    }
  }
  const out: SmartDraft[] = [];
  const ranked = [...byPitch.entries()].filter(([, e]) => e.count >= W.minCurriculumMistakes).sort((a, b) => b[1].count - a[1].count || cmp(a[0], b[0]));
  for (const [pitch, e] of ranked.slice(0, 2)) {
    const midi = nameToMidi(pitch);
    if (midi === null) continue;
    const d = noteDraft(
      input,
      midi,
      `Nhầm hoặc lỡ nốt ${midiToLabel(midi, input.labelStyle)} ${e.count} lần ở ${e.lessons.size} buổi học gần đây`,
      { kind: 'curriculum-confusion', pitch, count: e.count, lessons: e.lessons.size },
      BASE_SCORE.weakness + bonus((e.count - W.minCurriculumMistakes) / 2, MAX_BONUS.weakness),
    );
    if (d) out.push(d);
  }
  return out;
}

/** Bài Thư viện độ chính xác thấp qua nhiều phiên (cả bài, không tính tập riêng tay / đoạn). */
function lowAccuracyDrafts(input: SmartInput): SmartDraft[] {
  const since = input.now - W.lessonWindowDays * DAY_MS;
  const agg = new Map<string, { sessions: number; correct: number; wrong: number; last: number }>();
  for (const s of input.sessions) {
    if (s.hand || s.measures) continue;
    const a = agg.get(s.lessonId) ?? { sessions: 0, correct: 0, wrong: 0, last: 0 };
    a.sessions += 1;
    a.correct += s.correct;
    a.wrong += s.wrong;
    a.last = Math.max(a.last, s.startedAt);
    agg.set(s.lessonId, a);
  }
  return [...agg.entries()]
    .map(([lessonId, a]) => ({ lessonId, ...a, notes: a.correct + a.wrong, accuracy: a.correct + a.wrong > 0 ? a.correct / (a.correct + a.wrong) : 1 }))
    .filter((a) => a.sessions >= W.minLessonSessions && a.notes >= W.minLessonNotes && a.accuracy < W.lowAccuracy && a.last >= since && input.library.some((l) => l.id === a.lessonId))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy || cmp(a.lessonId, b.lessonId))
    .slice(0, 1)
    .map((a) => ({
      type: 'weakness' as const,
      target: { type: 'practice' as const, id: a.lessonId },
      verb: 'Luyện lại',
      icon: '🎯',
      reason: `Đúng ${pct(a.accuracy)} nốt sau ${a.sessions} lần tập`,
      evidence: { kind: 'low-accuracy' as const, lessonId: a.lessonId, accuracy: a.accuracy, sessions: a.sessions, notes: a.notes },
      score: BASE_SCORE.weakness + bonus((W.lowAccuracy - a.accuracy) * 20, MAX_BONUS.weakness),
    }));
}

/** Đọc nốt chậm so với mục tiêu theo tuổi → Flappy Note (đọc nhanh), trò khoá thì bài "Nhận biết nốt". */
function slowReadingDrafts(input: SmartInput): SmartDraft[] {
  if (!input.profile) return [];
  const timed = [...input.sessions]
    .filter((s) => (s.reading?.count ?? 0) > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-10);
  const count = timed.reduce((a, s) => a + (s.reading?.count ?? 0), 0);
  if (count < W.minReadingNotes) return [];
  const avgMs = timed.reduce((a, s) => a + (s.reading?.totalMs ?? 0), 0) / count;
  const targetMs = targetReadingMs(input.profile.age);
  if (avgMs < targetMs * W.slowReadingFactor) return [];
  const notesLesson = input.library.find((l) => l.category === 'notes' && l.difficulty === 1);
  const target: ShortcutTarget | null = input.gameTimeRemainingMs > 0 ? { type: 'game', id: 'flappy-note' } : notesLesson ? { type: 'practice', id: notesLesson.id } : null;
  if (!target) return [];
  return [
    {
      type: 'weakness',
      target,
      label: 'Luyện đọc nốt nhanh',
      icon: '⏱️',
      reason: `Trung bình ${seconds(avgMs)} giây/nốt (mục tiêu ≤ ${seconds(targetMs)} giây)`,
      evidence: { kind: 'slow-reading', avgMs, targetMs, notes: count },
      score: BASE_SCORE.weakness + bonus((avgMs / targetMs - W.slowReadingFactor) * 4, MAX_BONUS.weakness),
    },
  ];
}

/** "5 ngón · 8 nốt": tay có tỉ lệ nốt đúng thấp (không kết luận về ngón — chỉ có ngón được hướng dẫn). */
function fiveFingerDrafts(input: SmartInput): SmartDraft[] {
  const stats = input.fiveFinger;
  if (!stats) return [];
  const weak = (['right', 'left'] as const)
    .map((hand) => ({ hand, h: stats.hands[hand], accuracy: handAccuracy(stats.hands[hand]) }))
    .filter((x) => x.accuracy !== null && x.h.correct + x.h.wrong >= W.fiveFingerMinNotes && x.accuracy < W.fiveFingerLowAccuracy)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
  const x = weak[0];
  if (!x || x.accuracy === null) return [];
  return [
    {
      type: 'weakness',
      target: { type: 'page', id: 'five-finger' },
      label: `Luyện 5 ngón tay ${x.hand === 'left' ? 'trái' : 'phải'}`,
      icon: '🖐️',
      reason: `Tay ${x.hand === 'left' ? 'trái' : 'phải'} đúng ${pct(x.accuracy)} nốt ở ${x.h.chains} chuỗi đã luyện`,
      evidence: { kind: 'five-finger-hand', hand: x.hand, accuracy: x.accuracy, notes: x.h.correct + x.h.wrong },
      score: BASE_SCORE.weakness + bonus((W.fiveFingerLowAccuracy - x.accuracy) * 20, MAX_BONUS.weakness),
    },
  ];
}

export function weaknessDrafts(input: SmartInput): SmartDraft[] {
  return [...troubleNoteDrafts(input), ...curriculumMistakeDrafts(input), ...lowAccuracyDrafts(input), ...slowReadingDrafts(input), ...fiveFingerDrafts(input)];
}
