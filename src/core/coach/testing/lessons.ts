/** Bài thử cho test của AI Piano Coach (ký hiệu gọn như thư viện bài). Chỉ dùng trong test. */
import { parseAccompaniment, parseNotes } from '../../lessons/notation';
import type { Lesson } from '../../lessons/types';

export function testLesson(notation: string, extra: Partial<Lesson> & { acc?: string } = {}): Lesson {
  const { acc, ...rest } = extra;
  return {
    id: 'test',
    title: 'Bài thử',
    description: '',
    category: 'song',
    clef: acc ? 'grand' : 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: acc ? 'both' : 'right',
    notes: parseNotes(notation),
    tempo: 60,
    ...(acc ? { accompaniment: parseAccompaniment(acc) } : {}),
    ...rest,
  };
}
