import { create } from 'zustand';
import { midiInput, type MidiState } from '../core/input/MIDIInputProvider';

interface MidiStore extends MidiState {
  /** Nốt (MIDI) gần nhất nhận từ đàn — để người dùng thử xem đàn đã nối chưa. */
  lastNote: number | null;
  /** Tăng mỗi lần nhận Note On (kể cả lặp lại cùng phím) — để nút nổi nháy lại. */
  noteSeq: number;
  /** Số phím đang giữ trên đàn. */
  held: number;
}

export const useMidi = create<MidiStore>(() => ({ ...midiInput.state, lastNote: null, noteSeq: 0, held: 0 }));

const heldKeys = new Set<number>();

midiInput.stateChanges.on((state) => {
  if (state.status !== 'ready') heldKeys.clear();
  useMidi.setState({ ...state, ...(state.status !== 'ready' ? { lastNote: null, held: 0 } : {}) });
});
midiInput.onNote(({ midi }) => {
  heldKeys.add(midi);
  useMidi.setState((s) => ({ lastNote: midi, noteSeq: s.noteSeq + 1, held: heldKeys.size }));
});
midiInput.onNoteOff(({ midi }) => {
  heldKeys.delete(midi);
  useMidi.setState({ held: heldKeys.size });
});
