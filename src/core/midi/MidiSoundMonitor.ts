/**
 * Phát tiếng piano khi gõ trên controller MIDI không có loa (Korg microKEY, Akai MPK, Arturia KeyStep…).
 * Đàn điện có loa sẵn (Yamaha Clavinova, Casio Privia…) thì mặc định không phát để khỏi kêu đôi.
 * Quyết định theo từng thiết bị: `MidiDeviceConfig.sound` ('auto' dựa vào nhận dạng tên model).
 *
 * Chỉ nghe sự kiện của MidiEngine, không ảnh hưởng chấm điểm / trò chơi.
 */
import type { LiveTimbre } from '../audio/SoundOutput';
import { shouldPlaySound } from './deviceConfig';
import type { MidiEngine, MidiPortInfo } from './MidiEngine';

export interface LiveSynth {
  liveNoteOn(midi: number, velocity: number, timbre: LiveTimbre): void;
  liveNoteOff(midi: number): void;
  liveSetSustain(down: boolean): void;
  liveAllOff(): void;
}

export class MidiSoundMonitor {
  private ports = new Map<string, MidiPortInfo>();
  /** Nốt monitor đã bật → cổng (chỉ tắt nốt mình đã bật). */
  private sounding = new Map<number, string>();
  private offs: (() => void)[] = [];

  constructor(
    private readonly engine: Pick<MidiEngine, 'onDetail' | 'portChanges' | 'portList'>,
    private readonly synth: LiveSynth,
    private timbre: LiveTimbre = 'grand',
  ) {}

  start(): void {
    if (this.offs.length) return;
    this.setPorts(this.engine.portList);
    this.offs.push(
      this.engine.portChanges.on((ports) => this.setPorts(ports)),
      this.engine.onDetail((e) => {
        if (e.type === 'note') {
          if (e.on) {
            if (!this.playsFor(e.portId)) return;
            this.synth.liveNoteOn(e.midi, e.velocity, this.timbre);
            this.sounding.set(e.midi, e.portId);
          } else if (this.sounding.get(e.midi) === e.portId) {
            this.sounding.delete(e.midi);
            this.synth.liveNoteOff(e.midi);
          }
        } else if (e.type === 'pedal' && this.playsFor(e.portId)) {
          this.synth.liveSetSustain(e.down);
        }
      }),
    );
  }

  stop(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.sounding.clear();
    this.synth.liveAllOff();
  }

  setTimbre(timbre: LiveTimbre): void {
    this.timbre = timbre;
  }

  /** Thiết bị này có đang được phát tiếng không (cho giao diện). */
  playsFor(portId: string): boolean {
    const p = this.ports.get(portId);
    return !!p && p.config.enabled && shouldPlaySound(p.config, p.profile);
  }

  private setPorts(list: MidiPortInfo[]): void {
    this.ports = new Map(list.map((p) => [p.id, p]));
    // Thiết bị vừa bị tắt tiếng / rút → tắt các nốt đang kêu của nó.
    for (const [midi, portId] of this.sounding) {
      if (!this.playsFor(portId)) {
        this.sounding.delete(midi);
        this.synth.liveNoteOff(midi);
      }
    }
  }
}
