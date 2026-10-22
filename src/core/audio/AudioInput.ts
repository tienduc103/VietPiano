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

export type AudioInputStatus = 'idle' | 'starting' | 'running' | 'suspended' | 'error';

export type AudioInputErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'device-lost'
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

export class AudioInput {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private startPromise: Promise<void> | null = null;
  private statusValue: AudioInputStatus = 'idle';
  private lastError: AudioInputError | null = null;

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
    this.statusValue = status;
    this.lastError = error;
    this.statusChanges.emit({ status, error });
  }

  /** Phải gọi từ thao tác người dùng (tap) để Safari cho phép. */
  start(): Promise<void> {
    if (this.statusValue === 'running') return Promise.resolve();
    if (this.statusValue === 'suspended' && this.context) return this.resume();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.setStatus('starting');
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new AudioInputError('insecure-context', AUDIO_ERROR_MESSAGES['insecure-context']);
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);
      }
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);

      // Tạo AudioContext ngay trong thao tác người dùng (trước await) để Safari không chặn.
      const context = new Ctor({ latencyHint: 'interactive' });
      this.context = context;
      if (!context.audioWorklet) {
        throw new AudioInputError('unsupported', AUDIO_ERROR_MESSAGES.unsupported);
      }

      // Tắt xử lý giọng nói: AGC/khử ồn làm méo và nén tiếng đàn.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
      } catch (err) {
        throw mapGetUserMediaError(err);
      }
      if (this.context !== context) {
        // stop() đã được gọi trong lúc chờ quyền.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        this.frames.emit({ samples: e.data, sampleRate: context.sampleRate, time: performance.now() });
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
