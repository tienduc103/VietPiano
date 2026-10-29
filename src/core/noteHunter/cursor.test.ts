import { describe, expect, it } from 'vitest';
import { cursorX, noteIndexAt } from './cursor';

const notes = [
  { startBeat: 0, durationBeats: 1 },
  { startBeat: 1, durationBeats: 2 },
  { startBeat: 3, durationBeats: 1 },
];
const centers = [100, 160, 260];

describe('con trỏ phát', () => {
  it('nốt đang vang theo phách', () => {
    expect(noteIndexAt(notes, -0.5)).toBe(-1);
    expect(noteIndexAt(notes, 0)).toBe(0);
    expect(noteIndexAt(notes, 2.99)).toBe(1);
    expect(noteIndexAt(notes, 3)).toBe(2);
    expect(noteIndexAt(notes, 99)).toBe(2);
    expect(noteIndexAt([], 0)).toBe(-1);
  });

  it('nội suy giữa tâm nốt, đếm vào đứng trước nốt đầu', () => {
    const opts = { endX: 300, leadInBeats: 4, leadInWidth: 40 };
    expect(cursorX(notes, centers, 0, opts)).toBe(100);
    expect(cursorX(notes, centers, 0.5, opts)).toBe(130);
    expect(cursorX(notes, centers, 2, opts)).toBe(210);
    expect(cursorX(notes, centers, 3.5, opts)).toBe(280);
    expect(cursorX(notes, centers, 10, opts)).toBe(300);
    expect(cursorX(notes, centers, -4, opts)).toBe(60);
    expect(cursorX(notes, centers, -2, opts)).toBe(80);
  });
});
