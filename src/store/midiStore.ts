import { create } from 'zustand';
import { midiInput, type MidiPortInfo, type MidiState } from '../core/input/MIDIInputProvider';
import { describeMessage } from '../core/midi/messages';

/** Một dòng trong bảng kiểm tra tín hiệu trực tiếp. */
export interface MidiLogEntry {
  seq: number;
  portId: string;
  text: string;
  accepted: boolean;
}

const LOG_SIZE = 12;

interface MidiStore extends MidiState {
  /** Mọi thiết bị đã thấy (kể cả đã rút) + cấu hình — cho Quản lý thiết bị MIDI. */
  ports: MidiPortInfo[];
  /** Nốt (MIDI) gần nhất nhận từ đàn — để người dùng thử xem đàn đã nối chưa. */
  lastNote: number | null;
  lastVelocity: number | null;
  /** Tăng mỗi lần nhận Note On (kể cả lặp lại cùng phím) — để nút nổi nháy lại. */
  noteSeq: number;
  /** Số phím đang giữ trên đàn. */
  held: number;
  /** Phím (đã dịch giọng) đang giữ theo từng cổng. */
  heldByPort: Record<string, number[]>;
  pedalByPort: Record<string, boolean>;
  /** Thiết bị gửi tín hiệu gần nhất (kể cả tín hiệu bị lọc). */
  lastActivePort: string | null;
  log: MidiLogEntry[];
}

export const useMidi = create<MidiStore>(() => ({
  ...midiInput.state,
  ports: midiInput.portList,
  lastNote: null,
  lastVelocity: null,
  noteSeq: 0,
  held: 0,
  heldByPort: {},
  pedalByPort: {},
  lastActivePort: null,
  log: [],
}));

const heldKeys = new Set<number>();
const heldPerPort = new Map<string, Set<number>>();
let logSeq = 0;

midiInput.stateChanges.on((state) => {
  if (state.status !== 'ready') {
    heldKeys.clear();
    heldPerPort.clear();
  }
  useMidi.setState({ ...state, ...(state.status !== 'ready' ? { lastNote: null, lastVelocity: null, held: 0, heldByPort: {}, pedalByPort: {} } : {}) });
});
midiInput.portChanges.on((ports) => useMidi.setState({ ports }));
midiInput.onNote(({ midi, velocity }) => {
  heldKeys.add(midi);
  useMidi.setState((s) => ({ lastNote: midi, lastVelocity: velocity ?? null, noteSeq: s.noteSeq + 1, held: heldKeys.size }));
});
midiInput.onNoteOff(({ midi }) => {
  heldKeys.delete(midi);
  useMidi.setState({ held: heldKeys.size });
});
midiInput.onDetail((e) => {
  if (e.type === 'message') {
    const entry: MidiLogEntry = { seq: ++logSeq, portId: e.portId, text: describeMessage(e.message), accepted: e.accepted };
    useMidi.setState((s) => ({ lastActivePort: e.portId, log: [entry, ...s.log].slice(0, LOG_SIZE) }));
    return;
  }
  if (e.type === 'pedal') {
    useMidi.setState((s) => ({ pedalByPort: { ...s.pedalByPort, [e.portId]: e.down } }));
    return;
  }
  let set = heldPerPort.get(e.portId);
  if (!set) heldPerPort.set(e.portId, (set = new Set()));
  if (e.on) set.add(e.midi);
  else set.delete(e.midi);
  const keys = [...set];
  useMidi.setState((s) => ({ heldByPort: { ...s.heldByPort, [e.portId]: keys } }));
});
