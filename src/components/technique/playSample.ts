import { scheduleNotes, soundOutput } from '../../core/audio/SoundOutput';
import { pedalRanges, soundingNotes } from '../../core/curriculum/piece';
import type { Lesson } from '../../core/lessons/types';
import { sustainUnderPedal } from '../../core/music/pedal';

/** Nghe mẫu một bài (hai tay, ngân theo pedal) ở tempo `bpm`; trả về thời lượng (ms). */
export function playLessonSample(lesson: Lesson, bpm: number): number {
  soundOutput.unlock();
  const notes = sustainUnderPedal(soundingNotes(lesson), pedalRanges(lesson));
  return soundOutput.playSequence(scheduleNotes(notes, Math.max(20, bpm)));
}
