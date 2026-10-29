/**
 * Bộ lọc nguồn nốt của trò Săn nốt (trên `useNoteInput`, dùng chung micro / đàn MIDI / bàn phím ảo):
 * chọn nguồn Tự động / MIDI / Micro / Piano ảo, và bỏ nốt micro có khả năng là tiếng loa của chính app.
 */
import type { NoteInputEvent } from '../input/NoteInputProvider';
import { acceptSource } from '../input/sourceFilter';
import { isLikelyEcho, type PlaybackRecord } from './AudioScheduler';
import type { HunterInputSetting } from './storage';

export function acceptHunterSource(source: NoteInputEvent['source'], setting: HunterInputSetting, midiConnected: boolean): boolean {
  if (setting === 'virtual') return source === 'virtual';
  return acceptSource(source, setting, midiConnected);
}

export type HunterInputVerdict = 'accept' | 'source' | 'echo';

export function filterHunterEvent(
  e: Pick<NoteInputEvent, 'midi' | 'time' | 'source'>,
  ctx: { setting: HunterInputSetting; midiConnected: boolean; headphones: boolean; played: readonly PlaybackRecord[] },
): HunterInputVerdict {
  if (!acceptHunterSource(e.source, ctx.setting, ctx.midiConnected)) return 'source';
  if (e.source === 'microphone' && !ctx.headphones && isLikelyEcho(e.midi, e.time, ctx.played)) return 'echo';
  return 'accept';
}
