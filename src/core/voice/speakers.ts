/**
 * Nguồn phát giọng nói trên trình duyệt (theo thứ tự):
 *  1. File ghi âm riêng của câu (`audioAsset` trong dữ liệu bài).
 *  2. Giọng cô giáo thu sẵn: `voice/index.json` (câu đơn → mp3 giọng HoaiMy, tạo bằng `npm run voice`).
 *     Câu dài tách theo dấu chấm câu, phát nối các file; câu đơn chưa có file → đọc bằng giọng của máy.
 *  3. Web Speech API (`speechSynthesis`) với giọng tiếng Việt; ưu tiên giọng nữ miền Bắc nếu có.
 *  4. Không có gì → không đọc (trả null), app chỉ hiện chữ.
 *
 * Riêng tư: mặc định CHỈ dùng giọng cài trên máy (`localService`). Giọng "trực tuyến" (Edge Natural,
 * Google) gửi câu đọc lên máy chủ của trình duyệt → phải bật riêng trong Cài đặt. Câu đọc không chứa
 * tên hay thông tin của bé. File thu sẵn nằm cùng app (offline).
 * Tiếng nói phát qua đường riêng, không đi qua AudioContext của tiếng đàn (`SoundOutput`) → không ngắt tiếng đàn.
 */
import { splitSentences, voiceKey } from './catalog';
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

/** Một đoạn của câu: file mp3 hoặc đọc bằng giọng của máy. */
export type SpeechPart = { url: string } | { tts: string };

/** File thu sẵn được tạo ở tốc độ 0.9 (-10%) → tốc độ phát = tốc độ cài đặt / 0.9 (mặc định 0.85 → ~0.94). */
export const RECORDED_RATE = 0.9;

/**
 * Chia câu cần đọc thành các đoạn phát được. `index`: câu đơn (khoá `voiceKey`) → URL file thu sẵn.
 * Đoạn không có file: đọc bằng giọng máy nếu có (`tts`), không thì bỏ. Trả rỗng = không phát được gì.
 */
export function speechParts(
  text: string,
  audioAsset: string | undefined,
  index: ReadonlyMap<string, string>,
  tts: boolean,
  resolveAsset: (a: string) => string = (a) => a,
): SpeechPart[] {
  if (audioAsset) return [{ url: resolveAsset(audioAsset) }];
  const parts: SpeechPart[] = [];
  for (const sentence of splitSentences(text)) {
    const url = index.get(voiceKey(sentence));
    const last = parts.at(-1);
    if (url) parts.push({ url });
    // Các câu liền nhau phải đọc bằng giọng máy gộp thành một lần đọc.
    else if (tts && last && 'tts' in last) last.tts += ` ${sentence}`;
    else if (tts) parts.push({ tts: sentence });
  }
  return parts;
}

/** WAV im lặng rất ngắn — phát trong lần chạm đầu để Safari cho thẻ <audio> này phát về sau. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

export class HybridSpeaker implements Speaker {
  private voices: SpeechSynthesisVoice[] = [];
  private preferredName = '';
  private allowOnline = false;
  private audio: HTMLAudioElement | null = null;
  /** Giọng cô giáo thu sẵn: câu đơn → URL. Rỗng tới khi nạp xong / không có file. */
  private index: ReadonlyMap<string, string> = new Map();
  /** File không phát được (404, định dạng) → lần sau đọc bằng giọng máy. */
  private brokenUrls = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly baseUrl = '/') {
    void this.loadIndex();
    const s = synth();
    if (!s) return;
    this.loadVoices();
    // Chrome / Edge nạp danh sách giọng bất đồng bộ.
    s.addEventListener?.('voiceschanged', () => this.loadVoices());
  }

  private url(path: string): string {
    const base = typeof location === 'undefined' ? 'http://localhost/' : location.href;
    return new URL(path.replace(/^\//, ''), new URL(this.baseUrl, base)).href;
  }

  private async loadIndex(): Promise<void> {
    if (typeof fetch === 'undefined' || typeof Audio === 'undefined') return;
    try {
      const res = await fetch(this.url('voice/index.json'));
      if (!res.ok) return;
      const data = (await res.json()) as { lines?: Record<string, string> };
      this.index = new Map(Object.entries(data.lines ?? {}).map(([line, file]) => [voiceKey(line), this.url(`voice/vi/${file}`)]));
      this.listeners.forEach((l) => l());
    } catch {
      // Không có file thu sẵn (bản dev chưa chạy `npm run voice`) → dùng giọng của máy.
    }
  }

  /** Số câu có giọng thu sẵn (Cài đặt hiện cho phụ huynh). */
  get recordedLines(): number {
    return this.index.size;
  }

  private loadVoices(): void {
    this.voices = synth()?.getVoices() ?? [];
    this.listeners.forEach((l) => l());
  }

  /** Báo khi danh sách giọng / giọng thu sẵn thay đổi (màn Cài đặt). */
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
    // Thẻ <audio> đã phát một lần trong thao tác người dùng thì về sau phát tiếp được (iPad).
    if (typeof Audio !== 'undefined' && !this.audio) {
      this.audio = new Audio();
      this.audio.src = SILENT_WAV;
      void this.audio.play().catch(() => undefined);
    }
  }

  speak(cue: { text: string; audioAsset?: string }, rate: number): SpeechHandle | null {
    this.cancelAll();
    const hasAudio = typeof Audio !== 'undefined';
    const asset = hasAudio && cue.audioAsset && !this.brokenUrls.has(this.url(cue.audioAsset)) ? cue.audioAsset : undefined;
    const parts = speechParts(cue.text, asset, hasAudio ? this.index : new Map(), this.currentVoice() !== null, (a) => this.url(a)).filter(
      (p) => !('url' in p) || !this.brokenUrls.has(p.url),
    );
    if (parts.length === 0) return null;
    return this.playParts(parts, cue.text, rate);
  }

  private cancelAll(): void {
    synth()?.cancel();
    if (this.audio && !this.audio.paused) this.audio.pause();
  }

  /** Phát lần lượt các đoạn (nghỉ 120 ms giữa hai file); file đầu lỗi → đọc cả câu bằng giọng máy. */
  private playParts(parts: SpeechPart[], fullText: string, rate: number): SpeechHandle {
    let cancelled = false;
    let current: SpeechHandle | null = null;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const run = async () => {
      for (const [i, part] of parts.entries()) {
        if (cancelled) return;
        if ('tts' in part) {
          current = this.speakTts(part.tts, rate);
          if (current) await current.done;
          continue;
        }
        if (i > 0) await new Promise((r) => setTimeout(r, 120));
        if (cancelled) return;
        current = this.playFile(part.url, rate);
        await current.done;
        if (this.brokenUrls.has(part.url) && i === 0 && !cancelled) {
          current = this.speakTts(fullText, rate);
          if (current) await current.done;
          return;
        }
      }
    };
    void run().finally(resolve);
    return {
      done,
      cancel: () => {
        cancelled = true;
        current?.cancel();
        resolve();
      },
    };
  }

  private playFile(url: string, rate: number): SpeechHandle {
    const audio = this.audio ?? (this.audio = new Audio());
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const finish = () => {
      audio.onended = audio.onerror = null;
      resolve();
    };
    audio.onended = finish;
    audio.onerror = () => {
      this.brokenUrls.add(url);
      finish();
    };
    audio.src = url;
    audio.playbackRate = Math.min(2, Math.max(0.5, rate / RECORDED_RATE));
    void audio.play().catch(() => audio.onerror?.(new Event('error')));
    return {
      done,
      cancel: () => {
        audio.pause();
        finish();
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
