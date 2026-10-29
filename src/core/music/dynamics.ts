/**
 * Sắc thái mạnh – nhẹ (p, mf, f…): lực gõ khi phát mẫu và chấm "mạnh nhẹ" TƯƠNG ĐỐI giữa các đoạn.
 *
 * Không đo được độ to tuyệt đối (micro xa/gần, iPad đặt khác chỗ), nên chỉ so sánh đoạn liền kề: chỗ đổi từ p sang f
 * thì đoạn f phải to hơn đoạn p (trung vị độ to các nốt) ít nhất `FULL_STEP_DB`. Độ to một nốt:
 *  - đàn MIDI: velocity (Note On) → dB theo đường cong lực gõ thường gặp 40·log10(v/127);
 *  - micro: RMS của khung lúc nhận nốt → 20·log10(rms).
 * Bàn phím ảo không có lực gõ → không đo (null).
 */

export type DynamicMark = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

/** Thứ tự nhỏ → to. */
export const DYNAMIC_MARKS: readonly DynamicMark[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

/** Tên tiếng Việt để giải thích. */
export const DYNAMIC_NAMES: Record<DynamicMark, string> = {
  pp: 'rất nhẹ',
  p: 'nhẹ',
  mp: 'hơi nhẹ',
  mf: 'hơi mạnh',
  f: 'mạnh',
  ff: 'rất mạnh',
};

/** Lực gõ khi phát mẫu / xuất MIDI. */
export const DYNAMIC_VELOCITY: Record<DynamicMark, number> = { pp: 35, p: 50, mp: 65, mf: 80, f: 100, ff: 115 };

/** Chênh lệch (dB) giữa hai đoạn liền kề để được trọn điểm; 0 dB (hoặc ngược chiều) → 0 điểm. */
export const FULL_STEP_DB = 3;

/** Độ to của một sự kiện nốt (dB, tương đối); null = nguồn không đo được. */
export function loudnessDb(event: { velocity?: number; level?: number }): number | null {
  if (event.velocity !== undefined && event.velocity > 0) return 40 * Math.log10(event.velocity / 127);
  if (event.level !== undefined && event.level > 0) return 20 * Math.log10(event.level);
  return null;
}

export interface DynamicSection {
  mark: DynamicMark;
  /** Chỉ số nốt (gồm dấu lặng) đầu đoạn, cuối đoạn (không gồm). */
  from: number;
  to: number;
}

/** Dấu sắc thái (đặt ở nốt `index`) → các đoạn liền nhau; nốt trước dấu đầu tiên không thuộc đoạn nào. */
export function dynamicSections(marks: readonly { index: number; mark: DynamicMark }[], noteCount: number): DynamicSection[] {
  const sorted = [...marks].sort((a, b) => a.index - b.index);
  const out: DynamicSection[] = [];
  sorted.forEach((m, i) => {
    const to = i + 1 < sorted.length ? sorted[i + 1].index : noteCount;
    if (to > m.index) out.push({ mark: m.mark, from: m.index, to });
  });
  return out;
}

/** Dấu sắc thái đang có hiệu lực ở từng nốt (undefined trước dấu đầu tiên). */
export function dynamicAt(marks: readonly { index: number; mark: DynamicMark }[], noteCount: number): (DynamicMark | undefined)[] {
  const out: (DynamicMark | undefined)[] = Array.from({ length: noteCount }, () => undefined);
  for (const s of dynamicSections(marks, noteCount)) for (let i = s.from; i < s.to; i++) out[i] = s.mark;
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Điểm sắc thái 0..1: trung bình trên các chỗ đổi sắc thái (hai đoạn liền kề, khác dấu) đo được.
 * Một đoạn đo được khi có ≥ 2 nốt có độ to (hoặc mọi nốt của đoạn nếu đoạn ít hơn 2 nốt).
 * `loudness[i]` = dB của nốt i (null = không đánh / không đo). Trả về null khi không có chỗ đổi nào đo được.
 */
export function dynamicsQuality(sections: readonly DynamicSection[], loudness: readonly (number | null)[], playable: readonly boolean[]): number | null {
  const levels = sections.map((s) => {
    const values: number[] = [];
    let notes = 0;
    for (let i = s.from; i < s.to; i++) {
      if (!playable[i]) continue;
      notes++;
      const v = loudness[i];
      if (v !== null && v !== undefined) values.push(v);
    }
    return values.length >= Math.min(2, notes) && values.length > 0 ? median(values) : null;
  });
  const scores: number[] = [];
  for (let i = 1; i < sections.length; i++) {
    const a = levels[i - 1];
    const b = levels[i];
    const dir = Math.sign(DYNAMIC_MARKS.indexOf(sections[i].mark) - DYNAMIC_MARKS.indexOf(sections[i - 1].mark));
    if (dir === 0 || a === null || b === null) continue;
    scores.push(Math.max(0, Math.min(1, (dir * (b - a)) / FULL_STEP_DB)));
  }
  return scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
}
