/**
 * Âm thanh F1 Racing: tổng hợp hoàn toàn bằng WebAudio (offline, không có tệp ngoài), AudioContext riêng
 * tách khỏi tiếng piano. Mức âm giữ thấp để không lấn tiếng đàn; đang nghe bằng micro thì tắt hết
 * vì micro sẽ nghe nhầm nhạc và hiệu ứng thành nốt.
 */
export interface F1AudioLevels {
  musicOn: boolean;
  musicVolume: number;
  sfxOn: boolean;
  sfxVolume: number;
  /** Đang nghe bằng micro. */
  micQuiet: boolean;
}

const MUSIC_MAX = 0.07;
const ENGINE_MAX = 0.045;
const SFX_MAX = 0.2;
const STEP_SEC = 60 / 152 / 2;
const LOOKAHEAD_SEC = 0.25;

/** Giai điệu 8 bước × 4 hợp âm (A–F–C–G), tự viết; 0 = nghỉ. */
const BASS = [110, 87.31, 130.81, 98];
const LEAD = [
  [440, 0, 523.25, 659.25, 0, 523.25, 659.25, 783.99],
  [349.23, 0, 440, 523.25, 0, 440, 523.25, 698.46],
  [392, 0, 523.25, 659.25, 0, 783.99, 659.25, 523.25],
  [392, 493.88, 587.33, 0, 493.88, 587.33, 783.99, 0],
];

export class F1Audio {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode[] = [];
  private timer: number | null = null;
  private nextStepAt = 0;
  private step = 0;
  private noise: AudioBuffer | null = null;
  private levels: F1AudioLevels = { musicOn: true, musicVolume: 0.5, sfxOn: true, sfxVolume: 0.7, micQuiet: false };
  private engineLive = false;

  /** Gọi trong thao tác của người dùng (Safari cần user gesture). */
  unlock(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.engineGain = ctx.createGain();
      this.music.gain.value = 0;
      this.sfx.gain.value = 0;
      this.engineGain.gain.value = 0;
      this.music.connect(ctx.destination);
      this.sfx.connect(ctx.destination);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain.connect(filter).connect(ctx.destination);
      for (const [type, detune] of [['sawtooth', 0], ['square', 7]] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = 40;
        osc.detune.value = detune;
        osc.connect(this.engineGain);
        osc.start();
        this.engineOsc.push(osc);
      }
      const length = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.applyLevels();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setLevels(levels: F1AudioLevels): void {
    this.levels = levels;
    this.applyLevels();
  }

  /** Vào đua: nhạc và động cơ chạy. */
  startRace(): void {
    if (!this.ctx) return;
    this.engineLive = true;
    this.applyLevels();
    if (this.timer === null) {
      this.nextStepAt = this.ctx.currentTime + 0.05;
      this.timer = window.setInterval(() => this.schedule(), 80);
    }
  }

  /** Dừng nhạc và động cơ, vẫn phát được hiệu ứng (về đích, cúp). */
  stopRace(): void {
    this.engineLive = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.applyLevels();
  }

  /** Tạm dừng toàn bộ: AudioContext ngừng hẳn nên nhạc nối tiếp đúng chỗ khi chơi lại. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Cao độ động cơ theo tốc độ (0–100). */
  setEngineSpeed(speed: number): void {
    if (!this.ctx) return;
    const f = 38 + (speed / 100) * 72;
    for (const osc of this.engineOsc) osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  /** Giải phóng hoàn toàn khi rời màn. */
  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const osc of this.engineOsc) {
      try {
        osc.stop();
      } catch {
        // đã dừng
      }
    }
    this.engineOsc = [];
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.music = this.sfx = this.engineGain = null;
    this.noise = null;
    this.engineLive = false;
  }

  countdownBeep(final = false): void {
    this.tone(final ? 880 : 440, final ? 0.45 : 0.18, 'square', 0.5);
  }
  accelerate(): void {
    this.sweep(180, 520, 0.22, 'sawtooth', 0.35);
  }
  decelerate(): void {
    this.sweep(320, 110, 0.28, 'sawtooth', 0.3);
  }
  laneChange(): void {
    this.sweep(500, 760, 0.1, 'triangle', 0.3);
  }
  correct(): void {
    this.tone(1320, 0.08, 'sine', 0.3);
    this.tone(1760, 0.1, 'sine', 0.25, 0.05);
  }
  wrong(): void {
    this.tone(196, 0.18, 'triangle', 0.4);
  }
  crash(): void {
    this.burst(0.28, 900, 0.9);
    this.tone(70, 0.25, 'square', 0.5);
  }
  assist(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.5, i * 0.07));
  }
  finish(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, i === 4 ? 0.6 : 0.16, 'square', 0.35, i * 0.12));
  }
  trophy(): void {
    [783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.45, 0.9 + i * 0.1));
  }

  private applyLevels(): void {
    if (!this.ctx || !this.music || !this.sfx || !this.engineGain) return;
    const { musicOn, musicVolume, sfxOn, sfxVolume, micQuiet } = this.levels;
    const at = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(musicOn && !micQuiet ? musicVolume * MUSIC_MAX : 0, at, 0.1);
    this.sfx.gain.setTargetAtTime(sfxOn && !micQuiet ? sfxVolume * SFX_MAX : 0, at, 0.02);
    this.engineGain.gain.setTargetAtTime(this.engineLive && sfxOn && !micQuiet ? sfxVolume * ENGINE_MAX : 0, at, 0.15);
  }

  private schedule(): void {
    if (!this.ctx || !this.music) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD_SEC;
    // Tab bị hãm lâu: bỏ phần đã lỡ, không phát dồn.
    if (this.nextStepAt < this.ctx.currentTime) this.nextStepAt = this.ctx.currentTime + 0.02;
    while (this.nextStepAt < horizon) {
      const bar = Math.floor(this.step / 8) % BASS.length;
      const beat = this.step % 8;
      if (beat % 2 === 0) this.voice(this.music, BASS[bar] * (beat % 4 === 0 ? 1 : 2), STEP_SEC * 1.4, 'triangle', 1, this.nextStepAt);
      const lead = LEAD[bar][beat];
      if (lead > 0) this.voice(this.music, lead, STEP_SEC * 0.8, 'square', 0.32, this.nextStepAt);
      this.nextStepAt += STEP_SEC;
      this.step++;
    }
  }

  private voice(dest: AudioNode, freq: number, dur: number, type: OscillatorType, peak: number, at: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, delay = 0): void {
    if (this.ctx && this.sfx) this.voice(this.sfx, freq, dur, type, peak, this.ctx.currentTime + delay);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType, peak: number): void {
    if (!this.ctx || !this.sfx) return;
    const at = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(this.sfx);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private burst(dur: number, cutoff: number, peak: number): void {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const at = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    src.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(env).connect(this.sfx);
    src.start(at);
    src.stop(at + dur);
  }
}
