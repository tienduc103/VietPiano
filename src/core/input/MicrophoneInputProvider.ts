/**
 * MicrophoneInputProvider: AudioInput → PitchDetector (YIN) + AttackAnalyzer (nốt gõ đè âm ngân)
 * → NoteRecognizer → sự kiện nốt.
 * Phân tích trên main thread (~47 khung/giây với hop 1024 @ 48 kHz).
 */
import { AudioInput, type AudioInputError, type AudioInputStatus } from '../audio/AudioInput';
import { PitchDetector } from '../audio/PitchDetector';
import { AttackAnalyzer } from '../audio/AttackAnalyzer';
import { NoteRecognizer, type NoteRecognizerConfig, type RecognizerOutput } from '../audio/NoteRecognizer';
import { Emitter, type NoteInputEvent, type NoteInputProvider } from './NoteInputProvider';

export interface MicAnalysis extends RecognizerOutput {
  time: number;
}

export interface MicStatus {
  status: AudioInputStatus;
  error: AudioInputError | null;
}

export class MicrophoneInputProvider implements NoteInputProvider {
  readonly kind = 'microphone' as const;
  readonly analysis = new Emitter<MicAnalysis>();
  readonly statusChanges: Emitter<MicStatus>;

  private readonly notes = new Emitter<NoteInputEvent>();
  private readonly recognizer: NoteRecognizer;
  private detector: PitchDetector | null = null;
  private attack: AttackAnalyzer | null = null;
  private readonly audio: AudioInput;

  constructor(audio = new AudioInput(), recognizerConfig: Partial<NoteRecognizerConfig> = {}) {
    this.audio = audio;
    this.statusChanges = audio.statusChanges;
    this.recognizer = new NoteRecognizer(recognizerConfig);
    audio.frames.on(({ samples, sampleRate, time }) => {
      if (!this.detector || this.detector.options.sampleRate !== sampleRate) {
        this.detector = new PitchDetector({ sampleRate, frameSize: samples.length });
        this.attack = new AttackAnalyzer({ sampleRate, frameSize: samples.length });
      }
      const pitch = this.detector.detect(samples);
      const out = this.recognizer.process({ ...pitch, time, attack: this.attack!.process(samples, time) });
      this.analysis.emit({ ...out, time });
      if (out.noteOn) this.notes.emit({ midi: out.noteOn.midi, time: out.noteOn.time, source: 'microphone' });
    });
    audio.statusChanges.on(({ status }) => {
      if (status !== 'running') this.resetRecognizer();
    });
  }

  get status(): MicStatus {
    return { status: this.audio.status, error: this.audio.error };
  }

  start(): Promise<void> {
    return this.audio.start();
  }

  stop(): Promise<void> {
    return this.audio.stop();
  }

  resume(): Promise<void> {
    return this.audio.resume();
  }

  isActive(): boolean {
    return this.audio.status === 'running';
  }

  onNote(listener: (event: NoteInputEvent) => void) {
    return this.notes.on(listener);
  }

  updateConfig(config: Partial<NoteRecognizerConfig>): void {
    this.recognizer.updateConfig(config);
  }

  /** Gọi khi chuyển nốt/bài để không mang trạng thái âm ngân sang ngữ cảnh mới. */
  resetRecognizer(): void {
    this.recognizer.reset();
    this.attack?.reset();
  }
}

/** Một instance duy nhất cho toàn app → không bao giờ mở hai micro stream. */
export const microphoneInput = new MicrophoneInputProvider();
