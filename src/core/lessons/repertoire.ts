/**
 * Tuyển tập 50 bài khuông đôi hay được tập piano (chỉ hiện ở trang Thư viện bài hát).
 * Mọi bài đều hai tay + có ký hiệu pedal + chọn được tay (màn Luyện tập chấm pedal khi có đàn MIDI).
 *
 * Giai điệu: phạm vi công cộng, chép lại đơn giản hoá (có bài dịch giọng / lên quãng 8, thay dấu lặng bằng ngân nốt trước vì
 * bài thư viện không có dấu lặng). Phần đệm tay trái tự soạn: dựng từ dòng hợp âm (`chords`) + kiểu đệm (`pattern`).
 * Pedal suy từ hợp âm: thay mỗi ô có MỘT hợp âm; ô đổi hợp âm giữa chừng không đạp (tránh nhoè), ô lấy đà không đạp.
 */
import { DURATION_BEATS, type Duration, type LessonSection } from './types';
import type { KeySignature } from '../music/keySignature';

/** Hợp âm tay trái: ba nốt thấp → cao (ngón 5-3-1), đỉnh ≤ La giáng 3 để luôn thấp hơn giai điệu. */
const VOICINGS: Record<string, [string, string, string]> = {
  C: ['C3', 'E3', 'G3'],
  C7: ['C3', 'E3', 'Bb3'],
  Cm: ['C3', 'Eb3', 'G3'],
  'C#m': ['C#3', 'E3', 'G#3'],
  D: ['D3', 'F#3', 'A3'],
  D7: ['A2', 'C3', 'F#3'],
  Dm: ['D3', 'F3', 'A3'],
  E: ['E2', 'G#2', 'B2'],
  E7: ['E2', 'G#2', 'D3'],
  Em: ['E2', 'G2', 'B2'],
  F: ['F2', 'A2', 'C3'],
  'F#m': ['F#2', 'A2', 'C#3'],
  G: ['G2', 'B2', 'D3'],
  G7: ['G2', 'B2', 'F3'],
  Gm: ['G2', 'Bb2', 'D3'],
  'G#7': ['G#2', 'B#2', 'F#3'],
  A: ['A2', 'C#3', 'E3'],
  A7: ['A2', 'C#3', 'G3'],
  Am: ['A2', 'C3', 'E3'],
  Bb: ['Bb2', 'D3', 'F3'],
  B7: ['B2', 'D#3', 'A3'],
  Bm: ['B2', 'D3', 'F#3'],
};

/**
 * Kiểu đệm: `hold` giữ hợp âm; `arp` rải theo phách (ô 4 phách lên – xuống); `arp8` rải móc đơn;
 * `alberti` thấp – cao – giữa – cao; `oompah` nốt trầm rồi hai nốt trên.
 */
export type LhPattern = 'hold' | 'arp' | 'arp8' | 'alberti' | 'oompah';

const NOTE_VALUES: [number, Duration][] = (Object.entries(DURATION_BEATS) as [Duration, number][]).map(([d, b]) => [b, d] as [number, Duration]).sort((a, b) => b[0] - a[0]);

/** Độ dài (nốt đen) → các trường độ ghi được, dài trước. */
function durations(beats: number): Duration[] {
  const out: Duration[] = [];
  let left = beats;
  for (const [b, d] of NOTE_VALUES) {
    while (left >= b - 1e-9) {
      out.push(d);
      left -= b;
    }
  }
  if (left > 1e-9) throw new Error(`Không ghi được độ dài ${beats} phách`);
  return out;
}

function token(pitches: string[], fingers: string[] | null, duration: Duration): string {
  return `${pitches.join('+')}/${duration}${fingers ? `:${fingers.join('+')}` : ''}`;
}

/** Một hợp âm dài `beats` phách theo kiểu đệm. `showFingers`: ghi số ngón (lần đầu gặp hợp âm này). */
function segment(chord: string, beats: number, pattern: LhPattern, compound: boolean, showFingers: boolean): string[] {
  const v = VOICINGS[chord];
  if (!v) throw new Error(`Chưa có thế tay cho hợp âm "${chord}"`);
  const single = (i: number, d: Duration, first: boolean) => token([v[i]], first && showFingers ? [['5', '3', '1'][i]] : null, d);
  if (pattern === 'hold') return durations(beats).map((d, i) => token([...v], i === 0 && showFingers ? ['5', '3', '1'] : null, d));
  if (pattern === 'oompah') {
    const unit = compound ? 1.5 : beats <= 1.5 && beats !== 1 ? 0.5 : 1;
    const count = Math.round(beats / unit);
    if (Math.abs(count * unit - beats) > 1e-9) throw new Error(`Không chia được ${beats} phách`);
    const [d] = durations(unit);
    return Array.from({ length: count }, (_, i) =>
      i % 2 === 0 && (i === 0 || count === 4) ? token([v[0]], i === 0 && showFingers ? ['5'] : null, d) : token([v[1], v[2]], i === 1 && showFingers ? ['3', '1'] : null, d),
    );
  }
  const unit = pattern === 'arp' && !compound && beats >= 3 ? 1 : pattern === 'arp' && !compound && beats === 1 ? 1 : 0.5;
  const count = Math.round(beats / unit);
  if (Math.abs(count * unit - beats) > 1e-9) throw new Error(`Không chia được ${beats} phách`);
  const order = pattern === 'alberti' ? [0, 2, 1, 2] : compound || count === 3 ? [0, 1, 2] : [0, 1, 2, 1];
  const [d] = durations(unit);
  return Array.from({ length: count }, (_, i) => single(order[i % order.length], d, i < 3));
}

/** Hai hợp âm trong ô 3 phách: 2 + 1; còn lại chia đều. */
function chordLengths(count: number, full: number): number[] {
  if (count === 2 && full === 3) return [2, 1];
  if (count === 2 && full === 4.5) return [3, 1.5];
  return Array.from({ length: count }, () => full / count);
}

export interface RepertoireDef {
  /** Phần sau "rep-" của id. */
  id: string;
  title: string;
  description: string;
  time: [number, 4 | 8];
  key?: KeySignature;
  pickup?: number;
  difficulty: 1 | 2 | 3;
  tempo: number;
  source: string;
  sections?: LessonSection[];
  notation: string;
  /** Hợp âm từng ô, ngăn bằng "|"; một ô có thể 2–3 hợp âm cách nhau bởi dấu cách. Ô lấy đà không ghi (tự nghỉ). */
  chords: string;
  pattern: LhPattern;
  /** Tay trái viết tay, thay cho `chords` + `pattern`. */
  left?: { notation: string; pedal: { from: number; to: number }[] };
}

/** Dòng hợp âm → ký hiệu phần đệm + pedal (chỉ số ô gồm cả ô lấy đà). */
export function buildAccompaniment(def: Pick<RepertoireDef, 'time' | 'pickup' | 'chords' | 'pattern'>): { notation: string; pedal: { from: number; to: number }[] } {
  const full = (def.time[0] * 4) / def.time[1];
  const compound = def.time[1] === 8 && def.time[0] % 3 === 0 && def.time[0] > 3;
  const pickupMeasures = def.pickup ? 1 : 0;
  const parts: string[] = def.pickup ? durations(def.pickup).map((d) => `R/${d}`) : [];
  const pedal: { from: number; to: number }[] = [];
  const seen = new Set<string>();
  def.chords
    .split('|')
    .map((m) => m.trim().split(/\s+/))
    .forEach((chords, m) => {
      if (chords.length === 1) pedal.push({ from: m + pickupMeasures, to: m + pickupMeasures });
      const lengths = chordLengths(chords.length, full);
      chords.forEach((chord, c) => {
        parts.push(...segment(chord, lengths[c], def.pattern, compound, !seen.has(chord)));
        seen.add(chord);
      });
    });
  return { notation: parts.join(' '), pedal };
}

const PD = 'phạm vi công cộng; đơn giản hoá, phần đệm tự soạn';

export const REPERTOIRE_DEFS: RepertoireDef[] = [
  // ── Nhập môn: bài thiếu nhi, dân ca ───────────────────────────────
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle (hai tay)',
    description: 'Bài hai tay đầu tiên: tay trái giữ hợp âm, đổi pedal theo hợp âm.',
    time: [4, 4],
    difficulty: 1,
    tempo: 80,
    source: `Dân ca Pháp thế kỷ 18 — ${PD}`,
    notation:
      'C4 C4 G4 G4 | A4 A4 G4/h | F4 F4 E4 E4 | D4 D4 C4/h | G4 G4 F4 F4 | E4 E4 D4/h | ' +
      'G4 G4 F4 F4 | E4 E4 D4/h | C4 C4 G4 G4 | A4 A4 G4/h | F4 F4 E4 E4 | D4 D4 C4/h',
    chords: 'C | F | F | G C | C | C | C | G | C | F | F | G C',
    pattern: 'hold',
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb (hai tay)',
    description: 'Bốn nốt tay phải, tay trái chỉ đổi giữa Đô và Sol.',
    time: [4, 4],
    difficulty: 1,
    tempo: 84,
    source: `Lowell Mason (1830s) — ${PD}`,
    notation: 'E4 D4 C4 D4 | E4 E4 E4/h | D4 D4 D4/h | E4 G4 G4/h | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4/w',
    chords: 'C | C | G | C | C | C | G | C',
    pattern: 'hold',
  },
  {
    id: 'frere-jacques',
    title: 'Kìa con bướm vàng (hai tay)',
    description: 'Giai điệu "Frère Jacques" ở quãng 8 trên, tay trái một hợp âm Đô, pedal thay mỗi ô.',
    time: [4, 4],
    difficulty: 1,
    tempo: 84,
    source: `Dân ca Pháp — ${PD}`,
    notation:
      'C5 D5 E5 C5 | C5 D5 E5 C5 | E5 F5 G5/h | E5 F5 G5/h | G5/8 A5/8 G5/8 F5/8 E5 C5 | ' +
      'G5/8 A5/8 G5/8 F5/8 E5 C5 | C5 G4 C5/h | C5 G4 C5/h',
    chords: 'C | C | C | C | C | C | C | C',
    pattern: 'arp',
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (hai tay)',
    description: 'Điệp khúc Giáng sinh, tay trái nốt trầm – hợp âm.',
    time: [4, 4],
    difficulty: 1,
    tempo: 100,
    source: `James Lord Pierpont (1857) — ${PD}`,
    notation:
      'E4 E4 E4/h | E4 E4 E4/h | E4 G4 C4/qd D4/8 | E4/w | F4 F4 F4/qd F4/8 | F4 E4 E4 E4/8 E4/8 | E4 D4 D4 E4 | D4/h G4/h | ' +
      'E4 E4 E4/h | E4 E4 E4/h | E4 G4 C4/qd D4/8 | E4/w | F4 F4 F4/qd F4/8 | F4 E4 E4 E4/8 E4/8 | G4 G4 F4 D4 | C4/w',
    chords: 'C | C | C | C | F | C | D7 | G | C | C | C | C | F | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'happy-birthday',
    title: 'Happy Birthday (hai tay)',
    description: 'Chúc mừng sinh nhật nhịp 3/4, tay trái kiểu van-xơ.',
    time: [3, 4],
    pickup: 1,
    difficulty: 1,
    tempo: 92,
    source: `Patty & Mildred Hill (1893) — ${PD}`,
    notation: 'G4/8d G4/16 | A4 G4 C5 | B4/h G4/8d G4/16 | A4 G4 D5 | C5/h G4/8d G4/16 | G5 E5 C5 | B4 A4 F5/8d F5/16 | E5 C5 D5 | C5/hd',
    chords: 'C | G | G | C | C | F | C G | C',
    pattern: 'oompah',
  },
  {
    id: 'london-bridge',
    title: 'London Bridge (hai tay)',
    description: 'Đồng dao Anh, tay trái giữ hợp âm Đô – Sol.',
    time: [4, 4],
    difficulty: 1,
    tempo: 92,
    source: `Đồng dao Anh — ${PD}`,
    notation: 'G4/qd A4/8 G4 F4 | E4 F4 G4/h | D4 E4 F4/h | E4 F4 G4/h | G4/qd A4/8 G4 F4 | E4 F4 G4/h | D4/h G4 E4 | C4/w',
    chords: 'C | C | G | C | C | C | G | C',
    pattern: 'hold',
  },
  {
    id: 'au-clair',
    title: 'Au clair de la lune (hai tay)',
    description: 'Dân ca Pháp ở quãng 8 trên, tay trái rải hợp âm theo phách.',
    time: [4, 4],
    difficulty: 1,
    tempo: 84,
    source: `Dân ca Pháp — ${PD}`,
    notation:
      'C5 C5 C5 D5 | E5/h D5/h | C5 E5 D5 D5 | C5/w | C5 C5 C5 D5 | E5/h D5/h | C5 E5 D5 D5 | C5/w | ' +
      'D5 D5 D5 D5 | A4/h A4/h | D5 C5 B4 A4 | G4/w | C5 C5 C5 D5 | E5/h D5/h | C5 E5 D5 D5 | C5/w',
    chords: 'C | C G | G | C | C | C G | G | C | G | D7 | D7 | G | C | C G | G | C',
    pattern: 'arp',
  },
  {
    id: 'old-macdonald',
    title: 'Old MacDonald (hai tay)',
    description: 'Sol trưởng, tay trái nốt trầm – hợp âm vui nhộn.',
    time: [4, 4],
    key: 'G',
    difficulty: 1,
    tempo: 100,
    source: `Dân ca — ${PD}`,
    notation: 'G4 G4 G4 D4 | E4 E4 D4/h | B4 B4 A4 A4 | G4/hd D4 | G4 G4 G4 D4 | E4 E4 D4/h | B4 B4 A4 A4 | G4/w',
    chords: 'G | C G | G D7 | G | G | C G | G D7 | G',
    pattern: 'oompah',
  },
  {
    id: 'row-boat',
    title: 'Row, Row, Row Your Boat (hai tay)',
    description: 'Nhịp 6/8: tay trái rải đều móc đơn, cả bài một hợp âm chính.',
    time: [6, 8],
    difficulty: 2,
    tempo: 80,
    source: `Bài hát thiếu nhi Mỹ (1852) — ${PD}`,
    notation:
      'C4/qd C4/qd | C4 D4/8 E4/qd | E4 D4/8 E4 F4/8 | G4/hd | C5/8 C5/8 C5/8 G4/8 G4/8 G4/8 | E4/8 E4/8 E4/8 C4/8 C4/8 C4/8 | G4 F4/8 E4 D4/8 | C4/hd',
    chords: 'C | C | C | C | C | C | G | C',
    pattern: 'arp8',
  },
  {
    id: 'yankee-doodle',
    title: 'Yankee Doodle (hai tay)',
    description: 'Dân ca Mỹ tươi vui, tay trái đổi hợp âm Sol – Rê – Đô.',
    time: [4, 4],
    key: 'G',
    difficulty: 1,
    tempo: 100,
    source: `Dân ca Mỹ — ${PD}`,
    notation: 'G4 G4 A4 B4 | G4 B4 A4 D4 | G4 G4 A4 B4 | G4/h F#4/h | G4 G4 A4 B4 | C5 B4 A4 G4 | F#4 D4 E4 F#4 | G4/h G4/h',
    chords: 'G | G D7 | G | G D7 | G | C | D7 | G',
    pattern: 'oompah',
  },
  {
    id: 'oh-susanna',
    title: 'Oh! Susanna (hai tay)',
    description: 'Stephen Foster, có nhịp lấy đà, tay trái rải hợp âm.',
    time: [4, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 96,
    source: `Stephen Foster (1848) — ${PD}`,
    notation:
      'C4/8 D4/8 | E4 G4 G4/qd A4/8 | G4 E4 C4/qd D4/8 | E4 E4 D4 C4 | D4/hd C4/8 D4/8 | E4 G4 G4/qd A4/8 | G4 E4 C4/qd D4/8 | E4 E4 D4 D4 | C4/w',
    chords: 'C | C | C | G | C | C | G | C',
    pattern: 'arp',
  },
  {
    id: 'clementine',
    title: 'Oh My Darling, Clementine (hai tay)',
    description: 'Dân ca Mỹ nhịp 3/4 ở quãng 8 trên, tay trái kiểu van-xơ.',
    time: [3, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 92,
    source: `Dân ca Mỹ (1884) — ${PD}`,
    notation:
      'C5/8 C5/8 | C5 G4 E5/8 E5/8 | E5 C5 C5/8 E5/8 | G5/qd G5/8 F5/8 E5/8 | D5/h D5/8 E5/8 | F5 F5 E5/8 D5/8 | E5 C5 C5/8 E5/8 | D5/qd G4/8 B4/8 D5/8 | C5/hd',
    chords: 'C | C | C | G | G | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'sakura',
    title: 'Sakura (hai tay)',
    description: 'Dân ca Nhật, âm giai ngũ cung, tay trái rải chậm với pedal thay mỗi ô.',
    time: [4, 4],
    key: 'Am',
    difficulty: 2,
    tempo: 66,
    source: `Dân ca Nhật Bản — ${PD}`,
    notation:
      'A4 A4 B4/h | A4 A4 B4/h | A4 B4 C5 B4 | A4 B4/8 A4/8 F4/h | E4 C4 E4 F4 | E4 E4/8 C4/8 B3/h | ' +
      'A4 B4 C5 B4 | A4 B4/8 A4/8 F4/h | E4 C4 E4 F4 | E4 E4/8 C4/8 B3/h | A4 A4 B4/h | A4 A4 B4/h | E4 F4 B4/8 A4/8 F4 | E4/w',
    chords: 'Am | Am | Am | F | Am | E | Am | F | Am | E | Am | Am | F | E',
    pattern: 'arp',
  },
  // ── Dân ca, nhạc đại chúng ────────────────────────────────────────
  {
    id: 'kumbaya',
    title: 'Kumbaya (hai tay)',
    description: 'Giai điệu chậm rãi, hợp để tập đổi pedal mỗi ô cho liền tiếng.',
    time: [4, 4],
    difficulty: 1,
    tempo: 72,
    source: `Spiritual Mỹ — ${PD}`,
    notation: 'C4 E4 G4/h | A4/h G4/h | C4 E4 G4/h | F4 E4 D4/h | C4 E4 G4/h | A4/h G4/h | F4 E4 D4 D4 | C4/w',
    chords: 'C | F | C | G | C | F | G | C',
    pattern: 'arp',
  },
  {
    id: 'aura-lee',
    title: 'Aura Lee (hai tay)',
    description: 'Ballad Mỹ 1861, Sol trưởng, tay trái rải đều.',
    time: [4, 4],
    key: 'G',
    difficulty: 2,
    tempo: 76,
    source: `W. W. Fosdick & G. R. Poulton (1861) — ${PD}`,
    notation:
      'D4 G4 F#4 G4 | A4 E4 A4/h | G4 F#4 E4 F#4 | G4/w | D4 G4 F#4 G4 | A4 E4 A4/h | G4 F#4 E4 F#4 | G4/w | ' +
      'B4 B4 B4/h | B4 B4 B4/h | B4 A4 G4 A4 | B4/w | B4 B4 C5 B4 | A4 E4 A4/h | G4 F#4 E4 F#4 | G4/w',
    chords: 'G | A7 | D7 | G | G | A7 | D7 | G | E7 | Am | D7 | G | E7 | Am | D7 | G',
    pattern: 'arp',
  },
  {
    id: 'when-the-saints',
    title: 'When the Saints (hai tay)',
    description: 'Phúc âm New Orleans, tay trái nốt trầm – hợp âm giữ nhịp.',
    time: [4, 4],
    pickup: 3,
    difficulty: 2,
    tempo: 104,
    source: `Spiritual Mỹ — ${PD}`,
    notation:
      'C4 E4 F4 | G4/w | G4 C4 E4 F4 | G4/w | G4 C4 E4 F4 | G4/h E4/h | C4/h E4/h | D4/w | ' +
      'D4 E4 E4 D4 | C4/qd C4/8 E4 G4 | G4 G4 F4/h | F4 E4 F4 G4 | E4/h C4/h | D4/h D4/h | C4/w',
    chords: 'C | C | C | C | C | C | G | G | C | C | F | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'scarborough-fair',
    title: 'Scarborough Fair (hai tay)',
    description: 'Dân ca Anh điệu Rê thứ cổ, tay trái rải trầm với pedal thay mỗi ô.',
    time: [3, 4],
    key: 'Dm',
    difficulty: 2,
    tempo: 84,
    source: `Dân ca Anh — ${PD}`,
    notation:
      'D4/h D4 | A4/h A4 | E4/qd F4/8 E4 | D4/hd | A4/h C5 | D5/h C5 | A4 B4 G4 | A4/hd | ' +
      'D5/h D5 | D5/h C5 | A4/h A4 | G4 F4 E4 | D4/h C4 | D4 A4 G4 | F4 E4 D4 | D4/hd',
    chords: 'Dm | Dm | C | Dm | F | C | G | Am | F | C | Am | G | Dm | Dm | C | Dm',
    pattern: 'arp',
  },
  {
    id: 'danny-boy',
    title: 'Danny Boy (hai tay)',
    description: 'Giai điệu "Londonderry Air" trữ tình của Ireland, trường độ dài, rất hợp tập pedal.',
    time: [4, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 66,
    source: `Dân ca Ireland, "Londonderry Air" — ${PD}`,
    notation:
      'C4/8 D4/8 | E4/qd D4/8 E4 A4 | G4/qd E4/8 D4 C4 | A3/hd C4 | E4/hd D4/8 C4/8 | ' +
      'E4/h F4/h | G4/qd A4/8 G4 E4 | C4 D4 E4 D4 | C4/w',
    chords: 'C | C | F | C | C | C | G | C',
    pattern: 'arp',
  },
  {
    id: 'my-bonnie',
    title: 'My Bonnie (hai tay)',
    description: 'Dân ca Scotland nhịp 3/4, tay trái kiểu van-xơ.',
    time: [3, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 104,
    source: `Dân ca Scotland — ${PD}`,
    notation:
      'G4 | E5/qd D5/8 C5 | D5 C5 A4 | G4/h E4 | E4/h G4 | E5/qd D5/8 C5 | C5 B4 C5 | D5/hd | D5/h G4 | ' +
      'E5/qd D5/8 C5 | D5 C5 A4 | G4/h E4 | E4/h E4 | D4 G4 B4 | A4 B4 D5 | C5/hd',
    chords: 'C | F | C | C | C | D7 | G | G | C | F | C | C | G | G | C',
    pattern: 'oompah',
  },
  {
    id: 'camptown-races',
    title: 'Camptown Races (hai tay)',
    description: 'Stephen Foster, nhịp 2/4 nhanh, tay trái nốt trầm – hợp âm.',
    time: [2, 4],
    difficulty: 2,
    tempo: 92,
    source: `Stephen Foster (1850) — ${PD}`,
    notation:
      'G4/8 G4/8 E4/8 G4/8 | A4/8 G4/8 E4 | E4/8 D4/8 E4/8 D4/8 | D4/h | G4/8 G4/8 E4/8 G4/8 | A4/8 G4/8 E4 | D4 E4/8 D4/8 | C4/h | ' +
      'C4/8 E4/8 G4/8 C5/8 | A4/8 A4/8 C5/8 A4/8 | G4/8 G4/8 E4/8 G4/8 | D4/h | G4/8 G4/8 E4/8 G4/8 | A4/8 G4/8 E4 | D4 E4/8 D4/8 | C4/h',
    chords: 'C | C | G | G | C | C | G | C | C | F | C | G | C | C | G | C',
    pattern: 'oompah',
  },
  // ── Giáng sinh ────────────────────────────────────────────────────
  {
    id: 'joy-to-the-world',
    title: 'Joy to the World (hai tay)',
    description: 'Thánh ca Giáng sinh, câu mở đầu đi xuống cả gam Đô trưởng.',
    time: [2, 4],
    difficulty: 2,
    tempo: 76,
    source: `Lowell Mason / Isaac Watts (1719–1839) — ${PD}`,
    notation:
      'C5 B4/8d A4/16 | G4/qd F4/8 | E4 D4 | C4/qd G4/8 | A4/qd A4/8 | B4/qd B4/8 | C5/qd C5/8 | C5/8 B4/8 A4/8 G4/8 | ' +
      'G4/8d F4/16 E4/8 C5/8 | C5/8 B4/8 A4/8 G4/8 | G4/8d F4/16 E4/8 E4/8 | E4/8 E4/8 E4/8 E4/16 F4/16 | ' +
      'G4/qd F4/16 E4/16 | D4/8 D4/8 D4/8 D4/16 E4/16 | F4/qd E4/16 D4/16 | C4/8 C5 A4/8 | G4/8d F4/16 E4/8 F4/8 | E4 D4 | C4/h',
    chords: 'C | F | C G | C | F | G | C | C | C | C | C | C | C | G | G | C F | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'o-come',
    title: 'O Come, All Ye Faithful (hai tay)',
    description: 'Thánh ca Adeste Fideles, có nhịp lấy đà, tay trái giữ hợp âm trang trọng.',
    time: [4, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 84,
    source: `Adeste Fideles, John Francis Wade (thế kỷ 18) — ${PD}`,
    notation:
      'C5 | C5/h G4 C5 | D5/h G4/h | E5 D5 E5 F5 | E5/h D5 C5 | C5/h B4 A4 | B4 C5 D5 E5 | B4/qd A4/8 G4/h | ' +
      'G4/hd C5 | C5 B4 C5 D5 | C5/h G4 E5 | E5 D5 E5 F5 | E5/h D5 E5 | F5 E5 D5 C5 | B4/h C5 F5 | E5/h D5/qd C5/8 | C5/w',
    chords: 'C | G | C | C | F | G | G | G | C | C | C | C | F | G | C G | C',
    pattern: 'hold',
  },
  {
    id: 'deck-the-halls',
    title: 'Deck the Halls (hai tay)',
    description: 'Dân ca xứ Wales rộn ràng, tay trái rải hợp âm.',
    time: [4, 4],
    difficulty: 2,
    tempo: 104,
    source: `Dân ca xứ Wales — ${PD}`,
    notation:
      'G4/qd F4/8 E4 D4 | C4 D4 E4 C4 | D4/8 E4/8 F4/8 D4/8 E4/qd D4/8 | C4 B3 C4/h | G4/qd F4/8 E4 D4 | C4 D4 E4 C4 | D4/8 E4/8 F4/8 D4/8 E4/qd D4/8 | C4 B3 C4/h | ' +
      'D4/qd E4/8 F4 D4 | E4/qd F4/8 G4 D4 | E4/8 F#4/8 G4 A4/8 B4/8 C5 | B4 A4 G4/h | G4/qd F4/8 E4 D4 | C4 D4 E4 C4 | A4/8 A4/8 A4/8 A4/8 G4/qd F4/8 | E4 D4 C4/h',
    chords: 'C | C | G | G C | C | C | G | G C | G | C | D7 | G | C | C | F | G C',
    pattern: 'arp',
  },
  {
    id: 'we-wish',
    title: 'We Wish You a Merry Christmas (hai tay)',
    description: 'Nhịp 3/4 vui tươi, tay trái kiểu van-xơ.',
    time: [3, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 112,
    source: `Dân ca Anh — ${PD}`,
    notation:
      'G4 | C5 C5/8 D5/8 C5/8 B4/8 | A4 A4 A4 | D5 D5/8 E5/8 D5/8 C5/8 | B4 G4 G4 | E5 E5/8 F5/8 E5/8 D5/8 | C5 A4 G4/8 G4/8 | A4 D5 B4 | C5/h G4 | ' +
      'C5 C5 C5 | B4/h B4 | C5 B4 A4 | G4/h D5 | E5 D5 C5 | G5 G4 G4/8 G4/8 | A4 D5 B4 | C5/hd',
    chords: 'C | F | D7 | G | C | F | G | C | C | G | C | G | C | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'hark-the-herald',
    title: 'Hark! The Herald Angels Sing (hai tay)',
    description: 'Giai điệu Mendelssohn, hợp âm dày, tay trái rải theo phách.',
    time: [4, 4],
    difficulty: 3,
    tempo: 92,
    source: `Felix Mendelssohn (1840) — ${PD}`,
    notation:
      'G4 C5 C5/qd B4/8 | C5 E5 E5 D5 | G5 G5 G5/qd F5/8 | E5 D5 E5/h | G4 C5 C5/qd B4/8 | C5 E5 E5 D5 | G5 D5 D5/qd B4/8 | B4 A4 G4/h | ' +
      'G5 G5 G5 C5 | F5 E5 E5 D5 | G5 G5 G5 C5 | F5 E5 E5 D5 | A5/qd A5/8 A5 G5 | F5 E5 F5/h | D5/8 E5/8 F5/8 G5/8 C5 C5 | D5/qd E5/8 D5 G4 | ' +
      'A5/qd A5/8 A5 G5 | F5 E5 F5/h | D5/8 E5/8 F5/8 G5/8 C5 C5 | D5/qd E5/8 C5/h',
    chords: 'C | C | G | C | C | C | D7 | G | C | F | C | F | D7 | G | C | G | D7 | G | C | G C',
    pattern: 'arp',
  },
  {
    id: 'good-king',
    title: 'Good King Wenceslas (hai tay)',
    description: 'Thánh ca, Sol trưởng, từng nhịp chắc, tay trái giữ hợp âm.',
    time: [4, 4],
    key: 'G',
    difficulty: 1,
    tempo: 92,
    source: `Giai điệu "Tempus adest floridum" (1582) — ${PD}`,
    notation:
      'G4 G4 G4 A4 | G4 G4 D4/h | E4 D4 E4 F#4 | G4/h G4/h | G4 G4 G4 A4 | G4 G4 D4/h | E4 D4 E4 F#4 | G4/h G4/h | ' +
      'D5 C5 B4 A4 | B4 A4 G4/h | E4 D4 E4 F#4 | G4/h G4/h | D4 D4 E4 F#4 | G4 G4 A4/h | D5 C5 B4 A4 | G4/h C5/h | G4/w',
    chords: 'G | G | C | G | G | G | C | G | G | G | C | G | G | C | D7 | G C | G',
    pattern: 'hold',
  },
  {
    id: 'god-rest',
    title: 'God Rest Ye Merry, Gentlemen (hai tay)',
    description: 'Thánh ca cổ Mi thứ, có nhịp lấy đà, tay trái rải hợp âm.',
    time: [4, 4],
    key: 'Em',
    pickup: 1,
    difficulty: 2,
    tempo: 96,
    source: `Thánh ca Anh — ${PD}`,
    notation:
      'E4 | E4 B4 B4 A4 | G4 F#4 E4 D4 | E4 F#4 G4 A4 | B4/hd E4 | E4 B4 B4 A4 | G4 F#4 E4 D4 | E4 F#4 G4 A4 | B4/hd B4 | ' +
      'C5 A4 B4 C5 | D5 E5 B4 A4 | G4 E4 F#4 G4 | A4/h G4 A4 | B4/h C5 B4 | B4 A4 G4 F#4 | E4/h G4/8 F#4/8 E4 | A4/h G4 A4 | B4 C5 D5 E5 | B4 A4 G4 F#4 | E4/w',
    chords: 'Em | Em | Em | Em | Em | Em | Em | Em | Am | Em | Em | D | G | B7 | Em | Am | G | B7 | Em',
    pattern: 'arp',
  },
  {
    id: 'away-in-a-manger',
    title: 'Away in a Manger (hai tay)',
    description: 'Thánh ca ru êm, nhịp 3/4, tay trái rải chậm với pedal thay mỗi ô.',
    time: [3, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 80,
    source: `James R. Murray (1887) — ${PD}`,
    notation:
      'G4 | C5 C5 D5/8 E5/8 | C5 C5 E5/8 F5/8 | G5 G5 A5 | F5/h D5/8 E5/8 | F5 F5 G5 | E5 E5 C5/8 E5/8 | D5 A4 C5 | B4/h G4 | ' +
      'C5 C5 D5/8 E5/8 | C5 C5 E5/8 F5/8 | G5 G5 A5 | F5/h D5/8 E5/8 | F5 F5 G5 | E5 E5 C5/8 E5/8 | D5 A4 B4 | C5/hd',
    chords: 'C | C | C | F | F | C | D7 | G | C | C | C | F | F | C | G | C',
    pattern: 'arp',
  },
  {
    id: 'o-christmas-tree',
    title: 'O Christmas Tree (hai tay)',
    description: 'Dân ca Đức "O Tannenbaum", nhịp 3/4 có nhịp lấy đà.',
    time: [3, 4],
    key: 'G',
    pickup: 1,
    difficulty: 2,
    tempo: 84,
    source: `Dân ca Đức — ${PD}`,
    notation:
      'D4 | G4/8d G4/16 G4 A4 | B4/8d B4/16 B4/h | B4 A4 B4 | C5 F#4 A4 | G4/h D4 | G4/8d G4/16 G4 A4 | B4/8d B4/16 B4/h | B4 A4 B4 | C5 F#4 A4 | G4/hd',
    chords: 'G | G | C | D7 | G | G | G | C | D7 | G',
    pattern: 'oompah',
  },
  // ── Cổ điển ───────────────────────────────────────────────────────
  {
    id: 'minuet-g',
    title: 'Minuet in G (hai tay)',
    description: 'Minuet Sol trưởng trong sổ tay Anna Magdalena Bach (Petzold), tay trái giữ hợp âm cả ô.',
    time: [3, 4],
    key: 'G',
    difficulty: 3,
    tempo: 100,
    source: `Christian Petzold (BWV Anh. 114) — ${PD}`,
    sections: [
      { measure: 1, label: 'A' },
      { measure: 9, label: 'A′' },
    ],
    notation:
      'D5 G4/8 A4/8 B4/8 C5/8 | D5 G4 G4 | E5 C5/8 D5/8 E5/8 F#5/8 | G5 G4 G4 | C5 D5/8 C5/8 B4/8 A4/8 | B4 C5/8 B4/8 A4/8 G4/8 | F#4 G4/8 A4/8 B4/8 G4/8 | A4/hd | ' +
      'D5 G4/8 A4/8 B4/8 C5/8 | D5 G4 G4 | E5 C5/8 D5/8 E5/8 F#5/8 | G5 G4 G4 | C5 D5/8 C5/8 B4/8 A4/8 | B4 C5/8 B4/8 A4/8 G4/8 | A4 B4/8 A4/8 G4/8 F#4/8 | G4/hd',
    chords: 'G | G | C | G | C | G | D7 | D7 | G | G | C | G | C | G | D7 | G',
    pattern: 'hold',
  },
  {
    id: 'prelude-c',
    title: 'Prelude in C (hai tay)',
    description: 'Các ô đầu Prelude Đô trưởng BWV 846: tay phải rải móc kép, tay trái giữ nốt trầm cả ô, pedal thay mỗi ô.',
    time: [4, 4],
    difficulty: 3,
    tempo: 60,
    source: `J. S. Bach (BWV 846) — ${PD}`,
    notation:
      [
        'C4 E4 G4 C5 E5 G4 C5 E5',
        'C4 D4 A4 D5 F5 A4 D5 F5',
        'B3 D4 G4 D5 F5 G4 D5 F5',
        'C4 E4 G4 C5 E5 G4 C5 E5',
        'C4 E4 A4 E5 A5 A4 E5 A5',
        'C4 D4 F#4 A4 D5 F#4 A4 D5',
        'B3 D4 G4 D5 G5 G4 D5 G5',
        'B3 C4 E4 G4 C5 E4 G4 C5',
      ]
        .map((bar) => {
          const notes = bar.split(' ').map((n) => `${n}/16`).join(' ');
          return `${notes} ${notes}`;
        })
        .join(' | ') + ' | C4/w',
    chords: '',
    pattern: 'hold',
    left: {
      notation: 'C3/w:5 | C3/w | B2/w:5 | C3/w:5 | C3/w | C3/w | B2/w:5 | B2/w | C3+G3/w:5+1',
      pedal: Array.from({ length: 9 }, (_, i) => ({ from: i, to: i })),
    },
  },
  {
    id: 'jesu-joy',
    title: 'Jesu, Joy of Man\'s Desiring (hai tay)',
    description: 'Dòng móc đơn nhịp 9/8 của Bach (Cantata BWV 147), tay trái rải đều.',
    time: [9, 8],
    key: 'G',
    difficulty: 3,
    tempo: 66,
    source: `J. S. Bach (BWV 147) — ${PD}`,
    notation:
      'G4/8 A4/8 B4/8 D5/8 C5/8 C5/8 E5/8 D5/8 D5/8 | G5/8 F#5/8 G5/8 D5/8 B4/8 G4/8 A4/8 B4/8 C5/8 | ' +
      'D5/8 E5/8 D5/8 C5/8 B4/8 A4/8 B4/8 G4/8 F#4/8 | E4/8 F#4/8 G4/8 D4/8 G4/8 F#4/8 G4/qd | ' +
      'G4/8 A4/8 B4/8 D5/8 C5/8 C5/8 E5/8 D5/8 D5/8 | G5/8 F#5/8 G5/8 D5/8 B4/8 G4/8 A4/8 B4/8 C5/8 | ' +
      'D5/8 E5/8 D5/8 C5/8 B4/8 A4/8 B4/8 G4/8 F#4/8 | G4/hd G4/qd',
    chords: 'G | G | D | C G | G | G | D | G',
    pattern: 'arp8',
  },
  {
    id: 'canon-d',
    title: 'Canon (hai tay)',
    description: 'Pachelbel, dịch sang Đô trưởng: vòng hợp âm nổi tiếng, mỗi hợp âm một ô, pedal thay đều.',
    time: [2, 4],
    difficulty: 2,
    tempo: 66,
    source: `Johann Pachelbel (khoảng 1680) — ${PD}`,
    notation:
      'E5/h | D5/h | C5/h | B4/h | A4/h | G4/h | A4/h | B4/h | C5/h | B4/h | A4/h | G4/h | F4/h | E4/h | F4/h | D4/h | ' +
      'C4 E4 | G4 F4 | E4 C4 | E4 D4 | C4 A3 | C4 G4 | F4 A4 | G4 F4 | C4/h',
    chords: 'C | G | Am | Em | F | C | F | G | C | G | Am | Em | F | C | F | G | C | G | Am | Em | F | C | F | G | C',
    pattern: 'arp',
  },
  {
    id: 'moonlight',
    title: 'Moonlight Sonata (hai tay)',
    description: 'Phỏng theo đoạn đầu chương I (Đô thăng thứ): tay trái rải chùm ba đều, tay phải hát giai điệu; bản đơn giản hoá nhịp 12/8.',
    time: [12, 8],
    key: 'C#m',
    difficulty: 3,
    tempo: 66,
    source: `L. v. Beethoven (Op. 27 số 2, 1801) — ${PD}`,
    notation: 'G#4/hd G#4/qd G#4/qd | G#4/hd G#4/qd G#4/qd | A4/hd A4/hd | G#4/hd F#4/hd | E4/hd G#4/hd | C#5/hd C#5/qd C#5/qd | B4/hd G#4/hd | G#4/hd G#4/hd',
    chords: 'C#m | C#m | A | G#7 | C#m | C#m | E G#7 | C#m',
    pattern: 'arp8',
  },
  {
    id: 'sonata-k545',
    title: 'Sonata K.545 (hai tay)',
    description: 'Chủ đề "Sonata Facile" của Mozart: tay trái Alberti, tay phải chạy gam móc kép.',
    time: [4, 4],
    difficulty: 3,
    tempo: 80,
    source: `W. A. Mozart (K. 545, 1788) — ${PD}`,
    notation:
      'C5/h E5 G5 | B4/qd C5/16 D5/16 C5/h | A5/h G5 C6 | G5 F5/8 E5/8 F5/h | ' +
      'A4/16 B4/16 C5/16 D5/16 E5/16 F5/16 G5/16 A5/16 G5/16 F5/16 E5/16 D5/16 C5/16 B4/16 A4/16 G4/16 | ' +
      'G4/16 A4/16 B4/16 C5/16 D5/16 E5/16 F5/16 G5/16 F5/16 E5/16 D5/16 C5/16 B4/16 A4/16 G4/16 F4/16 | ' +
      'F4/16 G4/16 A4/16 B4/16 C5/16 D5/16 E5/16 F5/16 E5/16 D5/16 C5/16 B4/16 A4/16 G4/16 F4/16 E4/16 | ' +
      'E4/16 F4/16 G4/16 A4/16 B4/16 C5/16 D5/16 E5/16 D5/16 C5/16 B4/16 A4/16 G4/16 F4/16 E4/16 D4/16 | C4/w',
    chords: 'C | G C | F C | G C | F | C | G | C | C',
    pattern: 'alberti',
  },
  {
    id: 'alla-turca',
    title: 'Rondo alla Turca (hai tay)',
    description: 'Khúc hành khúc Thổ Nhĩ Kỳ của Mozart, La thứ, tay trái nốt trầm – hợp âm giữ nhịp.',
    time: [2, 4],
    key: 'Am',
    pickup: 1,
    difficulty: 3,
    tempo: 88,
    source: `W. A. Mozart (K. 331, 1784) — ${PD}`,
    notation:
      'B4/16 A4/16 G#4/16 A4/16 | C5 D5/16 C5/16 B4/16 C5/16 | E5 F5/16 E5/16 D#5/16 E5/16 | B5/16 A5/16 G#5/16 A5/16 B5/16 A5/16 G#5/16 A5/16 | C6 A5/8 C6/8 | ' +
      'B5/8 A5/8 G5/8 A5/8 | B5/8 A5/8 G5/8 A5/8 | B5/8 A5/8 G5/8 F#5/8 | E5/h | ' +
      'C5/8 D5/8 E5/8 E5/8 | F5/16 E5/16 D5/16 C5/16 B4 | C5/8 D5/8 E5/8 E5/8 | F5/16 E5/16 D5/16 C5/16 B4 | ' +
      'A4/8 B4/8 C5/8 C5/8 | D5/16 C5/16 B4/16 A4/16 G#4 | A4/8 B4/8 C5/8 C5/8 | B4/8 G#4/8 A4',
    chords: 'Am | Am | Am | Am | E | Am | E | Am | C | G | C | G | Am | E | Am | E Am',
    pattern: 'oompah',
  },
  {
    id: 'sonata-k331',
    title: 'Sonata K.331, chủ đề (hai tay)',
    description: 'Chủ đề biến tấu của Mozart, La trưởng nhịp 6/8, tay trái rải đều.',
    time: [6, 8],
    key: 'A',
    difficulty: 3,
    tempo: 60,
    source: `W. A. Mozart (K. 331, 1784) — ${PD}`,
    notation:
      'C#5/8d D5/16 C#5/8 E5 E5/8 | B4/8d C#5/16 B4/8 D5 D5/8 | A5 A5/8 G#5/8 B5/8 D5/8 | C#5 B4/8 A4/qd | ' +
      'C#5/8d D5/16 C#5/8 E5 E5/8 | B4/8d C#5/16 B4/8 D5 D5/8 | A5 A5/8 G#5/8 B5/8 D5/8 | C#5 B4/8 A4/qd',
    chords: 'A | E | A E | A | A | E | A E | A',
    pattern: 'arp8',
  },
  {
    id: 'eine-kleine',
    title: 'Eine kleine Nachtmusik (hai tay)',
    description: 'Chủ đề Mozart dịch sang Đô trưởng, tay trái nốt trầm – hợp âm.',
    time: [4, 4],
    difficulty: 2,
    tempo: 96,
    source: `W. A. Mozart (K. 525, 1787) — ${PD}`,
    notation:
      'C5/qd G4/8 C5/qd G4/8 | C5/8 G4/8 C5/8 E5/8 G5/h | F5/qd D5/8 F5/qd D5/8 | F5/8 D5/8 B4/8 D5/8 G4/h | ' +
      'C5/qd G4/8 C5/qd G4/8 | C5/8 G4/8 C5/8 E5/8 G5/h | F5/qd D5/8 F5/qd D5/8 | B4/8 D5/8 G4/8 B4/8 C5/h',
    chords: 'C | C | G | G | C | C | G | G C',
    pattern: 'oompah',
  },
  {
    id: 'sonatina-clementi',
    title: 'Sonatina Op. 36 số 1 (hai tay)',
    description: 'Chủ đề Clementi — bài sonatina đầu tiên của nhiều người học, tay trái Alberti.',
    time: [4, 4],
    difficulty: 3,
    tempo: 88,
    source: `Muzio Clementi (Op. 36, 1797) — ${PD}`,
    notation:
      'C5 E5/8 C5/8 G4 G4 | C5 E5/8 C5/8 G4 G5 | F5/8 E5/8 D5/8 C5/8 B4/8 C5/8 B4/8 A4/8 | G4/w | ' +
      'C5 E5/8 C5/8 G4 G4 | C5 E5/8 C5/8 G4 G5 | F5/8 E5/8 D5/8 C5/8 B4/8 D5/8 C5/8 B4/8 | C5/w',
    chords: 'C | C | G | G | C | C | G | C',
    pattern: 'alberti',
  },
  {
    id: 'surprise',
    title: 'Surprise Symphony (hai tay)',
    description: 'Chủ đề giao hưởng "Bất ngờ" của Haydn, nhịp 2/4, tay trái nốt trầm – hợp âm.',
    time: [2, 4],
    difficulty: 1,
    tempo: 84,
    source: `Joseph Haydn (Hob. I:94, 1791) — ${PD}`,
    notation:
      'C5/8 C5/8 E5/8 E5/8 | G5/8 G5/8 E5 | F5/8 F5/8 D5/8 D5/8 | B4/8 B4/8 G4 | C5/8 C5/8 E5/8 E5/8 | G5/8 G5/8 E5 | F5/8 D5/8 B4/8 D5/8 | C5/h',
    chords: 'C | C | G | G | C | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'brahms-lullaby',
    title: 'Brahms Lullaby (hai tay)',
    description: 'Khúc hát ru Op. 49 số 4, tay trái kiểu van-xơ nhẹ, pedal thay mỗi ô.',
    time: [3, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 76,
    source: `Johannes Brahms (1868) — ${PD}`,
    notation:
      'E4/8 E4/8 | G4/h E4/8 E4/8 | G4/h E4/8 G4/8 | C5 B4/qd A4/8 | A4 G4 D4/8 E4/8 | F4 D4 D4/8 E4/8 | F4/h D4/8 F4/8 | B4/8 A4/8 G4 B4 | C5/h C4/8 C4/8 | ' +
      'C5/h A4/8 F4/8 | G4/h E4/8 C4/8 | F4 G4 A4 | G4/h C4/8 C4/8 | C5/h A4/8 F4/8 | G4/h E4/8 C4/8 | F4 E4 D4 | C4/hd',
    chords: 'C | C | G | G C | G | G | G | C | F | C | F | C | F | C | G | C',
    pattern: 'oompah',
  },
  {
    id: 'swan-lake',
    title: 'Swan Lake (hai tay)',
    description: 'Chủ đề "Hồ thiên nga" của Tchaikovsky, dịch sang La thứ, tay trái rải với pedal thay mỗi ô.',
    time: [4, 4],
    key: 'Am',
    difficulty: 2,
    tempo: 66,
    source: `P. I. Tchaikovsky (1876) — ${PD}`,
    notation:
      'E4/h A4/8 B4/8 C5/8 D5/8 | E5/qd C5/8 E5/qd C5/8 | E5/qd A4/8 C5/8 A4/8 F4/8 C5/8 | A4/w | ' +
      'E4/h A4/8 B4/8 C5/8 D5/8 | E5/qd C5/8 E5/qd C5/8 | E5/qd A4/8 C5/8 A4/8 F4/8 C5/8 | A4/w',
    chords: 'Am | Am | F | Am | Am | Am | F | Am',
    pattern: 'arp',
  },
  {
    id: 'new-world',
    title: 'New World Largo (hai tay)',
    description: 'Dvořák, giai điệu "Goin\' Home" dịch sang Đô trưởng, chậm rãi, hợp để tập pedal.',
    time: [4, 4],
    difficulty: 1,
    tempo: 60,
    source: `Antonín Dvořák (Op. 95, 1893) — ${PD}`,
    notation: 'E4/qd G4/8 G4/h | E4/qd D4/8 C4/h | D4 E4 G4 E4 | D4/w | E4/qd G4/8 G4/h | E4/qd D4/8 C4/h | D4 E4 D4 C4 | C4/w',
    chords: 'C | F | C | G | C | F | G | C',
    pattern: 'hold',
  },
  {
    id: 'morning-mood',
    title: 'Morning Mood (hai tay)',
    description: 'Grieg, Peer Gynt: âm giai ngũ cung trong trẻo, nhịp 6/8, dịch sang Đô trưởng.',
    time: [6, 8],
    difficulty: 2,
    tempo: 72,
    source: `Edvard Grieg (1875) — ${PD}`,
    notation:
      'G5/8 E5/8 D5/8 C5/8 D5/8 E5/8 | G5/8 E5/8 D5/8 C5/8 D5/16 E5/16 D5/16 E5/16 | G5/8 E5/8 G5/8 A5/8 E5/8 A5/8 | G5/8 E5/8 D5/8 C5/qd | ' +
      'G5/8 E5/8 D5/8 C5/8 D5/8 E5/8 | G5/8 E5/8 D5/8 C5/8 D5/16 E5/16 D5/16 E5/16 | G5/8 E5/8 G5/8 A5/8 E5/8 A5/8 | G5/8 E5/8 D5/8 C5/qd',
    chords: 'C | C | Am | C | C | C | Am | C',
    pattern: 'arp8',
  },
  {
    id: 'mountain-king',
    title: 'In the Hall of the Mountain King (hai tay)',
    description: 'Grieg, La thứ, móc đơn nhảy nhót, tay trái nốt trầm – hợp âm.',
    time: [4, 4],
    key: 'Am',
    difficulty: 3,
    tempo: 92,
    source: `Edvard Grieg (1875) — ${PD}`,
    notation:
      'A4/8 B4/8 C5/8 D5/8 E5/8 C5/8 E5 | D#5/8 B4/8 D#5 D5/8 Bb4/8 D5 | A4/8 B4/8 C5/8 D5/8 E5/8 C5/8 E5/8 A5/8 | G5/8 E5/8 C5/8 E5/8 G5/h | ' +
      'A4/8 B4/8 C5/8 D5/8 E5/8 C5/8 E5 | D#5/8 B4/8 D#5 D5/8 Bb4/8 D5 | A4/8 B4/8 C5/8 D5/8 E5/8 C5/8 E5/8 A5/8 | G5/8 E5/8 C5/8 E5/8 A4/h',
    chords: 'Am | E | Am | C | Am | E | Am | C Am',
    pattern: 'oompah',
  },
  {
    id: 'spring',
    title: 'Spring — Bốn mùa (hai tay)',
    description: 'Vivaldi, chủ đề "Mùa xuân" dịch sang Đô trưởng, tay trái rải hợp âm.',
    time: [4, 4],
    pickup: 1,
    difficulty: 2,
    tempo: 92,
    source: `Antonio Vivaldi (1725) — ${PD}`,
    notation: 'C5 | E5 E5 E5 D5/8 C5/8 | G5/hd G5/8 F5/8 | E5 E5 E5 D5/8 C5/8 | G5/hd G5/8 F5/8 | E5 F5/8 G5/8 F5 E5 | D5/hd C5 | E5 D5 C5 B4 | C5/w',
    chords: 'C | C | C | C | C | G | G | C',
    pattern: 'arp',
  },
  {
    id: 'blue-danube',
    title: 'The Blue Danube (hai tay)',
    description: 'Strauss, chủ đề van-xơ dịch sang Đô trưởng, tay trái kiểu van-xơ cổ điển.',
    time: [3, 4],
    difficulty: 3,
    tempo: 132,
    source: `Johann Strauss II (1866) — ${PD}`,
    notation:
      'C4 E4 G4 | G4/h G5 | G5/h E5 | E5/hd | C4 E4 G4 | G4/h G5 | G5/h F5 | F5/hd | B3 B3 D4 | A4/h A5 | A5/h F5 | F5/hd | B3 B3 D4 | A4/h A5 | A5/h E5 | E5/hd | ' +
      'C4 E4 G4 | C5/h C6 | C6/h G5 | G5/hd | C4 E4 G4 | C5/h C6 | C6/h A5 | A5/hd | D4 D4 F4 | A4/hd | A4 C5 F5 | A5/hd | G5/h E5 | D5/h G4 | C5/hd | C5/hd',
    chords: 'C | C | C | C | C | C | G7 | G7 | G7 | G7 | G7 | G7 | G7 | G7 | C | C | C | C | C | C | C | C | F | F | Dm | Dm | Dm | Dm | C | G7 | C | C',
    pattern: 'oompah',
  },
  {
    id: 'entertainer',
    title: 'The Entertainer (hai tay)',
    description: 'Ragtime của Scott Joplin (1902), đơn giản hoá nhịp đảo, tay trái nốt trầm – hợp âm.',
    time: [2, 4],
    key: 'C',
    pickup: 0.5,
    difficulty: 3,
    tempo: 72,
    source: `Scott Joplin (1902) — ${PD}`,
    notation:
      'D4/16 D#4/16 | E4/16 C5/8 E4/16 C5/8 E4/16 C5/16 | C5 C5/16 D5/16 D#5/16 E5/16 | C5/16 D5/16 E5/8 B4/16 D5/8 C5/16 | C5/qd D4/16 D#4/16 | ' +
      'E4/16 C5/8 E4/16 C5/8 E4/16 C5/16 | C5/q A4/16 G4/16 F#4/16 A4/16 | C5/16 E5/8 D5/16 C5/16 A4/16 D5/8 | C5/h',
    chords: 'C | C | G | C | C | F | G | C',
    pattern: 'oompah',
  },
  {
    id: 'gymnopedie',
    title: 'Gymnopédie No. 1 (hai tay)',
    description: 'Satie, Rê trưởng: tay trái nốt trầm – hợp âm chậm, giai điệu thưa, pedal thay mỗi ô.',
    time: [3, 4],
    key: 'D',
    pickup: 2,
    difficulty: 2,
    tempo: 72,
    source: `Erik Satie (1888) — ${PD}`,
    notation:
      'F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4/hd | F#4/hd | F#4/hd | F#4 F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4/hd | C#5/hd | F#5/hd | E5/hd | D5/hd',
    chords: 'G | D | G | D | G | D | G | D | G | D | G | A | D',
    pattern: 'oompah',
  },
  {
    id: 'bridal-chorus',
    title: 'Bridal Chorus (hai tay)',
    description: 'Wagner, "Here Comes the Bride", Fa trưởng, tay trái giữ hợp âm trang trọng.',
    time: [4, 4],
    key: 'F',
    difficulty: 1,
    tempo: 72,
    source: `Richard Wagner (1850) — ${PD}`,
    notation:
      'C4 F4/8d F4/16 F4/h | C4 G4/8d E4/16 F4/h | C4 F4/8d Bb4/16 Bb4 A4/8d G4/16 | F4/8d E4/16 F4/8d G4/16 F4/h | ' +
      'C4 F4/8d F4/16 F4/h | C4 G4/8d E4/16 F4/h | C4 F4/8d Bb4/16 Bb4 A4/8d G4/16 | F4/8d E4/16 F4/8d G4/16 F4/h',
    chords: 'F | C | Bb | F | F | C | Bb | F',
    pattern: 'hold',
  },
];
