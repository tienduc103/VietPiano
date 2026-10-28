import { describe, expect, it } from 'vitest';
import { scheduleNotes } from './SoundOutput';

describe('scheduleNotes', () => {
  it('đổi phách → giây theo nhịp độ, bỏ dấu lặng', () => {
    const notes = [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 80 },
      { midiNote: null, startBeat: 1, durationBeats: 1, velocity: 80 },
      { midiNote: 64, startBeat: 2, durationBeats: 2, velocity: 70 },
    ];
    expect(scheduleNotes(notes, 120)).toEqual([
      { midi: 60, start: 0, duration: 0.5, velocity: 80 },
      { midi: 64, start: 1, duration: 1, velocity: 70 },
    ]);
  });
});
