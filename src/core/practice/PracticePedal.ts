/**
 * Chấm pedal ở màn Luyện tập (đàn MIDI, Control Change 64), dùng lại `pedalQuality`.
 *
 * Trục thời gian khác nhau theo chế độ:
 *  - Theo nhịp: có đồng hồ → vị trí tính bằng phách thật, khoảng pedal giữ nguyên (`pedalRanges`).
 *  - Chờ nốt / Đếm nốt: KHÔNG có đồng hồ, người chơi có thể dừng lâu tuỳ ý → đổi sang trục "số bước":
 *    bước k được đánh lúc k, khoảng lặng giữa bước k−1 và k ở k − 0.5 (`waitPedalPosition`). Như vậy đạp sau khi
 *    đánh nốt đầu ô (k + 0.5) hay ngay trước nốt đó (k − 0.5) đều nằm trong cửa sổ của `pedalQuality`, dù đợi bao lâu.
 */
import { pedalQuality, type PedalEvent, type PedalRange } from '../music/pedal';

/** Vị trí trên trục số bước khi người chơi đang chờ đánh bước `index`; hết bài → sau bước cuối. */
export function waitPedalPosition(index: number, stepCount: number, finished: boolean): number {
  return (finished ? stepCount : index) - 0.5;
}

/** Khoảng pedal theo phách → theo số bước của dòng tập; khoảng không có bước nào của tay đang tập bị bỏ. */
export function stepPedalRanges(ranges: readonly PedalRange[], stepStarts: readonly number[]): PedalRange[] {
  const EPS = 1e-9;
  const firstAtOrAfter = (beat: number) => {
    const i = stepStarts.findIndex((s) => s >= beat - EPS);
    return i < 0 ? stepStarts.length : i;
  };
  return ranges.map((r) => ({ startBeat: firstAtOrAfter(r.startBeat), endBeat: firstAtOrAfter(r.endBeat) })).filter((r) => r.endBeat > r.startBeat);
}

export interface PracticePedalState {
  readonly down: boolean;
  /** Đổi mỗi khi có sự kiện được ghi / xoá, để UI tính lại điểm. */
  readonly version: number;
}

/** Ghi sự kiện đạp / nhả của một lượt tập. Không phụ thuộc React, thời gian do màn hình truyền vào. */
export class PracticePedal {
  private events: PedalEvent[] = [];
  private state: PracticePedalState = { down: false, version: 0 };
  private readonly listeners = new Set<() => void>();

  getState(): PracticePedalState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(down: boolean): void {
    this.state = { down, version: this.state.version + 1 };
    this.listeners.forEach((l) => l());
  }

  /** `record = false` (đang nghe mẫu): chỉ cập nhật trạng thái đạp, không chấm. */
  handle(down: boolean, position: number, record = true): void {
    if (down === this.state.down) return;
    if (record) this.events.push({ beat: position, down });
    this.set(down);
  }

  /**
   * Quay lại vị trí `position` (nốt trước, chơi lại): bỏ sự kiện phía sau.
   * Chân vẫn đang đạp thì coi như đạp từ vị trí đó, để lần nhả kế tiếp còn khớp được.
   */
  rewind(position: number): void {
    const kept = this.events.filter((e) => e.beat <= position);
    if (kept.length === this.events.length) return;
    if (this.state.down && !kept[kept.length - 1]?.down) kept.push({ beat: position, down: true });
    this.events = kept;
    this.set(this.state.down);
  }

  /** Bắt đầu lượt mới; chân đang đạp sẵn thì tính là đạp từ `position`. */
  reset(position: number): void {
    this.events = this.state.down ? [{ beat: position, down: true }] : [];
    this.set(this.state.down);
  }

  /** Điểm 0..1 theo các khoảng đã quy về cùng trục với vị trí ghi sự kiện. */
  score(ranges: readonly PedalRange[], endPosition: number): number {
    return pedalQuality(ranges, this.events, endPosition);
  }
}
