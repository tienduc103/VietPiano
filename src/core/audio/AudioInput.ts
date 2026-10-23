/**
 * AudioInput — vòng đời microphone + AudioContext + AudioWorklet.
 *
 * Bảo đảm:
 *  - Chỉ một MediaStream / AudioContext tại một thời điểm (start() gọi lặp lại dùng chung promise).
 *  - stop() dừng mọi track, ngắt node và đóng AudioContext.
 *  - Phát hiện Safari tạm dừng AudioContext ("interrupted"/"suspended") và track bị ngắt.
 * Âm thanh chỉ được xử lý trên thiết bị, không gửi đi đâu.
 */
import workletUrl from './capture-processor.js?url&no-inline';
import { Emitter } from '../input/NoteInputProvider';
import { SignalWatchdog } from './SignalWatchdog';

export type AudioInputStatus = 'idle' | 'starting' | 'running' | 'suspended' | 'error';

export type AudioInputErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'device-lost'
  | 'no-signal'
  | 'unknown';

export class AudioInputError extends Error {
  constructor(
    readonly code: AudioInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AudioInputError';
  }
}

export const AUDIO_ERROR_MESSAGES: Record<AudioInputErrorCode, string> = {
  'insecure-context': 'Trình duyệt chỉ cho dùng micro qua HTTPS (hoặc localhost). Hãy mở ứng dụng bằng địa chỉ https://.',
  unsupported: 'Trình duyệt này không hỗ trợ Web Audio / AudioWorklet. Hãy cập nhật iPadOS hoặc dùng Safari mới hơn.',
  'permission-denied':
    'Chưa được cấp quyền micro. Trên iPad: Cài đặt → Safari → Micrô → Cho phép (hoặc bấm "aA" trên thanh địa chỉ → Cài đặt trang web).',
  'no-device': 'Không tìm thấy micro trên thiết bị.',
  'device-busy': 'Micro đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.',
  'device-lost': 'Micro bị ngắt kết nối hoặc bị hệ thống tạm dừng.',
  'no-signal':
    'Micro đã bật nhưng không nhận được âm thanh nào (kể cả tiếng ồn). Hãy bấm bật lại micro; nếu vẫn vậy, đóng hẳn Safari/app rồi mở lại, và kiểm tra không có app khác (gọi điện, ghi âm) đang dùng micro.',
  unknown: 'Không thể khởi động micro.',
};

export interface AudioFrameEvent {
  samples: Float32Array;
  sampleRate: number;
  time: number;
}

export const FRAME_SIZE = 2048;
export const HOP_SIZE = 1024;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
/** Audio Session API của WebKit (Safari 16.4+/17); chưa có trong lib.dom. */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string }; standalone?: boolean };

/**
 * Báo iOS là trang vừa thu vừa phát. Ở app trên màn hình chính (PWA), audio session có thể ở
 * chế độ chỉ phát → MediaStreamSource trả toàn mẫu 0 dù chấm cam micro vẫn sáng.
 */
function preferPlayAndRecord(): void {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session || session.type === 'play-and-record') return;
  try {
    session.type = 'play-and-record';
  } catch {
    // Trình duyệt không cho đổi → giữ nguyên.
  }
}

export class AudioInput {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private startPromise: Promise<void> | null = null;
  private statusValue: AudioInputStatus = 'idle';
  private lastError: AudioInputError | null = null;
  private readonly watchdog = new SignalWatchdog();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  /** Tăng mỗi lần teardown → doStart đang chờ biết mình đã bị huỷ. */
  private generation = 0;
  /** Chẩn đoán lần thử đầu khi micro câm; đã có = đang/đã thử lại (chỉ thử lại một lần). */
  private firstFailure: string | null = null;
  /** Lần bật đang chạy dùng chế độ dự phòng (bật echoCancellation, AudioContext tạo sau). */
  private fallbackActive = false;
  /** Chế độ dự phòng đã có tín hiệu trong phiên này → các lần bật sau dùng luôn (khỏi chờ bộ canh). */
  private preferFallback = false;

  readonly frames = new Emitter<AudioFrameEvent>();
  readonly statusChanges = new Emitter<{ status: AudioInputStatus; error: AudioInputError | null }>();

  get status(): AudioInputStatus {
    return this.statusValue;
  }

  get error(): AudioInputError | null {
    return this.lastError;
  }

  get sampleRate(): number | null {
    return this.context?.sampleRate ?? null;
  }

  private setStatus(status: AudioInputStatus, error: AudioInputError | null = null) {
    if (status === 'running' && this.statusValue !== 'running') this.startWatchdog();
    else if (status !== 'running') this.stopWatchdog();
    this.statusValue = status;
    this.lastError = error;
    this.statusChanges.emit({ status, error });
  }

  /** Phải gọi từ thao tác người dùng (tap) để Safari cho phép. */
  start(): Promise<void> {
    if (this.statusValue === 'running') return Promise.resolve();
    if (this.statusValue === 'suspended' && this.context) return this.resume();
    if (this.startPromise) return this.startPromise;
    this.firstFailure = null;
    return this.launch(this.preferFallback);
  }

  /** Đang chạy ở chế độ dự phòng (iOS bật xử lý giọng nói → tiếng đàn có thể bị nén nhẹ). */
  get usingFallback(): boolean {
    return this.fallbackActive;
  }

  private launch(fallback: boolean): Promise<void> {
    this.fallbackActive = fallback;
    this.startPromise = this.doStart(fallback).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /**
   * `fallback` (lần thử lại khi micro câm): bật echoCancellation và tạo AudioContext SAU khi đã có
   * micro. Chế độ thường tắt echoCancellation (tiếng đàn không bị nén) và tạo context ngay trong
   * thao tác người dùng; nhưng trên iOS (nhất là app màn hình chính) bộ thu không qua xử lý giọng
   * nói có lúc trả toàn mẫu 0 dù track vẫn "live".
   */
  private async doStart(fallback: boolean): Promise<void> {
    this.setStatus('starting');
    const generation = this.generation;
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new AudioInputError('insecure-context', AUDIO_ERROR_MESSAGES['insecure-context']);
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);
      }
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);

      preferPlayAndRecord();
      const createContext = () => {
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.context = ctx;
        if (!ctx.audioWorklet) throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);
        return ctx;
      };
      // Tạo AudioContext ngay trong thao tác người dùng (trước await) để Safari không chặn.
      let context = fallback ? null : createContext();

      // Tắt xử lý giọng nói: AGC/khử ồn làm méo và nén tiếng đàn.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: fallback,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
      } catch (err) {
        throw mapGetUserMediaError(err);
      }
      if (this.generation !== generation) {
        // stop() đã được gọi trong lúc chờ quyền.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      context ??= createContext();
      this.stream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', this.handleTrackEnded);
      });

      await context.audioWorklet.addModule(workletUrl);
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'vietpiano-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { frameSize: FRAME_SIZE, hopSize: HOP_SIZE },
      });
      const sampleRate = context.sampleRate;
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        this.watchdog.frame(e.data, performance.now());
        if (fallback && !this.preferFallback && this.watchdog.hasSignal) this.preferFallback = true;
        this.frames.emit({ samples: e.data, sampleRate, time: performance.now() });
      };
      // Nối vào destination qua gain = 0 để Safari chắc chắn chạy graph mà không phát tiếng.
      const sink = context.createGain();
      sink.gain.value = 0;
      source.connect(worklet);
      worklet.connect(sink);
      sink.connect(context.destination);
      this.source = source;
      this.worklet = worklet;
      this.sink = sink;

      context.onstatechange = this.handleContextStateChange;
      if (context.state !== 'running') await context.resume();
      this.setStatus(context.state === 'running' ? 'running' : 'suspended');
    } catch (err) {
      await this.teardown();
      const error =
        err instanceof AudioInputError ? err : new AudioInputError('unknown', `${AUDIO_ERROR_MESSAGES.unknown} (${String(err)})`);
      this.setStatus('error', error);
      throw error;
    }
  }

  /** Tiếp tục sau khi Safari tạm dừng (cần thao tác người dùng). */
  async resume(): Promise<void> {
    const ctx = this.context;
    if (!ctx) return this.start();
    const liveTrack = this.stream?.getAudioTracks().some((t) => t.readyState === 'live');
    if (!liveTrack) {
      await this.stop();
      return this.start();
    }
    try {
      await ctx.resume();
      this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
    } catch {
      await this.stop();
      return this.start();
    }
  }

  async stop(): Promise<void> {
    if (this.startPromise) {
      // Đánh dấu huỷ: doStart sẽ thấy context đã đổi.
      await this.teardown();
      await this.startPromise.catch(() => undefined);
    }
    await this.teardown();
    this.setStatus('idle');
  }

  private async teardown(): Promise<void> {
    this.generation++;
    const ctx = this.context;
    this.context = null;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.port.postMessage('stop');
      this.worklet.disconnect();
      this.worklet = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.sink?.disconnect();
    this.sink = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        t.removeEventListener('ended', this.handleTrackEnded);
        t.stop();
      });
      this.stream = null;
    }
    if (ctx) {
      ctx.onstatechange = null;
      if (ctx.state !== 'closed') await ctx.close().catch(() => undefined);
    }
  }

  /** Tóm tắt trạng thái thu âm, để người dùng báo lại khi micro không nghe được. */
  diagnostics(): string {
    const ctx = this.context;
    const track = this.stream?.getAudioTracks()[0];
    const trackRate = track?.getSettings?.().sampleRate;
    const nav = navigator as AudioSessionNavigator;
    const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    return [
      ctx ? `AudioContext ${ctx.state} ${ctx.sampleRate} Hz` : 'không có AudioContext',
      track ? `track ${track.readyState}${track.muted ? ' muted' : ''}${trackRate ? ` ${trackRate} Hz` : ''}` : 'không có track',
      `${this.watchdog.frames} khung (${this.watchdog.silentFrames} toàn 0)`,
      `session ${nav.audioSession?.type ?? 'n/a'}`,
      standalone ? 'app màn hình chính' : 'tab trình duyệt',
      this.fallbackActive ? 'dự phòng (echoCancellation)' : 'thường',
    ].join(' · ');
  }

  private startWatchdog() {
    this.stopWatchdog();
    this.watchdog.reset(performance.now());
    this.watchdogTimer = setInterval(() => {
      if (this.statusValue !== 'running' || !this.watchdog.isDead(performance.now())) return;
      const details = this.diagnostics();
      if (this.firstFailure === null) {
        // Thử lại một lần ở chế độ dự phòng (quyền micro đã cấp → không hỏi lại).
        this.firstFailure = details;
        void this.teardown().then(() => this.launch(true).catch(() => undefined));
        return;
      }
      const message = `${AUDIO_ERROR_MESSAGES['no-signal']} [lần 1: ${this.firstFailure}] [lần 2: ${details}]`;
      void this.teardown().then(() => this.setStatus('error', new AudioInputError('no-signal', message)));
    }, 500);
  }

  private stopWatchdog() {
    if (this.watchdogTimer !== null) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private handleContextStateChange = () => {
    const state = this.context?.state as string | undefined;
    if (!state || this.statusValue === 'error' || this.statusValue === 'idle') return;
    if (state === 'running') this.setStatus('running');
    // Safari dùng trạng thái "interrupted" khi bị cuộc gọi / app khác chiếm audio.
    else if (state === 'suspended' || state === 'interrupted') this.setStatus('suspended');
  };

  private handleTrackEnded = () => {
    void this.teardown().then(() =>
      this.setStatus('error', new AudioInputError('device-lost', AUDIO_ERROR_MESSAGES['device-lost'])),
    );
  };
}

function mapGetUserMediaError(err: unknown): AudioInputError {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new AudioInputError('permission-denied', AUDIO_ERROR_MESSAGES['permission-denied']);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new AudioInputError('no-device', AUDIO_ERROR_MESSAGES['no-device']);
    case 'NotReadableError':
    case 'AbortError':
      return new AudioInputError('device-busy', AUDIO_ERROR_MESSAGES['device-busy']);
    default:
      return new AudioInputError('unknown', `${AUDIO_ERROR_MESSAGES.unknown} (${String(err)})`);
  }
}
