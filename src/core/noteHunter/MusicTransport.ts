/**
 * Đồng hồ âm nhạc của trò Săn nốt: vị trí bài (nốt đen) theo thời gian thực, nhịp độ, chạy/dừng.
 * Thuần — thời gian (ms, cùng gốc performance.now()) luôn được truyền vào.
 *
 * Vị trí tuyến tính từng đoạn: `anchorBeat` tại `anchorTime`, tăng `bpm / 60000` mỗi ms khi đang chạy.
 * Dừng = đóng băng `anchorBeat`; chạy tiếp = đặt lại mốc thời gian → không mất hay lặp phách nào.
 */
export const MIN_BPM = 40;
export const MAX_BPM = 140;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 80;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

export class MusicTransport {
  private bpmValue: number;
  private anchorBeat = 0;
  private anchorTime = 0;
  private runningValue = false;

  constructor(bpm: number) {
    this.bpmValue = clampBpm(bpm);
  }

  get bpm(): number {
    return this.bpmValue;
  }

  get running(): boolean {
    return this.runningValue;
  }

  get msPerBeat(): number {
    return 60000 / this.bpmValue;
  }

  /** Vị trí (nốt đen) tại thời điểm `now`. */
  position(now: number): number {
    return this.runningValue ? this.anchorBeat + (now - this.anchorTime) / this.msPerBeat : this.anchorBeat;
  }

  /** Thời điểm (ms) vị trí đạt `beat` nếu cứ chạy tiếp từ mốc hiện tại (đang dừng: tính như chạy ngay từ `anchorTime`). */
  timeAt(beat: number): number {
    return this.anchorTime + (beat - this.anchorBeat) * this.msPerBeat;
  }

  /** Chạy từ `beat` tại thời điểm `now`. */
  start(beat: number, now: number): void {
    this.anchorBeat = beat;
    this.anchorTime = now;
    this.runningValue = true;
  }

  /** Dừng tại vị trí hiện tại. */
  pause(now: number): void {
    if (!this.runningValue) return;
    this.anchorBeat = this.position(now);
    this.anchorTime = now;
    this.runningValue = false;
  }

  /** Dừng chính xác ở `beat` (điểm chờ nốt mục tiêu) — vị trí không vượt quá điểm này dù khung hình tới trễ. */
  freezeAt(beat: number): void {
    this.anchorTime = this.timeAt(beat);
    this.anchorBeat = beat;
    this.runningValue = false;
  }

  /** Chạy tiếp từ vị trí đang dừng. */
  resume(now: number): void {
    if (this.runningValue) return;
    this.anchorTime = now;
    this.runningValue = true;
  }

  /** Đổi nhịp độ, giữ nguyên vị trí hiện tại. */
  setTempo(bpm: number, now: number): void {
    const beat = this.position(now);
    this.bpmValue = clampBpm(bpm);
    this.anchorBeat = beat;
    this.anchorTime = now;
  }
}
