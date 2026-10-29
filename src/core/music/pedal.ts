/**
 * Pedal vang (sustain, đàn MIDI gửi Control Change 64): ký hiệu đạp – nhả trên bản nhạc và chấm kỹ thuật pedal.
 *
 * Ký hiệu: mỗi khoảng `PedalRange` = đạp ở đầu khoảng, giữ, nhả ở cuối khoảng (vẽ "Ped." + đường kẻ dưới khuông).
 * Hai khoảng liền nhau = THAY pedal (nhả rồi đạp lại ngay sau khi đánh nốt đầu ô mới — "pedal nối").
 *
 * Chấm (`pedalQuality`): từ chuỗi sự kiện đạp / nhả → các lần đạp [down, up]. Mỗi khoảng ký hiệu được
 * nửa điểm khi có lần đạp bắt đầu trong cửa sổ quanh đầu khoảng (cho phép đạp ngay SAU khi đánh, đúng kỹ thuật
 * pedal nối), thêm nửa điểm khi lần đạp đó được giữ tới và nhả quanh cuối khoảng. Lần đạp không khớp ký hiệu nào
 * (đạp thừa) tính vào mẫu số. Micro và bàn phím ảo không có pedal → tiêu chí "không đo".
 */

export interface PedalRange {
  /** Đầu / cuối khoảng, tính bằng nốt đen từ đầu bài. */
  startBeat: number;
  endBeat: number;
}

export interface PedalEvent {
  beat: number;
  down: boolean;
}

/** Đạp muộn tối đa sau đầu khoảng (nốt đen) — đạp sau khi đánh là đúng kỹ thuật. */
export const PEDAL_DOWN_LATE = 1;
/** Đạp sớm tối đa trước đầu khoảng, khi ngay trước đó có khoảng khác (đang thay pedal). */
export const PEDAL_DOWN_EARLY = 0.5;
/** Nhả lệch tối đa quanh cuối khoảng. */
export const PEDAL_UP_TOLERANCE = 0.5;
/** Lần đạp ngắn hơn chừng này (nốt đen) coi như chạm nhầm, không tính đạp thừa. */
export const PEDAL_BLIP = 0.25;

const EPS = 1e-9;

/** Sự kiện đạp / nhả (theo thời gian) → các lần đạp; chưa nhả tới cuối thì `up = Infinity`. */
export function pedalIntervals(events: readonly PedalEvent[]): { down: number; up: number }[] {
  const out: { down: number; up: number }[] = [];
  let downAt: number | null = null;
  for (const e of events) {
    if (e.down && downAt === null) downAt = e.beat;
    else if (!e.down && downAt !== null) {
      out.push({ down: downAt, up: e.beat });
      downAt = null;
    }
  }
  if (downAt !== null) out.push({ down: downAt, up: Infinity });
  return out;
}

/**
 * Điểm pedal 0..1. `endBeat` = hết bài: khoảng kết thúc ở cuối bài thì nhả muộn (hoặc chưa nhả) vẫn được.
 * Không có ký hiệu → 1 nếu không đạp, giảm theo số lần đạp thừa.
 */
export function pedalQuality(ranges: readonly PedalRange[], events: readonly PedalEvent[], endBeat: number): number {
  const intervals = pedalIntervals(events);
  const used = intervals.map(() => false);
  let sum = 0;
  ranges.forEach((r, i) => {
    const chained = i > 0 && Math.abs(ranges[i - 1].endBeat - r.startBeat) < EPS;
    const len = r.endBeat - r.startBeat;
    // Khoảng đứng đầu một chuỗi: đạp sẵn sớm bao nhiêu cũng được, miễn là sau khoảng trước.
    const lo = chained ? r.startBeat - PEDAL_DOWN_EARLY : i > 0 ? ranges[i - 1].endBeat : -Infinity;
    const hi = r.startBeat + Math.min(PEDAL_DOWN_LATE, len / 2);
    const k = intervals.findIndex((iv, j) => !used[j] && iv.down >= lo - EPS && iv.down <= hi + EPS);
    if (k < 0) return;
    used[k] = true;
    sum += 0.5;
    const tol = Math.min(PEDAL_UP_TOLERANCE, len / 2);
    const up = intervals[k].up;
    const atEnd = r.endBeat >= endBeat - EPS;
    if (up >= r.endBeat - tol - EPS && (atEnd || up <= r.endBeat + tol + EPS)) sum += 0.5;
  });
  const strays = intervals.filter((iv, j) => !used[j] && Math.min(iv.up, endBeat) - iv.down > PEDAL_BLIP).length;
  const total = ranges.length + strays;
  return total === 0 ? 1 : sum / total;
}

/** Phát mẫu: nốt bắt đầu trong khoảng đạp pedal ngân tới hết khoảng (như tiếng đàn thật). */
export function sustainUnderPedal<T extends { startBeat: number; durationBeats: number }>(notes: readonly T[], ranges: readonly PedalRange[]): T[] {
  return notes.map((n) => {
    const r = ranges.find((x) => n.startBeat >= x.startBeat - EPS && n.startBeat < x.endBeat - EPS);
    return r && r.endBeat - n.startBeat > n.durationBeats ? { ...n, durationBeats: r.endBeat - n.startBeat } : n;
  });
}
