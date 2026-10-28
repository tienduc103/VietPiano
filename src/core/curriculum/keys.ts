/** Phím đàn: nhóm phím đen, phím cần tìm, phím tô sáng trên hình minh hoạ. */
import { isBlackKey, midiToPitchClass } from '../music/notes';
import type { KeyHighlight, KeyTarget } from './types';

/** Lớp nốt của nhóm 2 phím đen (C#, D#) và nhóm 3 phím đen (F#, G#, A#). */
const GROUP_2 = [1, 3];
const GROUP_3 = [6, 8, 10];

export function blackGroupOf(midi: number): 2 | 3 | null {
  const pc = midiToPitchClass(midi);
  if (GROUP_2.includes(pc)) return 2;
  if (GROUP_3.includes(pc)) return 3;
  return null;
}

export function matchesKeyTarget(target: KeyTarget, midi: number): boolean {
  switch (target.type) {
    case 'midi':
      return midi === target.midi;
    case 'pitch-class':
      return midiToPitchClass(midi) === target.pc && !target.exclude?.includes(midi);
    case 'black':
      return isBlackKey(midi);
    case 'white':
      return !isBlackKey(midi);
    case 'black-group':
      return blackGroupOf(midi) === target.size;
  }
}

/** Các phím trong khoảng [from, to] thoả `target` (để kiểm tra dữ liệu bài: phải có ít nhất một phím). */
export function keysMatching(target: KeyTarget, from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; m <= to; m++) if (matchesKeyTarget(target, m)) out.push(m);
  return out;
}

export function highlightedKeys(h: KeyHighlight | undefined, from: number, to: number): number[] {
  if (!h) return [];
  if (Array.isArray(h)) return h.filter((m) => m >= from && m <= to);
  const target: KeyTarget =
    h === 'black' ? { type: 'black' } : h === 'white' ? { type: 'white' } : h === 'all-c' ? { type: 'pitch-class', pc: 0 } : { type: 'black-group', size: h === 'black-group-2' ? 2 : 3 };
  return keysMatching(target, from, to);
}
