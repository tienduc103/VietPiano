import { create } from 'zustand';
import { midiInput, type MidiState } from '../core/input/MIDIInputProvider';

interface MidiStore extends MidiState {
  /** Nốt (MIDI) gần nhất nhận từ đàn — để người dùng thử xem đàn đã nối chưa. */
  lastNote: number | null;
}

export const useMidi = create<MidiStore>(() => ({ ...midiInput.state, lastNote: null }));

midiInput.stateChanges.on((state) => useMidi.setState({ ...state, ...(state.status !== 'ready' ? { lastNote: null } : {}) }));
midiInput.onNote(({ midi }) => useMidi.setState({ lastNote: midi }));
