/**
 * Lịch metronome của Coach (thuần, có test). Tiếng click được LÊN LỊCH TRƯỚC theo đồng hồ âm thanh (`soundOutput.click(…, delay)`)
 * thay vì phát ở khung hình vượt mốc → không lệch ±1 khung hình (≈ 16 ms); mốc lên lịch của từng tiếng click được ghi vào log
 * (`mark` 'click') làm mốc chuẩn khi so nốt với metronome. Dùng chung cho lúc ghi và lúc đo độ trễ (M1-T7) → cùng cách phát.
 *
 * Phách `b` theo nốt đen: phách 0 = phách 0 của bài (sau đếm vào), phách âm = đếm vào. Phách mạnh: (b − pickup) chia hết
 * cho số phách / ô (như metronome cũ).
 */

export interface MetronomeConfig {
  /** Mốc (performance.now) của phách 0. */
  originMs: number;
  beatMs: number;
  /** Số phách nốt đen / ô (3/8 → 1,5). */
  beatsPerMeasure: number;
  /** Ô lấy đà: phách mạnh đầu tiên ở phách `pickup`. */
  pickup: number;
  /** Số phách đếm vào trước phách 0 (có thể lẻ, vd 3/8 → 1,5: chỉ phát các phách nguyên ≥ −1,5 như metronome cũ). */
  countInBeats: number;
}

export interface PlannedClick {
  beat: number;
  /** Mốc phát (performance.now). */
  atMs: number;
  accent: boolean;
  countIn: boolean;
}

/** Lên lịch trước bấy nhiêu ms (đủ cho khung hình chậm, đủ ngắn để tạm dừng huỷ kịp). */
export const METRONOME_LOOKAHEAD_MS = 120;
/** Phách đã trễ hơn mức này (vd app bị ẩn) → bỏ, không phát dồn. */
export const METRONOME_LATE_MS = 40;

export class MetronomeClock {
  private next: number;

  constructor(readonly cfg: MetronomeConfig) {
    this.next = 0 - this.countInWhole(); // không ra −0
  }

  private countInWhole(): number {
    return Math.max(0, Math.floor(this.cfg.countInBeats + 1e-9));
  }

  beatTime(beat: number): number {
    return this.cfg.originMs + beat * this.cfg.beatMs;
  }

  isAccent(beat: number): boolean {
    const bpm = this.cfg.beatsPerMeasure;
    if (!(bpm > 0)) return false;
    const r = (((beat - this.cfg.pickup) % bpm) + bpm) % bpm;
    return r < 1e-6 || bpm - r < 1e-6;
  }

  /** Các phách cần lên lịch: mốc < now + lookahead, chưa lên lịch; phách đã trễ quá `lateMs` bị bỏ qua. */
  due(nowMs: number, lookaheadMs = METRONOME_LOOKAHEAD_MS, lateMs = METRONOME_LATE_MS): PlannedClick[] {
    const out: PlannedClick[] = [];
    while (this.beatTime(this.next) < nowMs + lookaheadMs) {
      const b = this.next++;
      const at = this.beatTime(b);
      if (at < nowMs - lateMs) continue;
      out.push({ beat: b, atMs: at, accent: this.isAccent(b), countIn: b < 0 });
    }
    return out;
  }

  /** Tiếng click đã lên lịch bị huỷ (vd hiệu ứng React chạy lại) → lên lịch lại từ phách này (phách đã trễ vẫn bị bỏ). */
  rewind(beat: number): void {
    if (beat < this.next) this.next = beat;
  }

  /** Phách hiện tại (làm tròn xuống). */
  beatAt(nowMs: number): number {
    return Math.floor((nowMs - this.cfg.originMs) / this.cfg.beatMs);
  }

  /** Số phách đếm vào còn lại (hiện lớp phủ), null = đã hết đếm vào. */
  countInLeft(nowMs: number): number | null {
    const b = this.beatAt(nowMs);
    return b < 0 && b >= -this.countInWhole() ? -b : null;
  }
}
