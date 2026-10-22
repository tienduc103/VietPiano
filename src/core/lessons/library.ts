/**
 * Thư viện bài học ban đầu.
 * Các bài hát đều là giai điệu dân gian / thuộc phạm vi công cộng (public domain),
 * được chép lại đơn giản hoá cho người mới học, chỉ dùng tay phải hoặc tay trái.
 */
import { parseNotes } from './notation';
import type { Lesson } from './types';

type LessonDef = Omit<Lesson, 'notes'> & { notation: string };

const defs: LessonDef[] = [
  // ── Nhận biết nốt ────────────────────────────────────────────────
  {
    id: 'notes-seven',
    title: '7 nốt cơ bản',
    description: 'Đô Rê Mi Fa Sol La Si — đi lên rồi đi xuống quanh Đô giữa.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'C4 D4 E4 F4 | G4 A4 B4/h | B4 A4 G4 F4 | E4 D4 C4/h',
  },
  {
    id: 'notes-mixed',
    title: 'Nhận biết nốt xáo trộn',
    description: 'Bảy nốt theo thứ tự ngẫu nhiên để luyện đọc nhanh.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'E4 C4 G4 D4 | A4 F4 B4 E4 | D4 G4 C4 A4 | F4 B4 C4/h',
  },
  {
    id: 'notes-bass',
    title: 'Nốt khoá Fa',
    description: 'Làm quen khoá Fa: các nốt từ Đô3 tới Si3.',
    category: 'notes',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    notation: 'C3 D3 E3 F3 | G3 A3 B3/h | B3 A3 G3 F3 | E3 D3 C3/h',
  },
  // ── Gam ──────────────────────────────────────────────────────────
  {
    id: 'scale-c-major',
    title: 'Gam Đô trưởng (tay phải)',
    description: 'Gam C trưởng một quãng tám, đi lên và đi xuống.',
    category: 'scale',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4',
  },
  {
    id: 'scale-c-major-left',
    title: 'Gam Đô trưởng (tay trái)',
    description: 'Gam C trưởng quãng tám dưới, khoá Fa.',
    category: 'scale',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'left',
    notation: 'C3 D3 E3 F3 | G3 A3 B3 C4 | C4 B3 A3 G3 | F3 E3 D3 C3',
  },
  // ── Bài tập tay phải ────────────────────────────────────────────
  {
    id: 'rh-five-finger',
    title: 'Tay phải: 5 ngón thế Đô',
    description: 'Ngón 1 đặt ở Đô4, mỗi ngón một phím từ Đô tới Sol.',
    category: 'right-hand',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'C4 D4 E4 F4 | G4/w | G4 F4 E4 D4 | C4/w | C4 E4 D4 F4 | E4 G4 F4 D4 | C4 E4 G4 E4 | C4/w',
  },
  {
    id: 'rh-skips',
    title: 'Tay phải: nhảy quãng 3',
    description: 'Luyện bước nhảy cách một phím và nốt lặp lại.',
    category: 'right-hand',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'right',
    notation: 'C4 E4 D4 F4 | E4 G4 F4 A4 | G4 G4 A4 A4 | G4/w | A4 F4 G4 E4 | F4 D4 E4 C4 | D4 D4 C4 C4 | C4/w',
  },
  // ── Bài tập tay trái ────────────────────────────────────────────
  {
    id: 'lh-five-finger',
    title: 'Tay trái: 5 ngón thế Đô',
    description: 'Ngón 5 đặt ở Đô3, đi từ Đô3 tới Sol3 (khoá Fa).',
    category: 'left-hand',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    notation: 'C3 D3 E3 F3 | G3/w | G3 F3 E3 D3 | C3/w | C3 E3 G3 E3 | C3 E3 G3/h | G3 F3 E3 D3 | C3/w',
  },
  {
    id: 'lh-bass-line',
    title: 'Tay trái: bè trầm đơn giản',
    description: 'Các nốt trụ Đô – Fa – Sol thường gặp trong đệm hát.',
    category: 'left-hand',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'left',
    notation: 'C3/h G3/h | F3/h C3/h | G3/h D3/h | C3/w | C3 E3 G3 E3 | F3 A3 C4 A3 | G3 B3 D3 G3 | C3/w',
  },
  // ── Bài hát ─────────────────────────────────────────────────────
  {
    id: 'song-twinkle',
    title: 'Twinkle Twinkle Little Star',
    description: 'Giai điệu "Ah! vous dirai-je, maman" — bài hát thiếu nhi quen thuộc.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    source: 'Dân ca Pháp thế kỷ 18 — phạm vi công cộng',
    notation:
      'C4 C4 G4 G4 | A4 A4 G4/h | F4 F4 E4 E4 | D4 D4 C4/h | G4 G4 F4 F4 | E4 E4 D4/h | ' +
      'G4 G4 F4 F4 | E4 E4 D4/h | C4 C4 G4 G4 | A4 A4 G4/h | F4 F4 E4 E4 | D4 D4 C4/h',
  },
  {
    id: 'song-mary-lamb',
    title: 'Mary Had a Little Lamb',
    description: 'Bài hát thiếu nhi Mỹ, chỉ dùng 4 nốt Đô Rê Mi Sol.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    source: 'Lowell Mason (1830s) — phạm vi công cộng',
    notation: 'E4 D4 C4 D4 | E4 E4 E4/h | D4 D4 D4/h | E4 G4 G4/h | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4/w',
  },
  {
    id: 'song-frere-jacques',
    title: 'Kìa con bướm vàng',
    description: 'Giai điệu "Frère Jacques" — quen thuộc với lời Việt "Kìa con bướm vàng".',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'right',
    source: 'Dân ca Pháp — phạm vi công cộng',
    notation:
      'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4/h | E4 F4 G4/h | G4/8 A4/8 G4/8 F4/8 E4 C4 | ' +
      'G4/8 A4/8 G4/8 F4/8 E4 C4 | C4 G3 C4/h | C4 G3 C4/h',
  },
  {
    id: 'song-ode-to-joy',
    title: 'Ode to Joy (Khúc hoan ca)',
    description: 'Chủ đề chương cuối Giao hưởng số 9 của Beethoven.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'right',
    source: 'L. v. Beethoven (1824) — phạm vi công cộng',
    notation:
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/qd D4/8 D4/h | ' +
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/qd C4/8 C4/h',
  },
  {
    id: 'song-jingle-bells',
    title: 'Jingle Bells (điệp khúc)',
    description: 'Điệp khúc bài hát Giáng sinh nổi tiếng, nhiều nốt lặp lại.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 3,
    hand: 'right',
    source: 'J. L. Pierpont (1857) — phạm vi công cộng',
    notation: 'E4 E4 E4/h | E4 E4 E4/h | E4 G4 C4/qd D4/8 | E4/w | F4 F4 F4/qd F4/8 | F4 E4 E4 E4/8 E4/8 | E4 D4 D4 E4 | D4/h G4/h',
  },
  {
    id: 'song-romance',
    title: "Romance d'Amour (bản 1)",
    description: 'Giai điệu đoạn đầu (Mi thứ, nhịp 3/4) — nốt cao nhất của mỗi chùm rải hợp âm.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    keySignature: 'Em',
    difficulty: 3,
    hand: 'right',
    source: 'Khuyết danh, nhạc guitar Tây Ban Nha thế kỷ 19 — phạm vi công cộng',
    notation:
      'B4 B4 B4 | B4 A4 G4 | G4 F#4 E4 | E4 G4 B4 | E5 E5 E5 | E5 D5 C5 | C5 B4 A4 | A4 B4 C5 | ' +
      'B4 C5 B4 | D#5 C5 B4 | B4 A4 G4 | G4 F#4 E4 | F#4 F#4 F#4 | F#4 G4 F#4 | E4 E4 E4 | E4/hd',
  },
  {
    id: 'song-romance-2',
    title: "Romance d'Amour (bản 2)",
    description: 'Bản piano dễ (Rê thứ, nhịp 3/4) — giai điệu tay phải, đoạn A và đoạn B.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    keySignature: 'Dm',
    difficulty: 3,
    hand: 'right',
    source: 'Khuyết danh, nhạc guitar Tây Ban Nha thế kỷ 19 — phạm vi công cộng; chuyển giọng Rê thứ',
    notation:
      // Đoạn A (ô 1–16)
      'A4 A4 A4 | A4 G4 F4 | F4 E4 D4 | D4 F4 A4 | D5 D5 D5 | D5 C5 Bb4 | Bb4 A4 G4 | G4 A4 Bb4 | ' +
      'A4 Bb4 A4 | C#5 Bb4 A4 | A4 G4 F4 | F4 E4 D4 | E4 E4 E4 | E4 F4 E4 | D4 D4 D4 | D4/hd | ' +
      // Đoạn B (ô 17–32): giai điệu tay phải giống đoạn A, chỉ khác phần đệm tay trái
      'A4 A4 A4 | A4 G4 F4 | F4 E4 D4 | D4 F4 A4 | D5 D5 D5 | D5 C5 Bb4 | Bb4 A4 G4 | G4 A4 Bb4 | ' +
      'A4 Bb4 A4 | C#5 Bb4 A4 | A4 G4 F4 | F4 E4 D4 | E4 E4 E4 | E4 F4 E4 | D4 D4 D4 | D4/hd',
  },
  {
    id: 'song-fur-elise',
    title: 'Für Elise',
    description: 'Chủ đề mở đầu (La thứ, nhịp 3/8) — giai điệu tay phải, bắt đầu bằng nhịp lấy đà.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 8],
    keySignature: 'Am',
    pickup: 0.5,
    difficulty: 3,
    hand: 'right',
    source: 'L. v. Beethoven (1810) — phạm vi công cộng',
    notation:
      'E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/8d C4/16 E4/16 A4/16 | B4/8d E4/16 G#4/16 B4/16 | ' +
      'C5/8d E4/16 E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/8d C4/16 E4/16 A4/16 | ' +
      'B4/8d E4/16 C5/16 B4/16 | A4/qd',
  },
];

export const LESSONS: Lesson[] = defs.map(({ notation, ...rest }) => ({ ...rest, notes: parseNotes(notation) }));
