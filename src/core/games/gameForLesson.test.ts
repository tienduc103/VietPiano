import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../curriculum/content/curriculum';
import { keysMatching } from '../curriculum/keys';
import { orderedLessons } from '../curriculum/unlock';
import { gameForLesson, keyboardFor, lessonPitches } from './gameForLesson';

const level1 = orderedLessons(CURRICULUM.levels[0]);
const find = (id: string) => level1.find((l) => l.lessonId === id)!;

describe('gameForLesson', () => {
  it('buổi tìm phím (ít nốt) → Săn phím với các lượt của buổi', () => {
    const g = gameForLesson(find('l1-01-keyboard'));
    expect(g.kind).toBe('key-hunt');
    if (g.kind === 'key-hunt') expect(g.rounds.length).toBeGreaterThan(0);
  });

  it('buổi có ≥ 3 nốt → Hứng nốt rơi với chính các nốt đó', () => {
    const l = find('l1-04-cde');
    expect(lessonPitches(l)).toEqual([60, 62, 64]);
    expect(gameForLesson(l)).toEqual({ kind: 'note-catch', keyboard: { from: 60, to: 71 }, notes: [60, 62, 64] });
  });

  it('mọi buổi đều có trò chơi chơi được trên bàn phím của nó', () => {
    for (const level of CURRICULUM.levels) {
      const lessons = orderedLessons(level);
      lessons.forEach((l, i) => {
        const g = gameForLesson(l, lessons.slice(0, i));
        if (g.kind === 'note-catch') {
          expect(g.notes.length, l.lessonId).toBeGreaterThanOrEqual(3);
          for (const m of g.notes) {
            expect(m, l.lessonId).toBeGreaterThanOrEqual(Math.max(36, g.keyboard.from));
            expect(m, l.lessonId).toBeLessThanOrEqual(Math.min(84, g.keyboard.to));
          }
        } else {
          for (const r of g.rounds) expect(keysMatching(r.target, g.keyboard.from, g.keyboard.to).length, l.lessonId).toBeGreaterThan(0);
        }
      });
    }
  });
});

it('keyboardFor: từ Đô tới Si, ít nhất một quãng 8', () => {
  expect(keyboardFor([62, 64])).toEqual({ from: 60, to: 71 });
  expect(keyboardFor([48, 67])).toEqual({ from: 48, to: 71 });
});
