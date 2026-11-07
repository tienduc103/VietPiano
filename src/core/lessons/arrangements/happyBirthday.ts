/**
 * "Happy Birthday to You" — ba bản phối piano hai tay (Cơ bản / Trung cấp / Nâng cao), chung metadata bài hát.
 * Giọng Đô trưởng, nhịp 3/4, ô lấy đà một phách ("Hap-py"); khuông Sol tay phải, khuông Fa tay trái.
 *
 * Giai điệu: "Good Morning to All" của Mildred & Patty Hill (1893) — phạm vi công cộng. Cả ba bản giữ NGUYÊN giai điệu
 * (cao độ + trường độ, nốt cao nhất tay phải) — test so với `HAPPY_BIRTHDAY_MELODY`. Hoà âm, phần đệm, số ngón: tự soạn.
 * Quyết định hoà âm / bố trí (để người dùng duyệt) ghi ở docs/happy-birthday.md.
 *
 * Số ô nhịp ở đây là số IN trên bản nhạc: ô lấy đà = 0, "birth-day to" = ô 1 … "you" cuối = ô 8 (bản Nâng cao có ô 9 = coda).
 * Vì có ô lấy đà nên số in trùng chỉ số ô của `Lesson.pedal`.
 */
import type { DynamicMark } from '../../music/dynamics';
import type { PracticeMode } from '../../settings/DeviceSettings';
import type { PracticeHand } from '../../practice/handPractice';
import { parseAccompaniment, parseNotes } from '../notation';
import { noteIndexAt } from '../positions';
import type { ArrangementLevel, Hairpin, Lesson, PedalMark } from '../types';

/** Mã bài chung của ba bản phối. */
export const HAPPY_BIRTHDAY_FAMILY = 'happy-birthday';

export const HAPPY_BIRTHDAY_SOURCE =
  'Giai điệu "Good Morning to All", Mildred & Patty Hill (1893) — phạm vi công cộng; hoà âm, phần đệm, số ngón tự soạn cho VietPiano';

/** Giai điệu gốc (ô lấy đà + 8 ô) — chuẩn để kiểm tra cả ba bản phối không làm sai giai điệu. */
export const HAPPY_BIRTHDAY_MELODY =
  'G4/8d G4/16 | A4 G4 C5 | B4/h G4/8d G4/16 | A4 G4 D5 | C5/h G4/8d G4/16 | G5 E5 C5 | B4 A4 F5/8d F5/16 | E5 C5 D5 | C5/hd';

/** Vị trí trong bài: [ô số in, phách lệch từ đầu ô (nốt đen)]. */
type Pos = [measure: number, beat: number];

/** Một bước của lộ trình luyện đi kèm mỗi cấp (bấm để đặt tay / chế độ / tốc độ ở màn Luyện tập). */
export interface PracticePlanStep {
  title: string;
  hand: PracticeHand;
  mode: PracticeMode;
  /** % nhịp độ của bài (mặc định 100). */
  tempoPercent?: number;
  tip: string;
}

interface ArrangementDef {
  level: ArrangementLevel;
  id: string;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  tempo: number;
  tempoRange: [number, number];
  notation: string;
  accompaniment: string;
  chords: [measure: number, beat: number, symbol: string][];
  dynamics?: [measure: number, beat: number, mark: DynamicMark][];
  hairpins?: [from: Pos, to: Pos, type: Hairpin['type']][];
  pedal: PedalMark[];
  pedalOptional?: boolean;
  plan: PracticePlanStep[];
}

/** Pedal thay mỗi ô từ ô `first` tới ô `last` (bỏ các ô trong `skip`). */
const eachMeasure = (first: number, last: number, skip: number[] = []): PedalMark[] =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i)
    .filter((m) => !skip.includes(m))
    .map((m) => ({ from: m, to: m }));

const DEFS: ArrangementDef[] = [
  // ── Cấp 1 — Cơ bản ──────────────────────────────────────────────
  // Tay phải: giai điệu từng nốt, đủ số ngón. Thế Sol (ngón 1 ở Sol4) cho ô 0–4; nhảy quãng 8 lên thế Đô cao (ngón 1 ở Đô5)
  // ở ô 5; lùi về thế Sol ở ô 6 ("Na-me"); lên lại thế Đô cao từ "Hap-py" cuối ô 6. Ba lần đổi thế là tối thiểu vì giai điệu
  // trải La4 – Sol5 (quãng 7) ở ô 5–6.
  // Tay trái: thế Đô (ngón 5 ở Đô3) không rời tay: một nốt trầm giữ cả ô — Đô (C), Sol (G), Fa (F); ô 7 đổi Sol ở phách 3;
  // ô cuối quãng 5 Đô – Sol. Pedal chỉ gợi ý ở ô cuối (không chấm).
  {
    level: 1,
    id: 'song-happy-birthday-beginner',
    title: 'Happy Birthday · Cơ bản (hai tay)',
    description:
      'Bản phối cơ bản: tay phải giai điệu từng nốt có đủ số ngón, tay trái một nốt trầm giữ cả ô (Đô – Sol – Fa) không phải dời tay. ' +
      'Nhịp 3/4, ♩ 60–80. Pedal không bắt buộc.',
    difficulty: 1,
    tempo: 72,
    tempoRange: [60, 80],
    notation:
      'G4/8d:1 G4/16:1 | A4:2 G4:1 C5:4 | B4/h:3 G4/8d:1 G4/16:1 | A4:2 G4:1 D5:5 | C5/h:4 G4/8d:1 G4/16:1 | ' +
      'G5:5 E5:3 C5:1 | B4:3 A4:2 F5/8d:4 F5/16:4 | E5:3 C5:1 D5:2 | C5/hd:1',
    accompaniment: 'R/q | C3/hd:5 | G3/hd:1 | G3/hd | C3/hd:5 | C3/hd | F3/hd:2 | C3/h:5 G3/q:1 | C3+G3/hd:5+1',
    chords: [
      [1, 0, 'C'],
      [2, 0, 'G'],
      [3, 0, 'G'],
      [4, 0, 'C'],
      [5, 0, 'C'],
      [6, 0, 'F'],
      [7, 0, 'C'],
      [7, 2, 'G'],
      [8, 0, 'C'],
    ],
    pedal: [{ from: 8, to: 8 }],
    pedalOptional: true,
    plan: [
      { title: 'Luyện giai điệu tay phải', hand: 'right', mode: 'wait', tip: 'Chờ nốt: đánh đúng mới sang nốt kế. Để ý ba chỗ đổi thế tay (ô 5, ô 6).' },
      { title: 'Luyện nốt trầm tay trái', hand: 'left', mode: 'wait', tip: 'Tay trái đặt ngón 5 ở Đô3, không phải dời tay: Đô – Sol – Fa.' },
      { title: 'Ghép hai tay thật chậm', hand: 'both', mode: 'tempo', tempoPercent: 70, tip: 'Theo nhịp ở 70%: nốt trầm tay trái đánh cùng nốt đầu ô của tay phải.' },
      { title: 'Chơi toàn bộ bản nhạc', hand: 'both', mode: 'wait', tip: 'Chờ nốt hai tay: đàn MIDI / bàn phím ảo chấm cả hai tay.' },
      { title: 'Kiểm tra hoàn thành', hand: 'both', mode: 'perform', tip: 'Biểu diễn: chơi một mạch từ đầu tới cuối theo nhịp, sai không dừng.' },
    ],
  },
  // ── Cấp 2 — Trung cấp ───────────────────────────────────────────
  // Tay phải: giai điệu + quãng 3 / quãng 6 ở nốt dài và chỗ đổi hợp âm (Sol – Si, Fa – Rê, Mi – Đô…); ô 5 đổi ngón 1 → 5
  // trên Đô5 để lùi về thế Fa; ô 6 hai quãng 3 đi xuống (Si/Sol → La/Fa) là nốt dựa của hợp âm Fa.
  // Tay trái: đệm valse (nốt trầm phách 1, hợp âm phách 2 – 3) ở thế gần Đô3: C, G7/B, C7, F/A; ô 4 và ô 8 rải hợp âm.
  // Pedal thay mỗi ô, trừ ô 6 (nốt dựa sẽ bị nhoè) và ô 7 (đổi hợp âm giữa ô).
  {
    level: 2,
    id: 'song-happy-birthday-intermediate',
    title: 'Happy Birthday · Trung cấp (hai tay)',
    description:
      'Bản phối trung cấp: tay phải thêm quãng 3, quãng 6 và đổi thế tay; tay trái đệm valse (trầm – hợp âm – hợp âm) với C, G7, C7, F ' +
      'và rải hợp âm ở cuối câu. Có ký hiệu hợp âm, sắc thái p – mp – mf, to dần và pedal. ♩ 75–100.',
    difficulty: 2,
    tempo: 88,
    tempoRange: [75, 100],
    notation:
      'G4/8d:1 G4/16:1 | A4:2 G4:1 C5:4 | G4+B4/h:1+3 G4/8d:1 G4/16:1 | A4:2 G4:1 F4+D5:1+5 | E4+C5/h:1+5 G4/8d:1 G4/16:1 | ' +
      'E5+G5:3+5 C5+E5:1+3 C5:5 | G4+B4:2+4 F4+A4:1+3 F5/8d:4 F5/16:4 | C5+E5:1+3 C5:1 B4+D5:1+3 | E4+C5/hd:1+5',
    accompaniment:
      'R/q | C3:5 E3+G3:3+1 E3+G3 | B2:5 F3+G3:2+1 F3+G3 | B2 F3+G3 F3+G3 | C3:5 G3:2 C4:1 | ' +
      'C3:5 E3+Bb3:3+1 E3+Bb3 | A2:5 C3+F3:3+1 C3+F3 | C3:5 E3+G3:3+1 B2+F3+G3:5+2+1 | C3:5 G3:2 C4:1',
    chords: [
      [1, 0, 'C'],
      [2, 0, 'G7/B'],
      [3, 0, 'G7/B'],
      [4, 0, 'C'],
      [5, 0, 'C7'],
      [6, 0, 'F/A'],
      [7, 0, 'C'],
      [7, 2, 'G7/B'],
      [8, 0, 'C'],
    ],
    dynamics: [
      [0, 0, 'mp'],
      [2, 2, 'p'],
      [5, 0, 'mf'],
      [6, 2, 'mp'],
    ],
    hairpins: [[[4, 0], [4, 2.75], 'cresc']],
    pedal: eachMeasure(1, 8, [6, 7]),
    plan: [
      { title: 'Tay phải: giai điệu có quãng 3, quãng 6', hand: 'right', mode: 'wait', tip: 'Đàn MIDI / bàn phím ảo chấm đủ cả hai nốt của quãng.' },
      { title: 'Tay trái: đệm valse', hand: 'left', mode: 'wait', tip: 'Trầm ở phách 1, hợp âm ở phách 2 và 3 — hợp âm nhẹ hơn nốt trầm.' },
      { title: 'Phối hợp hai tay chậm', hand: 'both', mode: 'tempo', tempoPercent: 75, tip: 'Theo nhịp ở 75%, đếm "MỘT – hai – ba" và nhấn phách 1.' },
      { title: 'Hai tay chờ nốt', hand: 'both', mode: 'wait', tip: 'Đủ nốt tay phải (cả quãng) và tay trái mới sang bước kế.' },
      { title: 'Biểu diễn có sắc thái', hand: 'both', mode: 'perform', tip: 'Theo sắc thái mp – p – to dần – mf, pedal thay mỗi ô theo ký hiệu.' },
    ],
  },
  // ── Cấp 3 — Nâng cao ────────────────────────────────────────────
  // Tay phải: giai điệu trên cùng + hoà âm hai – ba bè; C6 ở ô 1 (Mi giữ làm bè trong), G7 / G9 ở ô 2 – 3, quãng 8 có bè giữa
  // ở cao trào ô 5 (C7: Sol–Si♭–Sol, Mi–Si♭–Mi), quãng 3 nốt dựa ô 6, Fm (hợp âm thứ của bậc IV) ở "Hap-py" cuối ô 6, kết C/G – G7 – C,
  // thêm một ô coda (hợp âm Đô cao) làm câu kết.
  // Tay trái: valse nhảy (trầm thấp – hợp âm), rải hợp âm móc đơn (ô 3), câu nối đi lên (ô 4, ô 8), bè trầm đi xuống nửa cung
  // Đô – Si♭ – La – La♭ – Sol – Đô ở ô 5 – 8. Pedal đổi theo hợp âm, kể cả giữa ô (ô 5, 6, 7).
  {
    level: 3,
    id: 'song-happy-birthday-advanced',
    title: 'Happy Birthday · Nâng cao (hai tay)',
    description:
      'Bản phối biểu diễn: tay phải giai điệu kèm hoà âm hai – ba bè, quãng 8 ở cao trào; tay trái valse nhảy, rải hợp âm, câu nối và bè trầm ' +
      'đi xuống nửa cung (C – C7 – F – Fm – G7 – C). Sắc thái đầy đủ, to dần / nhỏ dần, pedal đổi theo hợp âm, có coda. ♩ 85–115.',
    difficulty: 3,
    tempo: 100,
    tempoRange: [85, 115],
    notation:
      'G4/8d:3 G4/16:3 | E4+A4:1+4 E4+G4:1+3 E4+G4+C5:1+2+5 | F4+G4+B4/h:1+2+4 G4/8d:2 G4/16:2 | ' +
      'F4+A4:1+3 G4:2 F4+B4+D5:1+3+5 | E4+G4+C5/h:1+2+5 G4/8d:1 G4/16:1 | ' +
      'G4+Bb4+G5:1+2+5 E4+Bb4+E5:1+2+5 E4+Bb4+C5:1+2+3 | G4+B4:2+4 F4+A4:1+3 Ab4+C5+F5/8d:1+2+5 F5/16:5 | ' +
      'G4+C5+E5:1+3+5 G4+C5:1+3 F4+B4+D5:1+3+5 | E4+G4+C5/hd:1+2+5 | C5+E5+G5+C6/hd:1+2+3+5',
    accompaniment:
      'R/q | C2:5 E3+G3+C4:3+2+1 E3+G3+C4 | G2:5 D3+F3+B3:3+2+1 D3+F3+B3 | ' +
      'G2/8:5 D3/8:3 F3/8:2 B3/8:1 F3/8:2 D3/8:3 | C2/8:5 G2/8:2 C3/8:1 E3/8:3 G3/8:2 C4/8:1 | ' +
      'C3:5 E3+G3+Bb3:3+2+1 Bb2+E3+G3:5+2+1 | A2:5 A2+C3+F3:5+3+1 Ab2+C3+F3:5+3+1 | G2:5 C3+E3:2+1 G2+B2+F3:5+3+1 | ' +
      'C2/8:5 G2/8:2 C3/8:1 E3/8:3 G3/8:2 C4/8:1 | C2+C3/hd:5+1',
    chords: [
      [1, 0, 'C6'],
      [2, 0, 'G7'],
      [3, 0, 'G9'],
      [4, 0, 'C'],
      [5, 0, 'C7'],
      [5, 2, 'C7/Bb'],
      [6, 0, 'F/A'],
      [6, 2, 'Fm/Ab'],
      [7, 0, 'C/G'],
      [7, 2, 'G7'],
      [8, 0, 'C'],
    ],
    dynamics: [
      [0, 0, 'mp'],
      [2, 2, 'mf'],
      [5, 0, 'f'],
      [6, 2, 'mp'],
      [9, 0, 'p'],
    ],
    hairpins: [
      [[4, 0], [4, 2.75], 'cresc'],
      [[6, 0], [6, 1], 'dim'],
      [[8, 0], [8, 0], 'dim'],
    ],
    pedal: [
      ...eachMeasure(1, 4),
      { from: 5, to: 5, toBeat: 2 },
      { from: 5, fromBeat: 2, to: 5 },
      { from: 6, to: 6, toBeat: 1 },
      { from: 6, fromBeat: 1, to: 6, toBeat: 2 },
      { from: 6, fromBeat: 2, to: 6 },
      { from: 7, to: 7, toBeat: 2 },
      { from: 7, fromBeat: 2, to: 7 },
      ...eachMeasure(8, 9),
    ],
    plan: [
      { title: 'Tay phải: hợp âm và quãng 8', hand: 'right', mode: 'wait', tip: 'Nốt giai điệu (ngón trên cùng) to hơn các bè trong.' },
      { title: 'Tay trái: bè trầm, rải hợp âm, câu nối', hand: 'left', mode: 'wait', tip: 'Ô 4 và ô 8 rải đi lên, vắt ngón 3 qua ngón 1.' },
      { title: 'Hai tay chờ nốt', hand: 'both', mode: 'wait', tip: 'Chú ý ô 5 – 7: bè trầm đi xuống Đô – Si♭ – La – La♭ – Sol.' },
      { title: 'Hai tay theo nhịp', hand: 'both', mode: 'tempo', tempoPercent: 85, tip: 'Giữ nhịp 3/4 đều, đổi pedal đúng chỗ đổi hợp âm.' },
      { title: 'Biểu diễn', hand: 'both', mode: 'perform', tip: 'Đủ sắc thái mp – mf – f – mp – p, to dần / nhỏ dần, pedal theo hợp âm.' },
    ],
  },
];

function build(def: ArrangementDef): Lesson {
  const base: Lesson = {
    id: def.id,
    title: def.title,
    description: def.description,
    category: 'song',
    clef: 'grand',
    timeSignature: [3, 4],
    pickup: 1,
    difficulty: def.difficulty,
    hand: 'both',
    tempo: def.tempo,
    tempoRange: def.tempoRange,
    source: HAPPY_BIRTHDAY_SOURCE,
    arrangement: { family: HAPPY_BIRTHDAY_FAMILY, level: def.level },
    notes: parseNotes(def.notation),
    accompaniment: parseAccompaniment(def.accompaniment),
    pedal: def.pedal,
    ...(def.pedalOptional ? { pedalOptional: true } : {}),
  };
  const at = ([m, b]: Pos) => noteIndexAt(base, m, b);
  return {
    ...base,
    chordSymbols: def.chords.map(([m, b, symbol]) => ({ index: at([m, b]), symbol })),
    ...(def.dynamics ? { dynamics: def.dynamics.map(([m, b, mark]) => ({ index: at([m, b]), mark })) } : {}),
    ...(def.hairpins ? { hairpins: def.hairpins.map(([from, to, type]) => ({ from: at(from), to: at(to), type })) } : {}),
  };
}

export const HAPPY_BIRTHDAY_LESSONS: Lesson[] = DEFS.map(build);

/** Lộ trình luyện của từng bản phối (theo id bài). */
export const HAPPY_BIRTHDAY_PLANS: Record<string, PracticePlanStep[]> = Object.fromEntries(DEFS.map((d) => [d.id, d.plan]));
