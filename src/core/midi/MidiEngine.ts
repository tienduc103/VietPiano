/**
 * MidiEngine — lớp MIDI chung của VietPiano, độc lập hãng / model / nền tảng.
 *
 *   adapter nền tảng (Web MIDI | cầu nối Core MIDI / WebView2 | mô phỏng)
 *     → byte thô theo cổng → MidiByteParser (running status, real-time, SysEx)
 *     → cấu hình thiết bị (bật/tắt, lọc kênh, dải phím, transpose, quãng tám, đường cong lực gõ)
 *     → sự kiện chuẩn: noteOn (+ velocity) / noteOff / pedal vang — `NoteInputProvider` như các nguồn nốt khác.
 *
 * Mọi bài học, bài kiểm tra, trò chơi chỉ nghe `midiInput` (một instance của lớp này) — không màn nào
 * đụng tới thiết bị cụ thể. Không có logic riêng theo hãng: nhận dạng tên model chỉ để gợi ý cấu hình mặc định.
 *
 * Chống kẹt phím: engine nhớ phím đang giữ theo (cổng, kênh, phím thô) → Note Off luôn khớp nốt đã phát
 * dù cấu hình dịch giọng đổi giữa chừng; rút đàn / tắt thiết bị / đổi cấu hình / dừng → phát Note Off (và nhả pedal)
 * cho mọi phím còn giữ.
 */
import { Emitter, type NoteInputEvent, type NoteInputProvider, type NoteOffEvent, type Unsubscribe } from '../input/NoteInputProvider';
import { CC_ALL_NOTES_OFF, CC_ALL_SOUND_OFF, CC_SUSTAIN, MidiByteParser, SUSTAIN_THRESHOLD, type MidiMessage } from './messages';
import { guessTransport, identifyDevice, type DeviceProfile, type MidiTransport } from './deviceProfiles';
import { acceptsChannel, applyVelocityCurve, DEFAULT_DEVICE_CONFIG, mapNote, sanitizeDeviceConfig, type MidiDeviceConfig } from './deviceConfig';
import { deviceKey, LocalDeviceConfigStore, type DeviceConfigStore } from './deviceConfigStore';
import type { MidiBackend, MidiBackendKind, MidiBackendSession, MidiPortDescriptor } from './backends/types';

export type MidiStatus = 'idle' | 'connecting' | 'ready' | 'denied' | 'unsupported' | 'error';

/** Thiết bị đang dùng được (đã nối, đang bật) — dạng cũ, các màn dùng `devices.length` / `devices[0].name`. */
export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiState {
  status: MidiStatus;
  /** Các cổng vào đang kết nối và được bật trong Quản lý thiết bị. */
  devices: MidiDevice[];
  error: string | null;
}

/** Thông tin đầy đủ cho Quản lý thiết bị MIDI. */
export interface MidiPortInfo {
  id: string;
  /** Khoá cấu hình (tên + hãng). */
  key: string;
  name: string;
  manufacturer: string;
  connected: boolean;
  transport: MidiTransport;
  /** true: adapter không báo cách kết nối, chỉ đoán theo tên. */
  transportGuessed: boolean;
  profile: DeviceProfile;
  config: MidiDeviceConfig;
}

/** Đạp / nhả pedal vang từ đàn MIDI. */
export interface PedalInputEvent {
  down: boolean;
  time: number;
}

/** Sự kiện chi tiết theo thiết bị — cho bảng kiểm tra tín hiệu, tiếng piano phát kèm, phím đang giữ. */
export type MidiDetailEvent =
  | { type: 'note'; portId: string; on: boolean; raw: number; midi: number; velocity: number; channel: number; time: number }
  | { type: 'pedal'; portId: string; down: boolean; channel: number; time: number }
  /** Mọi thông điệp đọc được (kể cả của thiết bị đang tắt / kênh bị lọc — `accepted` = false). */
  | { type: 'message'; portId: string; message: MidiMessage; accepted: boolean; time: number };

export interface Timers {
  set(cb: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface MidiEngineOptions {
  configStore?: DeviceConfigStore;
  timers?: Timers;
  /** Khoảng chờ trước mỗi lần tự kết nối lại sau lỗi (ms); hết danh sách thì dừng, người dùng bấm Thử lại. */
  retryDelays?: number[];
}

const DEFAULT_RETRY = [2000, 5000, 10000];
const defaultTimers: Timers = { set: (cb, ms) => setTimeout(cb, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface PortRuntime {
  info: MidiPortInfo;
  parser: MidiByteParser;
  /** (kênh << 7 | phím thô) → nốt đã phát. */
  held: Map<number, number>;
  pedalDown: boolean;
}

export class MidiEngine implements NoteInputProvider {
  readonly kind = 'midi' as const;
  readonly stateChanges = new Emitter<MidiState>();
  /** Danh sách thiết bị / cấu hình thay đổi. */
  readonly portChanges = new Emitter<MidiPortInfo[]>();
  private readonly notes = new Emitter<NoteInputEvent>();
  private readonly noteOffs = new Emitter<NoteOffEvent>();
  private readonly pedals = new Emitter<PedalInputEvent>();
  private readonly details = new Emitter<MidiDetailEvent>();
  private readonly configStore: DeviceConfigStore;
  private readonly timers: Timers;
  private readonly retryDelays: number[];
  private backend: MidiBackend | null;
  private session: MidiBackendSession | null = null;
  private ports = new Map<string, PortRuntime>();
  private current: MidiState;
  /** Tăng mỗi lần start/stop để bỏ kết quả của lần xin quyền cũ. */
  private generation = 0;
  private retryCount = 0;
  private retryTimer: unknown = null;
  private wanted = false;

  constructor(backend: MidiBackend | null, opts: MidiEngineOptions = {}) {
    this.backend = backend;
    this.configStore = opts.configStore ?? new LocalDeviceConfigStore();
    this.timers = opts.timers ?? defaultTimers;
    this.retryDelays = opts.retryDelays ?? DEFAULT_RETRY;
    this.current = { status: backend ? 'idle' : 'unsupported', devices: [], error: null };
  }

  get state(): MidiState {
    return this.current;
  }

  /** Mọi thiết bị đã thấy trong phiên (kể cả đã rút), thiết bị đang nối trước. */
  get portList(): MidiPortInfo[] {
    return [...this.ports.values()].map((p) => p.info).sort((a, b) => Number(b.connected) - Number(a.connected));
  }

  get backendKind(): MidiBackendKind | null {
    return this.backend?.kind ?? null;
  }

  get backendLabel(): string | null {
    return this.backend?.label ?? null;
  }

  isSupported(): boolean {
    return this.backend !== null;
  }

  isActive(): boolean {
    return this.current.status === 'ready';
  }

  /** Đang sẵn sàng và có ít nhất một đàn đã cắm, đang bật. */
  hasDevice(): boolean {
    return this.isActive() && this.current.devices.length > 0;
  }

  canPairBluetooth(): boolean {
    return typeof this.backend?.pairBluetooth === 'function';
  }

  pairBluetooth(): void {
    this.backend?.pairBluetooth?.();
  }

  /** Đổi adapter (bật / tắt thiết bị mô phỏng). Đang chạy thì kết nối lại bằng adapter mới. */
  setBackend(backend: MidiBackend | null): Promise<void> {
    // Đồng bộ tới lúc đổi xong adapter: lần start() gọi ngay sau đó chắc chắn dùng adapter mới.
    const wasWanted = this.wanted;
    this.halt();
    this.backend = backend;
    this.ports.clear();
    this.setState({ status: backend ? 'idle' : 'unsupported', devices: [], error: null });
    this.emitPorts();
    return wasWanted ? this.start() : Promise.resolve();
  }

  async start(): Promise<void> {
    return this.begin(false);
  }

  private async begin(fromRetry: boolean): Promise<void> {
    if (!this.backend || this.current.status === 'ready' || this.current.status === 'connecting') return;
    this.wanted = true;
    this.cancelRetry();
    // Người dùng bấm Thử lại → được tự thử lại đủ lượt một lần nữa.
    if (!fromRetry) this.retryCount = 0;
    const gen = ++this.generation;
    this.setState({ status: 'connecting', devices: [], error: null });
    try {
      const session = await this.backend.open({
        onPorts: (ports) => {
          if (gen === this.generation) this.applyPorts(ports);
        },
        onData: (portId, data, time) => {
          if (gen === this.generation) this.handleData(portId, data, time);
        },
        onError: (e) => {
          if (gen === this.generation) this.fail(e, true);
        },
      });
      if (gen !== this.generation) {
        session.close();
        return;
      }
      this.session = session;
      this.retryCount = 0;
      this.current = { ...this.current, status: 'ready' };
      this.publish();
    } catch (e) {
      if (gen !== this.generation) return;
      this.fail(e, false);
    }
  }

  async stop(): Promise<void> {
    this.halt();
  }

  private halt(): void {
    this.wanted = false;
    this.cancelRetry();
    this.generation++;
    this.closeSession();
    if (this.backend) this.setState({ status: 'idle', devices: [], error: null });
    this.emitPorts();
  }

  /** Ngắt rồi kết nối lại (nút "Kết nối lại" — vd sau khi đóng phần mềm khác đang giữ cổng MIDI trên Windows). */
  async reconnect(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /** Quét lại cổng (app trở lại từ nền; cầu nối native có thể đã mất kết nối Bluetooth). */
  refresh(): void {
    this.session?.refresh?.();
  }

  onNote(listener: (event: NoteInputEvent) => void): Unsubscribe {
    return this.notes.on(listener);
  }

  /** Thả phím — đàn MIDI báo chính xác, dùng để chấm trường độ. */
  onNoteOff(listener: (event: NoteOffEvent) => void): Unsubscribe {
    return this.noteOffs.on(listener);
  }

  /** Đạp / nhả pedal vang (Control Change 64) — chỉ phát khi trạng thái đổi (đàn half-pedal gửi liên tục). */
  onPedal(listener: (event: PedalInputEvent) => void): Unsubscribe {
    return this.pedals.on(listener);
  }

  onDetail(listener: (event: MidiDetailEvent) => void): Unsubscribe {
    return this.details.on(listener);
  }

  /** Đổi cấu hình một thiết bị; lưu theo tên đàn. Phím đang giữ được thả để không kẹt nốt. */
  updateConfig(portId: string, patch: Partial<MidiDeviceConfig>): void {
    const port = this.ports.get(portId);
    if (!port) return;
    const config = sanitizeDeviceConfig({ ...port.info.config, ...patch });
    this.releasePort(port, now());
    port.info = { ...port.info, config };
    this.configStore.save(port.info.key, config);
    // Cùng tên (hai cổng của một đàn cắm lại) → cùng cấu hình.
    for (const other of this.ports.values()) {
      if (other !== port && other.info.key === port.info.key) {
        this.releasePort(other, now());
        other.info = { ...other.info, config };
      }
    }
    this.publish();
  }

  resetConfig(portId: string): void {
    this.updateConfig(portId, { ...DEFAULT_DEVICE_CONFIG });
  }

  /** Thiết bị đã rút khỏi danh sách hiển thị. */
  forget(portId: string): void {
    const port = this.ports.get(portId);
    if (!port || port.info.connected) return;
    this.ports.delete(portId);
    this.emitPorts();
  }

  // ——— nội bộ ———

  private fail(e: unknown, fromSession: boolean): void {
    const denied = e instanceof Error && (e.name === 'SecurityError' || e.name === 'NotAllowedError');
    this.closeSession();
    this.setState({
      status: denied ? 'denied' : 'error',
      devices: [],
      error: denied
        ? 'Chưa được cấp quyền dùng thiết bị MIDI. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ → cho phép MIDI rồi thử lại.'
        : `${fromSession ? 'Mất kết nối MIDI' : 'Không mở được MIDI'}: ${e instanceof Error ? e.message : String(e)}`,
    });
    this.emitPorts();
    if (!denied) this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (!this.wanted || this.retryCount >= this.retryDelays.length) return;
    const delay = this.retryDelays[this.retryCount++];
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      if (this.wanted && (this.current.status === 'error' || this.current.status === 'idle')) void this.begin(true);
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) this.timers.clear(this.retryTimer);
    this.retryTimer = null;
  }

  private closeSession(): void {
    const t = now();
    for (const port of this.ports.values()) {
      this.releasePort(port, t);
      port.parser.reset();
      port.info = { ...port.info, connected: false };
    }
    this.session?.close();
    this.session = null;
  }

  private applyPorts(list: MidiPortDescriptor[]): void {
    const t = now();
    const seen = new Set<string>();
    for (const d of list) {
      seen.add(d.id);
      const key = deviceKey(d.name, d.manufacturer);
      const connected = d.state === 'connected';
      let port = this.ports.get(d.id);
      if (!port) {
        // Windows đổi id khi cắm lại → bỏ bản ghi cũ đã rút cùng tên.
        for (const [id, old] of this.ports) if (!old.info.connected && old.info.key === key) this.ports.delete(id);
        const guess = guessTransport(d.name, d.manufacturer);
        port = {
          info: {
            id: d.id,
            key,
            name: d.name,
            manufacturer: d.manufacturer,
            connected,
            transport: d.transport ?? guess.transport,
            transportGuessed: d.transport === undefined,
            profile: identifyDevice(d.name, d.manufacturer),
            config: this.configStore.load(key) ?? { ...DEFAULT_DEVICE_CONFIG },
          },
          parser: new MidiByteParser(),
          held: new Map(),
          pedalDown: false,
        };
        this.ports.set(d.id, port);
      } else if (port.info.connected !== connected) {
        if (!connected) this.disconnectPort(port, t);
        port.info = { ...port.info, connected };
      }
    }
    // Adapter bỏ hẳn cổng khỏi danh sách → coi như đã rút, vẫn hiện trong Quản lý thiết bị.
    for (const port of this.ports.values()) {
      if (!seen.has(port.info.id) && port.info.connected) {
        this.disconnectPort(port, t);
        port.info = { ...port.info, connected: false };
      }
    }
    this.publish();
  }

  private disconnectPort(port: PortRuntime, time: number): void {
    this.releasePort(port, time);
    port.parser.reset();
  }

  /** Thả mọi phím đang giữ + nhả pedal của một cổng (chống kẹt nốt). */
  private releasePort(port: PortRuntime, time: number): void {
    for (const [k, midi] of port.held) {
      this.emitOff(port, midi, k >> 7, k & 0x7f, time);
    }
    port.held.clear();
    if (port.pedalDown) {
      port.pedalDown = false;
      this.pedals.emit({ down: false, time });
      this.details.emit({ type: 'pedal', portId: port.info.id, down: false, channel: 0, time });
    }
  }

  private handleData(portId: string, data: ArrayLike<number>, time: number): void {
    const port = this.ports.get(portId);
    if (!port || !port.info.connected) return;
    for (const message of port.parser.push(data)) this.handleMessage(port, message, time);
  }

  private handleMessage(port: PortRuntime, m: MidiMessage, time: number): void {
    const cfg = port.info.config;
    const accepted = cfg.enabled && acceptsChannel(cfg, m.channel);
    this.details.emit({ type: 'message', portId: port.info.id, message: m, accepted, time });
    if (!accepted) return;
    switch (m.type) {
      case 'noteOn': {
        const midi = mapNote(m.note, cfg, port.info.profile);
        if (midi === null) return;
        const velocity = applyVelocityCurve(m.velocity, cfg.velocityCurve);
        port.held.set((m.channel << 7) | m.note, midi);
        this.notes.emit({ midi, time, source: 'midi', velocity });
        this.details.emit({ type: 'note', portId: port.info.id, on: true, raw: m.note, midi, velocity, channel: m.channel, time });
        return;
      }
      case 'noteOff': {
        const k = (m.channel << 7) | m.note;
        const held = port.held.get(k);
        port.held.delete(k);
        const midi = held ?? mapNote(m.note, cfg, port.info.profile);
        if (midi === null) return;
        this.emitOff(port, midi, m.channel, m.note, time);
        return;
      }
      case 'controlChange':
        if (m.controller === CC_SUSTAIN) {
          const down = m.value >= SUSTAIN_THRESHOLD;
          if (down === port.pedalDown) return;
          port.pedalDown = down;
          this.pedals.emit({ down, time });
          this.details.emit({ type: 'pedal', portId: port.info.id, down, channel: m.channel, time });
        } else if (m.controller === CC_ALL_NOTES_OFF || m.controller === CC_ALL_SOUND_OFF) {
          for (const [k, midi] of port.held) if (k >> 7 === m.channel) {
            port.held.delete(k);
            this.emitOff(port, midi, m.channel, k & 0x7f, time);
          }
        }
        return;
      default:
        return;
    }
  }

  private emitOff(port: PortRuntime, midi: number, channel: number, raw: number, time: number): void {
    this.noteOffs.emit({ midi, time, source: 'midi' });
    this.details.emit({ type: 'note', portId: port.info.id, on: false, raw, midi, velocity: 0, channel, time });
  }

  /** Cập nhật `devices` (thiết bị dùng được) + báo danh sách cổng. */
  private publish(): void {
    if (this.current.status === 'ready') {
      const devices = [...this.ports.values()]
        .filter((p) => p.info.connected && p.info.config.enabled)
        .map((p) => ({ id: p.info.id, name: p.info.name, manufacturer: p.info.manufacturer }));
      this.setState({ ...this.current, devices });
    }
    this.emitPorts();
  }

  private emitPorts(): void {
    this.portChanges.emit(this.portList);
  }

  private setState(state: MidiState): void {
    this.current = state;
    this.stateChanges.emit(state);
  }
}
