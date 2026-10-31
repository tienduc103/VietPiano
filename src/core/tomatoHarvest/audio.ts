/** Nhạc/không khí tổng hợp nhẹ, không tải tài nguyên mạng và tách khỏi tiếng piano. */
export class TomatoFarmAudio {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private natureGain: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];

  start(music: boolean, nature: boolean): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.context) {
      this.context = new Ctor();
      this.musicGain = this.context.createGain();
      this.natureGain = this.context.createGain();
      this.musicGain.connect(this.context.destination);
      this.natureGain.connect(this.context.destination);
      this.makeMusic();
      this.makeNature();
    }
    if (this.context.state === 'suspended') void this.context.resume();
    this.setEnabled(music, nature);
  }

  setEnabled(music: boolean, nature: boolean): void {
    if (!this.context) return;
    const at = this.context.currentTime;
    this.musicGain?.gain.setTargetAtTime(music ? 0.035 : 0, at, 0.2);
    this.natureGain?.gain.setTargetAtTime(nature ? 0.025 : 0, at, 0.2);
  }

  stop(): void {
    this.timers.forEach((id) => window.clearInterval(id));
    this.timers = [];
    this.sources.forEach((source) => {
      try { source.stop(); } catch { /* đã dừng */ }
    });
    this.sources = [];
    if (this.context) void this.context.close();
    this.context = null;
    this.musicGain = null;
    this.natureGain = null;
  }

  private makeMusic(): void {
    if (!this.context || !this.musicGain) return;
    const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    let step = 0;
    const play = () => {
      if (!this.context || !this.musicGain) return;
      const osc = this.context.createOscillator();
      const env = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[step++ % notes.length];
      env.gain.setValueAtTime(0, this.context.currentTime);
      env.gain.linearRampToValueAtTime(0.7, this.context.currentTime + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.65);
      osc.connect(env).connect(this.musicGain);
      osc.start();
      osc.stop(this.context.currentTime + 0.7);
    };
    play();
    this.timers.push(window.setInterval(play, 720));
  }

  private makeNature(): void {
    if (!this.context || !this.natureGain) return;
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter).connect(this.natureGain);
    source.start();
    this.sources.push(source);
    const chirp = () => {
      if (!this.context || !this.natureGain) return;
      const osc = this.context.createOscillator();
      const env = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2200, this.context.currentTime + 0.12);
      env.gain.setValueAtTime(0.001, this.context.currentTime);
      env.gain.linearRampToValueAtTime(0.5, this.context.currentTime + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.18);
      osc.connect(env).connect(this.natureGain);
      osc.start();
      osc.stop(this.context.currentTime + 0.2);
    };
    this.timers.push(window.setInterval(chirp, 4800));
  }
}
