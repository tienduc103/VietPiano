/**
 * Nguồn phát giọng nói trên trình duyệt:
 *  1. File ghi âm sẵn (`audioAsset`, HTMLAudioElement) — ưu tiên; file lỗi / không có → TTS.
 *  2. Web Speech API (`speechSynthesis`) với giọng tiếng Việt; ưu tiên giọng nữ miền Bắc nếu có.
 *  3. Không có giọng tiếng Việt → không đọc (trả null), app chỉ hiện chữ.
 *
 * Riêng tư: mặc định CHỈ dùng giọng cài trên máy (`localService`). Giọng "trực tuyến" (Edge Natural,
 * Google) gửi câu đọc lên máy chủ của trình duyệt → phải bật riêng trong Cài đặt. Câu đọc không chứa
 * tên hay thông tin của bé.
 * Tiếng nói phát qua đường riêng, không đi qua AudioContext của tiếng đàn (`SoundOutput`) → không ngắt tiếng đàn.
 */
import type { SpeechHandle, Speaker } from './types';

export interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI?: string;
}

/** Tên giọng nữ tiếng Việt hay gặp: Linh (iOS/macOS), HoaiMy (Microsoft, miền Bắc), "female"/"nữ". */
const FEMALE_HINT = /linh|hoai\s*my|hoaimy|female|\bnữ\b|\bmai\b|\blan\b|\bthu\b/i;
/** Giọng miền Bắc: HoaiMy, Linh (giọng Hà Nội), "Bắc" / "Hanoi". */
const NORTH_HINT = /hoai\s*my|hoaimy|linh|bắc|ha\s*noi|hanoi|northern/i;
const MALE_HINT = /\ban\b|nam\s*minh|namminh|male|\bnam\b/i;

export const isVietnamese = (v: Pick<VoiceInfo, 'lang'>) => /^vi([-_]|$)/i.test(v.lang);

/**
 * Chọn giọng tiếng Việt: theo tên đã chọn (nếu còn), không thì giọng trên máy > nữ > miền Bắc.
 * `allowOnline` = false → bỏ giọng trực tuyến.
 */
export function pickVietnameseVoice<V extends VoiceInfo>(voices: readonly V[], preferredName = '', allowOnline = false): V | null {
  const usable = voices.filter((v) => isVietnamese(v) && (allowOnline || v.localService));
  if (preferredName) {
    const chosen = usable.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }
  const score = (v: V) => (v.localService ? 8 : 0) + (FEMALE_HINT.test(v.name) ? 4 : MALE_HINT.test(v.name) ? -2 : 0) + (NORTH_HINT.test(v.name) ? 2 : 0) + (/vi-VN/i.test(v.lang) ? 1 : 0);
  return usable.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

export class HybridSpeaker implements Speaker {
  private voices: SpeechSynthesisVoice[] = [];
  private preferredName = '';
  private allowOnline = false;
  private audio: HTMLAudioElement | null = null;
  /** File ghi âm không phát được (404, định dạng) → lần sau dùng TTS luôn. */
  private brokenAssets = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly baseUrl = '/') {
    const s = synth();
    if (!s) return;
    this.loadVoices();
    // Chrome / Edge nạp danh sách giọng bất đồng bộ.
    s.addEventListener?.('voiceschanged', () => this.loadVoices());
  }

  private loadVoices(): void {
    this.voices = synth()?.getVoices() ?? [];
    this.listeners.forEach((l) => l());
  }

  /** Báo khi danh sách giọng thay đổi (màn Cài đặt). */
  onVoicesChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get ttsSupported(): boolean {
    return synth() !== null;
  }

  /** Mọi giọng tiếng Việt trên thiết bị (kể cả trực tuyến) — cho ô chọn giọng. */
  vietnameseVoices(): VoiceInfo[] {
    return this.voices.filter(isVietnamese).map((v) => ({ name: v.name, lang: v.lang, localService: v.localService, voiceURI: v.voiceURI }));
  }

  configure(opts: { voiceName: string; allowOnline: boolean }): void {
    this.preferredName = opts.voiceName;
    this.allowOnline = opts.allowOnline;
  }

  currentVoice(): SpeechSynthesisVoice | null {
    return pickVietnameseVoice(this.voices, this.preferredName, this.allowOnline);
  }

  unlock(): void {
    // Safari: lần speak() đầu tiên phải nằm trong thao tác người dùng → đọc một câu rỗng.
    const s = synth();
    if (s) {
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        s.speak(u);
      } catch {
        // bỏ qua
      }
    }
    if (typeof Audio !== 'undefined' && !this.audio) this.audio = new Audio();
  }

  speak(cue: { text: string; audioAsset?: string }, rate: number): SpeechHandle | null {
    this.cancelAll();
    if (cue.audioAsset && !this.brokenAssets.has(cue.audioAsset) && typeof Audio !== 'undefined') {
      return this.playFile(cue.audioAsset, cue.text, rate);
    }
    return this.speakTts(cue.text, rate);
  }

  private cancelAll(): void {
    synth()?.cancel();
    if (this.audio && !this.audio.paused) this.audio.pause();
  }

  private playFile(asset: string, fallbackText: string, rate: number): SpeechHandle | null {
    const audio = this.audio ?? (this.audio = new Audio());
    let cancelled = false;
    let inner: SpeechHandle | null = null;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const cleanup = () => {
      audio.onended = audio.onerror = null;
    };
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      this.brokenAssets.add(asset);
      // File lỗi → đọc bằng TTS (nếu có giọng).
      inner = cancelled ? null : this.speakTts(fallbackText, rate);
      if (inner) void inner.done.then(resolve);
      else resolve();
    };
    audio.src = new URL(asset.replace(/^\//, ''), new URL(this.baseUrl, location.href)).href;
    audio.playbackRate = 1;
    void audio.play().catch(() => audio.onerror?.(new Event('error')));
    return {
      done,
      cancel: () => {
        cancelled = true;
        cleanup();
        audio.pause();
        inner?.cancel();
        resolve();
      },
    };
  }

  private speakTts(text: string, rate: number): SpeechHandle | null {
    const s = synth();
    const voice = this.currentVoice();
    if (!s || !voice || !text.trim()) return null;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    // Giọng cao hơn chút nghe vui, hợp với bé.
    u.pitch = 1.1;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    u.onend = () => resolve();
    u.onerror = () => resolve();
    s.speak(u);
    // Safari đôi khi không gọi onend → hết hạn theo độ dài câu.
    const guard = setTimeout(resolve, 1500 + (text.length * 120) / Math.max(0.3, rate));
    void done.then(() => clearTimeout(guard));
    return {
      done,
      cancel: () => {
        u.onend = u.onerror = null;
        s.cancel();
        resolve();
      },
    };
  }
}

/** Nguồn phát im lặng (môi trường không có trình duyệt). */
export const silentSpeaker: Speaker = {
  speak: () => null,
  unlock: () => undefined,
};
