/**
 * Integration: chạy buổi học thật của cấp 1 bằng chính các engine (QuizEngine, PracticeEngine,
 * PerformanceTracker) → chấm điểm → lưu tiến độ → khôi phục → buổi kế tiếp mở ra.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { midiToName, requireMidi } from '../music/notes';
import { PracticeEngine } from '../practice/PracticeEngine';
import { PerformanceTracker } from '../practice/PerformanceTracker';
import { IndexedDbCurriculumStorage } from '../storage/CurriculumStorage';
import { CURRICULUM } from './content/curriculum';
import { keysMatching } from './keys';
import { lessonTimeline, pieceToLesson, timedNotes } from './piece';
import { applyExerciseScore, applyLessonRun, emptyRecord, markActivitiesDone, type LessonRecord } from './progress';
import { QuizEngine } from './QuizEngine';
import { scoreLesson, scorePerformance, scoreQuiz, scoreRhythm, scoreWait, wrongNoteKey, type ExerciseScore } from './scoring';
import type { CurriculumLesson, Exercise } from './types';
import { findLesson, lessonStatus, nextLessonAfter } from './unlock';

const lesson = (id: string) => findLesson(CURRICULUM, id)!;

/** Người học "ảo": `wrongAt` = các lượt / nốt cố tình đánh sai. */
function runExercise(ex: Exercise, wrongAt: number[] = []): ExerciseScore {
  let t = 0;
  switch (ex.kind) {
    case 'key-quiz': {
      const q = new QuizEngine<number>(ex.rounds.map((r) => (m: number) => keysMatching(r.target, 0, 127).includes(m)), { retry: ex.retry });
      ex.rounds.forEach((r, i) => {
        const right = keysMatching(r.target, ex.keyboard.from, ex.keyboard.to);
        const wrong = Array.from({ length: 128 }, (_, m) => m).find((m) => !right.includes(m) && !keysMatching(r.target, 0, 127).includes(m))!;
        if (wrongAt.includes(i)) q.answer(wrong, (t += 1000));
        if (q.getState().status === 'active' && q.getState().index === i) q.answer(right[0], (t += 1000));
      });
      return scoreQuiz(ex, 'keyboard', { correct: q.getState().correct, rounds: q.rounds, answered: q.rounds, mistakes: [] });
    }
    case 'choice-quiz': {
      const q = new QuizEngine<number>(ex.questions.map((x) => (i: number) => i === x.answer), { minIntervalMs: 0 });
      ex.questions.forEach((x, i) => q.answer(wrongAt.includes(i) ? (x.answer + 1) % x.options.length : x.answer, (t += 1000)));
      return scoreQuiz(ex, 'theory', { correct: q.getState().correct, rounds: q.rounds, answered: q.rounds, mistakes: [] });
    }
    case 'note-reading': {
      const q = new QuizEngine<string>(ex.sequence.map((p) => (a: string) => a === p));
      ex.sequence.forEach((p, i) => q.answer(wrongAt.includes(i) ? midiToName(requireMidi(p) + 1) : p, (t += 1000)));
      return scoreQuiz(ex, 'recognition', { correct: q.getState().correct, rounds: q.rounds, answered: q.rounds, mistakes: [] });
    }
    case 'play': {
      const timeline = lessonTimeline(pieceToLesson(ex.piece, ex.id));
      const playable = timeline.filter((n) => n.midiNote !== null);
      if (ex.mode === 'wait') {
        const e = new PracticeEngine(playable.map((n) => n.midiNote!));
        const mistakes: string[] = [];
        playable.forEach((n, i) => {
          if (wrongAt.includes(i)) {
            e.handleNote(n.midiNote! + 1, (t += 1000));
            mistakes.push(wrongNoteKey(n.pitch, midiToName(n.midiNote! + 1)));
          }
          e.handleNote(n.midiNote!, (t += 1000));
        });
        const s = e.getState();
        return scoreWait(ex, { correct: s.correct, wrong: s.wrong, notes: playable.length, reached: playable.length, mistakes });
      }
      // Biểu diễn: gõ đúng phách (lệch 30 ms), thả phím sau 90% trường độ (như đàn MIDI).
      const tracker = new PerformanceTracker(timedNotes(timeline), { bpm: ex.piece.bpm, countInBeats: 4, checkPitch: ex.mode === 'performance' });
      const beatMs = 60000 / ex.piece.bpm;
      const origin = 4 * beatMs;
      tracker.start(0);
      playable.forEach((n, i) => {
        const on = origin + n.startBeat * beatMs + 30;
        const midi = wrongAt.includes(i) ? n.midiNote! + 1 : n.midiNote!;
        tracker.handleNoteOn(midi, on);
        tracker.handleNoteOff(midi, on + n.durationBeats * beatMs * 0.9);
      });
      tracker.tick(origin + (tracker.totalBeats + 1) * beatMs);
      expect(tracker.getState().status).toBe('finished');
      return ex.mode === 'performance' ? scorePerformance(ex, tracker.result(), []) : scoreRhythm(ex, tracker.result(), []);
    }
  }
}

function completeLesson(l: CurriculumLesson, rec: LessonRecord, wrong: Record<string, number[]> = {}): { rec: LessonRecord; scores: Record<string, ExerciseScore> } {
  let r = l.activities.length ? markActivitiesDone(rec, l, 1) : rec;
  const scores: Record<string, ExerciseScore> = {};
  for (const ex of l.exercises) {
    scores[ex.id] = runExercise(ex, wrong[ex.id]);
    r = applyExerciseScore(r, l, scores[ex.id], 60_000, 2);
  }
  r = applyLessonRun(r, scoreLesson(l, scores).score, 3);
  return { rec: r, scores };
}

describe('luồng học giáo trình (integration)', () => {
  it('chơi đúng hết → mọi buổi cấp 1 đều đạt (dữ liệu bài chơi được thật)', () => {
    for (const l of CURRICULUM.levels[0].lessons) {
      const { rec, scores } = completeLesson(l, emptyRecord('p', l));
      expect({ id: l.lessonId, passed: rec.passed }).toEqual({ id: l.lessonId, passed: true });
      for (const s of Object.values(scores)) expect(s.score).toBeGreaterThanOrEqual(90);
    }
  });

  it('buổi 1: sai 2/5 lượt kiểm tra → chưa đạt; luyện lại đúng 4/5 → đạt; buổi 2 mở ra', async () => {
    const storage = new IndexedDbCurriculumStorage(new IDBFactory());
    const b1 = lesson('l1-01-keyboard');
    const b2 = lesson('l1-02-find-c');

    const first = completeLesson(b1, emptyRecord('kid', b1), { test: [1, 3] });
    expect(first.scores.test.passed).toBe(false);
    expect(first.rec.passed).toBe(false);
    await storage.put(first.rec);

    // Tải lại trang: đọc lại từ IndexedDB, buổi 2 vẫn "nên học sau".
    let records = await storage.getAll('kid');
    expect(records[b1.lessonId].attempts).toBe(1);
    expect(lessonStatus(b1, records)).toBe('in-progress');
    expect(lessonStatus(b2, records)).toBe('suggest-later');

    const second = completeLesson(b1, records[b1.lessonId], { test: [2] });
    expect(second.scores.test).toMatchObject({ score: 80, passed: true });
    await storage.put(second.rec);

    records = await storage.getAll('kid');
    expect(records[b1.lessonId]).toMatchObject({ passed: true, attempts: 2, bestScore: 80, lastScore: 80 });
    expect(records[b1.lessonId].practiceMs).toBe(4 * 60_000);
    expect(lessonStatus(b1, records)).toBe('completed');
    expect(lessonStatus(b2, records)).toBe('available');
    expect(nextLessonAfter(CURRICULUM, b1.lessonId)?.lessonId).toBe(b2.lessonId);
  });

  it('buổi 4: Wait Mode cần ≥ 85% — 12 nốt sai 4 lần (75%) chưa đạt, sai 2 lần (86%) đạt', () => {
    const b4 = lesson('l1-04-cde');
    expect(completeLesson(b4, emptyRecord('p', b4), { test: [0, 4, 8, 12] }).rec.passed).toBe(false);
    expect(completeLesson(b4, emptyRecord('p', b4), { test: [0, 4] }).rec.passed).toBe(true);
  });

  it('buổi kiểm tra tiết tấu: sai cao độ 3/9 nốt biểu diễn → dưới 80% nốt → chưa đạt bài biểu diễn', () => {
    const b15 = lesson('l1-15-rhythm-test');
    const { scores, rec } = completeLesson(b15, emptyRecord('p', b15), { perform: [0, 3, 6] });
    expect(scores.perform.accuracy).toBeLessThan(0.8);
    expect(scores.perform.passed).toBe(false);
    expect(rec.passed).toBe(false);
  });

  it('Wait Mode không có tiêu chí nhịp: chơi rất chậm vẫn trọn điểm', () => {
    const b4 = lesson('l1-04-cde');
    const ex = b4.exercises.find((e) => e.id === 'test')!;
    expect(ex.kind === 'play' && ex.mode).toBe('wait');
    const s = runExercise(ex);
    expect(s.criteria.map((c) => c.key)).not.toContain('timing');
    expect(s.score).toBe(100);
  });
});
