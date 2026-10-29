/**
 * MIDIInputProvider: đàn nối dây USB/MIDI → Web MIDI API → sự kiện nốt.
 * Chạy trên Chrome/Edge máy tính (Windows, macOS, Android). Safari và mọi trình duyệt trên
 * iPad (đều dùng WebKit) không có Web MIDI → `isSupported()` = false, app dùng micro như cũ.
 * MIDI cho biết chính xác phím nào được gõ nên không qua NoteRecognizer.
 */
import { Emitter, type NoteInputEvent, type NoteInputProvider, type NoteOffEvent } from './NoteInputProvider';

export type MidiStatus = 'idle' | 'connecting' | 'ready' | 'denied' | 'unsupported' | 'error';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiState {
  status: MidiStatus;
  /** Các cổng vào đang kết nối (đã cắm dây, đàn đang bật). */
  devices: MidiDevice[];
  error: string | null;
}

export interface MidiNoteOn {
  midi: number;
  velocity: number;
  channel: number;
}

/**
 * Đọc một thông điệp MIDI; chỉ trả về Note On thật (0x9n, velocity > 0).
 * Note On velocity 0 là Note Off theo chuẩn → bỏ qua. Web MIDI luôn gửi thông điệp đầy đủ
 * (không có running status) nên chỉ cần xét byte đầu.
 */
export function parseNoteOn(data: ArrayLike<number> | null | undefined): MidiNoteOn | null {
  const m = parseNoteMessage(data);
  return m?.type === 'on' ? { midi: m.midi, velocity: m.velocity, channel: m.channel } : null;
}

export interface MidiNoteMessage extends MidiNoteOn {
  type: 'on' | 'off';
}

/** Note On (0x9n, velocity > 0) hoặc Note Off (0x8n, hoặc 0x9n velocity 0); thông điệp khác → null. */
export function parseNoteMessage(data: ArrayLike<number> | null | undefined): MidiNoteMessage | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  const kind = status & 0xf0;
  if (kind !== 0x90 && kind !== 0x80) return null;
  const midi = data[1] & 0x7f;
  const velocity = data[2] & 0x7f;
  const type = kind === 0x90 && velocity > 0 ? 'on' : 'off';
  return { type, midi, velocity, channel: status & 0x0f };
}

/** Pedal vang (sustain): Control Change 64 (0xBn 64 giá trị); giá trị ≥ 64 = đạp. Thông điệp khác → null. */
export function parseSustainPedal(data: ArrayLike<number> | null | undefined): { down: boolean; channel: number } | null {
  if (!data || data.length < 3) return null;
  if ((data[0] & 0xf0) !== 0xb0 || (data[1] & 0x7f) !== 64) return null;
  return { down: (data[2] & 0x7f) >= 64, channel: data[0] & 0x0f };
}

/** Đạp / nhả pedal vang từ đàn MIDI. */
export interface PedalInputEvent {
  down: boolean;
  time: number;
}

export interface MidiAccessLike {
  inputs: { forEach(cb: (input: MidiInputLike) => void): void };
  onstatechange: ((e: unknown) => void) | null;
}

export interface MidiInputLike {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp: number }) => void) | null;
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>;

function browserRequest(): RequestMidiAccess | null {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') return null;
  return () => navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike>;
}

export class MIDIInputProvider implements NoteInputProvider {
  readonly kind = 'midi' as const;
  readonly stateChanges = new Emitter<MidiState>();
  private readonly notes = new Emitter<NoteInputEvent>();
  private readonly noteOffs = new Emitter<NoteOffEvent>();
  private readonly pedals = new Emitter<PedalInputEvent>();
  private readonly request: RequestMidiAccess | null;
  private access: MidiAccessLike | null = null;
  private attached = new Set<MidiInputLike>();
  private current: MidiState;
  /** Tăng mỗi lần start/stop để bỏ kết quả của lần xin quyền cũ. */
  private generation = 0;

  constructor(request: RequestMidiAccess | null = browserRequest()) {
    this.request = request;
    this.current = { status: request ? 'idle' : 'unsupported', devices: [], error: null };
  }

  get state(): MidiState {
    return this.current;
  }

  isSupported(): boolean {
    return this.request !== null;
  }

  isActive(): boolean {
    return this.current.status === 'ready';
  }

  /** Đang sẵn sàng và có ít nhất một đàn đã cắm. */
  hasDevice(): boolean {
    return this.isActive() && this.current.devices.length > 0;
  }

  async start(): Promise<void> {
    if (!this.request || this.current.status === 'ready' || this.current.status === 'connecting') return;
    const gen = ++this.generation;
    this.setState({ status: 'connecting', devices: [], error: null });
    try {
      const access = await this.request();
      if (gen !== this.generation) return;
      this.access = access;
      access.onstatechange = () => this.refresh();
      this.current = { ...this.current, status: 'ready' };
      this.refresh();
    } catch (e) {
      if (gen !== this.generation) return;
      const denied = e instanceof Error && (e.name === 'SecurityError' || e.name === 'NotAllowedError');
      this.setState({
        status: denied ? 'denied' : 'error',
        devices: [],
        error: denied
          ? 'Chưa được cấp quyền dùng thiết bị MIDI. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ → cho phép MIDI rồi thử lại.'
          : `Không mở được MIDI: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    this.detachAll();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    if (this.request) this.setState({ status: 'idle', devices: [], error: null });
  }

  onNote(listener: (event: NoteInputEvent) => void) {
    return this.notes.on(listener);
  }

  /** Thả phím — đàn MIDI báo chính xác, dùng để chấm trường độ. */
  onNoteOff(listener: (event: NoteOffEvent) => void) {
    return this.noteOffs.on(listener);
  }

  /** Đạp / nhả pedal vang (Control Change 64) — chỉ đàn MIDI có; dùng để chấm ký hiệu pedal. */
  onPedal(listener: (event: PedalInputEvent) => void) {
    return this.pedals.on(listener);
  }

  /** Gắn bộ nghe vào mọi cổng đang kết nối; gọi lại khi cắm/rút dây. */
  private refresh(): void {
    if (!this.access) return;
    const live = new Set<MidiInputLike>();
    this.access.inputs.forEach((input) => {
      if (input.state === 'connected') live.add(input);
    });
    for (const input of this.attached) {
      if (!live.has(input)) input.onmidimessage = null;
    }
    for (const input of live) {
      if (!this.attached.has(input)) input.onmidimessage = (e) => this.handleMessage(e.data, e.timeStamp);
    }
    this.attached = live;
    const devices = [...live].map((i) => ({ id: i.id, name: i.name || 'Thiết bị MIDI', manufacturer: i.manufacturer ?? '' }));
    this.setState({ ...this.current, devices });
  }

  private handleMessage(data: Uint8Array | null, timeStamp: number): void {
    // timeStamp của Web MIDI cùng gốc với performance.now(); một số bản cũ trả 0.
    const time = timeStamp > 0 ? timeStamp : performance.now();
    const pedal = parseSustainPedal(data);
    if (pedal) {
      this.pedals.emit({ down: pedal.down, time });
      return;
    }
    const note = parseNoteMessage(data);
    if (!note) return;
    if (note.type === 'off') this.noteOffs.emit({ midi: note.midi, time, source: 'midi' });
    else this.notes.emit({ midi: note.midi, time, source: 'midi', velocity: note.velocity });
  }

  private detachAll(): void {
    for (const input of this.attached) input.onmidimessage = null;
    this.attached.clear();
  }

  private setState(state: MidiState): void {
    this.current = state;
    this.stateChanges.emit(state);
  }
}

/** Một instance cho toàn app. */
export const midiInput = new MIDIInputProvider();
