/**
 * Thư viện bài học ban đầu.
 * Các bài hát đều là giai điệu dân gian / thuộc phạm vi công cộng (public domain),
 * được chép lại đơn giản hoá cho người mới học, chỉ dùng tay phải hoặc tay trái.
 */
import { parseAccompaniment, parseNotes } from './notation';
import type { Lesson } from './types';

type LessonDef = Omit<Lesson, 'notes' | 'accompaniment'> & { notation: string; accompanimentNotation?: string };

/** Giai điệu tay phải Romance d'Amour bản piano dễ Rê thứ (16 ô nhịp, có số ngón tay). */
const ROMANCE_MELODY =
  'A4:5 A4 A4 | A4 G4 F4 | F4 E4 D4 | D4:1 F4:2 A4:3 | D5:5 D5 D5 | D5 C5:4 Bb4:(3) | Bb4:(3) A4:2 G4:1 | G4 A4 Bb4:(3) | ' +
  'A4 Bb4:(3) A4 | C#5:4 Bb4:(3) A4:2 | A4:3 G4 F4:1 | F4:3 E4 D4 | E4 E4 E4 | E4 F4 E4 | D4 D4 D4 | D4/hd';

/** Năm đoạn của bài bé 1 – 2 – 3 dài: tròn/trắng → trắng chấm → đen → đen chấm + móc đơn → tổng hợp. */
const KIDS_123_SECTIONS = [
  { measure: 1, label: 'A' },
  { measure: 9, label: 'B' },
  { measure: 17, label: 'C' },
  { measure: 25, label: 'D' },
  { measure: 33, label: 'E' },
];

const defs: LessonDef[] = [
  // ── Nhận biết nốt ────────────────────────────────────────────────
  // Xếp theo thứ tự khoá học "Nốt nhạc cơ bản" (courses.ts): mỗi bài thêm một vài nốt mới.
  {
    id: 'notes-middle-c',
    title: 'Đô giữa',
    description: 'Nốt đầu tiên: Đô giữa (Đô4), ngón cái tay phải — giữ đủ trường độ.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation: 'C4/w:1 | C4/h:1 C4/h:1 | C4:1 C4:1 C4:1 C4:1 | C4/w:1',
  },
  {
    id: 'notes-c-d',
    title: 'Đô và Rê',
    description: 'Thêm nốt Rê ngay trên Đô — ngón 1 và ngón 2.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation: 'C4:1 D4:2 C4/h:1 | D4:2 C4:1 D4/h:2 | C4:1 C4:1 D4:2 D4:2 | C4/w:1',
  },
  {
    id: 'notes-c-d-e',
    title: 'Đô – Rê – Mi',
    description: 'Ba nốt liền nhau, ngón 1 – 2 – 3.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation: 'C4:1 D4:2 E4/h:3 | E4:3 D4:2 C4/h:1 | E4:3 C4:1 D4:2 E4:3 | D4:2 E4:3 C4/h:1',
  },
  {
    id: 'notes-f-g',
    title: 'Thêm Fa và Sol',
    description: 'Đủ năm nốt Đô – Rê – Mi – Fa – Sol, mỗi ngón một phím.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'C4:1 D4:2 E4:3 F4:4 | G4/w:5 | G4:5 F4:4 E4:3 D4:2 | C4/w:1 | E4:3 F4:4 G4/h:5 | G4:5 E4:3 C4/h:1',
  },
  {
    id: 'notes-a-b-c',
    title: 'La – Si – Đô cao',
    description: 'Dời ngón cái lên Sol4 để chơi La, Si và Đô5.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'G4:1 A4:2 B4:3 C5:4 | C5/w:4 | C5:4 B4:3 A4:2 G4:1 | G4/w:1 | G4:1 B4:3 A4:2 C5:4 | B4:3 A4:2 G4/h:1',
  },
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
    id: 'notes-lines',
    title: 'Nốt trên dòng kẻ',
    description: 'Mi – Sol – Si – Rê – Fa: năm nốt nằm trên năm dòng kẻ khoá Sol.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'E4 G4 B4 D5 | F5/w | F5 D5 B4 G4 | E4/w | E4 B4 G4 D5 | B4 F5 D5 G4 | E4/w',
  },
  {
    id: 'notes-spaces',
    title: 'Nốt trong khe',
    description: 'Fa – La – Đô – Mi: bốn nốt nằm trong bốn khe giữa các dòng kẻ khoá Sol.',
    category: 'notes',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    notation: 'F4 A4 C5 E5 | E5 C5 A4 F4 | F4 C5 A4 E5 | C5 A4 F4/h',
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
  {
    id: 'notes-bass-mixed',
    title: 'Khoá Fa xáo trộn',
    description: 'Các nốt Đô3 tới Si3 theo thứ tự ngẫu nhiên, tay trái.',
    category: 'notes',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    notation: 'C3 E3 D3 F3 | G3 B3 A3 C3 | F3 D3 B3 G3 | E3 A3 C3/h',
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
  // ── Bài tập hai tay ─────────────────────────────────────────────
  // Hai tay THAY PHIÊN (app chỉ nhận một nốt mỗi lúc), vẽ trên khuông đôi. "RH"/"LH" đổi tay cho các nốt sau.
  // Thế Đô: tay phải ngón 1 ở Đô4, tay trái ngón 5 ở Đô3.
  {
    id: 'bh-echo',
    title: 'Hai tay: hỏi – đáp',
    description: 'Tay phải chơi một ô nhịp, tay trái nhắc lại thấp hơn một quãng tám.',
    category: 'both-hands',
    clef: 'grand',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'both',
    tempo: 60,
    notation:
      'RH C4:1 D4:2 E4/h:3 | LH C3:5 D3:4 E3/h:3 | RH E4:3 D4:2 C4/h:1 | LH E3:3 D3:4 C3/h:5 | ' +
      'RH C4:1 E4:3 G4/h:5 | LH C3:5 E3:3 G3/h:1 | RH G4:5 E4:3 C4/h:1 | LH G3:1 E3:3 C3/h:5',
  },
  {
    id: 'bh-parallel',
    title: 'Hai tay: đi song song',
    description: 'Mỗi phím chơi tay trái trước rồi tay phải, cùng tên nốt, từ Đô lên Sol rồi về.',
    category: 'both-hands',
    clef: 'grand',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'both',
    tempo: 60,
    notation:
      'LH C3/h:5 RH C4/h:1 | LH D3/h:4 RH D4/h:2 | LH E3/h:3 RH E4/h:3 | LH F3/h:2 RH F4/h:4 | ' +
      'LH G3/h:1 RH G4/h:5 | LH F3/h:2 RH F4/h:4 | LH E3/h:3 RH E4/h:3 | LH C3/h:5 RH C4/h:1',
  },
  {
    id: 'bh-hot-cross-buns',
    title: 'Hai tay: Hot Cross Buns',
    description: 'Bài hát quen thuộc, tay phải hát trước, tay trái đáp lại.',
    category: 'both-hands',
    clef: 'grand',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'both',
    tempo: 60,
    source: 'Đồng dao Anh "Hot Cross Buns" (thế kỷ 18) — phạm vi công cộng',
    notation:
      'RH E4:3 D4:2 C4/h:1 | LH E3:3 D3:4 C3/h:5 | RH C4:1 C4:1 C4:1 C4:1 | LH D3:4 D3:4 D3:4 D3:4 | ' +
      'RH E4:3 D4:2 C4/h:1 | LH E3:3 D3:4 C3/h:5',
  },
  {
    id: 'bh-relay',
    title: 'Hai tay: tiếp sức',
    description: 'Tay trái đi lên tới ngón cái rồi chuyền cho tay phải đi tiếp, sau đó quay về.',
    category: 'both-hands',
    clef: 'grand',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'both',
    tempo: 60,
    notation:
      'LH C3:5 D3:4 E3:3 F3:2 | G3/h:1 RH C4/h:1 | D4:2 E4:3 F4:4 G4:5 | G4/w:5 | G4:5 F4:4 E4:3 D4:2 | ' +
      'C4/h:1 LH G3/h:1 | F3:2 E3:3 D3:4 E3:3 | C3/w:5',
  },
  {
    id: 'bh-ode-to-joy',
    title: 'Hai tay: Ode to Joy',
    description: 'Câu đầu tay phải, câu sau tay trái chơi thấp hơn một quãng tám.',
    category: 'both-hands',
    clef: 'grand',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'both',
    tempo: 60,
    source: 'L. v. Beethoven (1824) — phạm vi công cộng',
    notation:
      'RH E4:3 E4:3 F4:4 G4:5 | G4:5 F4:4 E4:3 D4:2 | C4:1 C4:1 D4:2 E4:3 | E4/qd:3 D4/8:2 D4/h:2 | ' +
      'LH E3:3 E3:3 F3:2 G3:1 | G3:1 F3:2 E3:3 D3:4 | C3:5 C3:5 D3:4 E3:3 | D3/qd:4 C3/8:5 C3/h:5',
  },
  // ── Bé tự học theo số ngón tay ─────────────────────────────────
  // Số trên khuông là ngón tay: 1 = ngón cái, 2 = trỏ, 3 = giữa, 4 = áp út, 5 = út.
  // Tay đặt cố định ở thế Đô, mỗi ngón một phím (test kiểm tra ngón ↔ phím nhất quán).
  {
    id: 'kid-rh-123',
    title: 'Bé tay phải: ngón 1 – 2 – 3',
    description: 'Ngón cái (1) đặt ở Đô giữa. Ngón 1 Đô, ngón 2 Rê, ngón 3 Mi.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation:
      'C4/h:1 D4/h:2 | E4/w:3 | E4/h:3 D4/h:2 | C4/w:1 | ' +
      'C4:1 D4:2 E4:3 D4:2 | C4:1 D4:2 E4/h:3 | E4:3 D4:2 C4:1 D4:2 | C4/w:1',
  },
  {
    id: 'kid-rh-123-long',
    title: 'Bé tay phải: 1 – 2 – 3 đủ trường độ',
    description:
      'Bài dài 40 ô nhịp với ngón 1 (Đô), 2 (Rê), 3 (Mi): nốt tròn, trắng, trắng chấm, đen, đen chấm và móc đơn — giữ đủ phách từng nốt.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'right',
    tempo: 60,
    sections: KIDS_123_SECTIONS,
    notation:
      'C4/w:1 | D4/w:2 | E4/w:3 | D4/h:2 C4/h:1 | C4/h:1 E4/h:3 | D4/w:2 | E4/h:3 D4/h:2 | C4/w:1 | ' +
      'C4/hd:1 D4:2 | E4/hd:3 D4:2 | C4/hd:1 E4:3 | D4/w:2 | E4:3 D4/hd:2 | C4:1 E4/hd:3 | D4/hd:2 C4:1 | C4/w:1 | ' +
      'C4:1 D4:2 E4:3 D4:2 | C4:1 C4:1 C4/h:1 | E4:3 D4:2 C4:1 D4:2 | E4:3 E4:3 E4/h:3 | ' +
      'D4:2 E4:3 D4:2 C4:1 | D4:2 D4:2 D4/h:2 | E4:3 D4:2 C4:1 E4:3 | C4/w:1 | ' +
      'C4/qd:1 D4/8:2 E4/h:3 | E4/qd:3 D4/8:2 C4/h:1 | C4/8:1 D4/8:2 E4/8:3 D4/8:2 C4/h:1 | E4/8:3 D4/8:2 C4/8:1 D4/8:2 E4/h:3 | ' +
      'D4/qd:2 E4/8:3 D4:2 C4:1 | C4/8:1 D4/8:2 E4:3 E4/8:3 D4/8:2 C4:1 | E4/qd:3 D4/8:2 C4/qd:1 D4/8:2 | E4/w:3 | ' +
      'C4:1 E4:3 D4/h:2 | E4/hd:3 C4:1 | D4/8:2 E4/8:3 D4/8:2 C4/8:1 D4/h:2 | E4/w:3 | ' +
      'E4:3 D4:2 C4:1 D4:2 | E4/qd:3 D4/8:2 C4/h:1 | D4/h:2 E4/h:3 | C4/w:1',
  },
  {
    id: 'kid-rh-five',
    title: 'Bé tay phải: đủ 5 ngón',
    description: 'Năm ngón trên năm phím Đô Rê Mi Fa Sol — lên rồi xuống như cầu thang.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation:
      'C4/h:1 D4/h:2 | E4/h:3 F4/h:4 | G4/w:5 | G4/h:5 F4/h:4 | E4/h:3 D4/h:2 | ' +
      'C4/w:1 | C4:1 D4:2 E4:3 F4:4 | G4:5 F4:4 E4:3 D4:2 | C4/w:1',
  },
  {
    id: 'kid-rh-45',
    title: 'Bé tay phải: ngón 4 và 5',
    description: 'Luyện ngón áp út (4) và ngón út (5) — hai ngón yếu nhất.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation:
      'E4:3 F4:4 G4/h:5 | G4:5 F4:4 E4/h:3 | F4:4 G4:5 F4:4 G4:5 | F4/w:4 | ' +
      'E4:3 F4:4 G4:5 F4:4 | E4:3 D4:2 C4/h:1 | E4:3 G4:5 E4:3 G4:5 | C4/w:1',
  },
  {
    id: 'kid-rh-skip',
    title: 'Bé tay phải: nhảy ngón 1 – 3 – 5',
    description: 'Bỏ cách một ngón: Đô (1), Mi (3), Sol (5).',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    notation:
      'C4/h:1 E4/h:3 | G4/w:5 | G4/h:5 E4/h:3 | C4/w:1 | ' +
      'C4:1 E4:3 G4:5 E4:3 | C4:1 E4:3 G4/h:5 | G4:5 E4:3 C4:1 E4:3 | C4/w:1',
  },
  {
    id: 'kid-rh-hot-cross-buns',
    title: 'Bé chơi: Hot Cross Buns (tay phải)',
    description: 'Bài hát đầu tiên chỉ với ngón 3 – 2 – 1.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    tempo: 60,
    source: 'Đồng dao Anh "Hot Cross Buns" (thế kỷ 18) — phạm vi công cộng',
    notation: 'E4:3 D4:2 C4/h:1 | E4:3 D4:2 C4/h:1 | C4:1 C4:1 C4:1 C4:1 | D4:2 D4:2 D4:2 D4:2 | E4:3 D4:2 C4/h:1',
  },
  {
    id: 'kid-rh-mary',
    title: 'Bé chơi: Mary Had a Little Lamb (tay phải)',
    description: 'Bài hát quen thuộc với các ngón 1 – 2 – 3 và ngón 5.',
    category: 'kids',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'right',
    tempo: 60,
    source: 'Lowell Mason (1830s) — phạm vi công cộng',
    notation:
      'E4:3 D4:2 C4:1 D4:2 | E4:3 E4:3 E4/h:3 | D4:2 D4:2 D4/h:2 | E4:3 G4:5 G4/h:5 | ' +
      'E4:3 D4:2 C4:1 D4:2 | E4:3 E4:3 E4:3 E4:3 | D4:2 D4:2 E4:3 D4:2 | C4/w:1',
  },
  {
    id: 'kid-lh-543',
    title: 'Bé tay trái: ngón 5 – 4 – 3',
    description: 'Ngón út (5) đặt ở Đô3. Ngón 5 Đô, ngón 4 Rê, ngón 3 Mi (khoá Fa).',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    tempo: 60,
    notation:
      'C3/h:5 D3/h:4 | E3/w:3 | E3/h:3 D3/h:4 | C3/w:5 | ' +
      'C3:5 D3:4 E3:3 D3:4 | C3:5 D3:4 E3/h:3 | E3:3 D3:4 C3:5 D3:4 | C3/w:5',
  },
  {
    id: 'kid-lh-five',
    title: 'Bé tay trái: đủ 5 ngón',
    description: 'Tay trái đi từ ngón 5 (Đô) lên ngón cái (Sol) rồi quay về.',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    tempo: 60,
    notation:
      'C3/h:5 D3/h:4 | E3/h:3 F3/h:2 | G3/w:1 | G3/h:1 F3/h:2 | E3/h:3 D3/h:4 | ' +
      'C3/w:5 | C3:5 D3:4 E3:3 F3:2 | G3:1 F3:2 E3:3 D3:4 | C3/w:5',
  },
  {
    id: 'kid-lh-12',
    title: 'Bé tay trái: ngón 1 và 2',
    description: 'Ngón cái (1) ở Sol3, ngón trỏ (2) ở Fa3 — tập ngón cái tay trái.',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    tempo: 60,
    notation:
      'G3/h:1 F3/h:2 | E3/w:3 | G3:1 F3:2 G3:1 F3:2 | G3/w:1 | ' +
      'G3:1 F3:2 E3:3 F3:2 | G3:1 F3:2 E3/h:3 | E3:3 F3:2 G3:1 E3:3 | C3/w:5',
  },
  {
    id: 'kid-lh-123',
    title: 'Bé tay trái: ngón 1 – 2 – 3',
    description:
      'Ngón cái (1) ở Sol3, ngón 2 Fa3, ngón 3 Mi3 (khoá Fa). Bài dài 40 ô nhịp: nốt tròn, trắng, trắng chấm, đen, đen chấm và móc đơn.',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 2,
    hand: 'left',
    tempo: 60,
    sections: KIDS_123_SECTIONS,
    notation:
      'G3/w:1 | F3/w:2 | E3/w:3 | F3/h:2 G3/h:1 | G3/h:1 E3/h:3 | F3/w:2 | E3/h:3 F3/h:2 | G3/w:1 | ' +
      'G3/hd:1 F3:2 | E3/hd:3 F3:2 | G3/hd:1 E3:3 | F3/w:2 | E3:3 F3/hd:2 | G3:1 E3/hd:3 | F3/hd:2 G3:1 | G3/w:1 | ' +
      'G3:1 F3:2 E3:3 F3:2 | G3:1 G3:1 G3/h:1 | E3:3 F3:2 G3:1 F3:2 | E3:3 E3:3 E3/h:3 | ' +
      'F3:2 E3:3 F3:2 G3:1 | F3:2 F3:2 F3/h:2 | E3:3 F3:2 G3:1 E3:3 | G3/w:1 | ' +
      'G3/qd:1 F3/8:2 E3/h:3 | E3/qd:3 F3/8:2 G3/h:1 | G3/8:1 F3/8:2 E3/8:3 F3/8:2 G3/h:1 | E3/8:3 F3/8:2 G3/8:1 F3/8:2 E3/h:3 | ' +
      'F3/qd:2 E3/8:3 F3:2 G3:1 | G3/8:1 F3/8:2 E3:3 E3/8:3 F3/8:2 G3:1 | E3/qd:3 F3/8:2 G3/qd:1 F3/8:2 | E3/w:3 | ' +
      'G3:1 E3:3 F3/h:2 | E3/hd:3 G3:1 | F3/8:2 E3/8:3 F3/8:2 G3/8:1 F3/h:2 | E3/w:3 | ' +
      'E3:3 F3:2 G3:1 F3:2 | E3/qd:3 F3/8:2 G3/h:1 | F3/h:2 E3/h:3 | G3/w:1',
  },
  {
    id: 'kid-lh-skip',
    title: 'Bé tay trái: nhảy ngón 5 – 3 – 1',
    description: 'Bỏ cách một ngón: Đô (5), Mi (3), Sol (1).',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    tempo: 60,
    notation:
      'C3/h:5 E3/h:3 | G3/w:1 | G3/h:1 E3/h:3 | C3/w:5 | ' +
      'C3:5 E3:3 G3:1 E3:3 | C3:5 E3:3 G3/h:1 | G3:1 E3:3 C3:5 E3:3 | C3/w:5',
  },
  {
    id: 'kid-lh-hot-cross-buns',
    title: 'Bé chơi: Hot Cross Buns (tay trái)',
    description: 'Cùng bài hát nhưng bằng tay trái: ngón 3 – 4 – 5.',
    category: 'kids',
    clef: 'bass',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'left',
    tempo: 60,
    source: 'Đồng dao Anh "Hot Cross Buns" (thế kỷ 18) — phạm vi công cộng',
    notation: 'E3:3 D3:4 C3/h:5 | E3:3 D3:4 C3/h:5 | C3:5 C3:5 C3:5 C3:5 | D3:4 D3:4 D3:4 D3:4 | E3:3 D3:4 C3/h:5',
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
    id: 'song-romance-2-hands',
    title: "Romance d'Amour (hai tay)",
    description:
      'Bản piano dễ (Rê thứ, nhịp 3/4) đúng như bản in: tay phải giai điệu, tay trái đệm hợp âm (đoạn A) và rải hợp âm (đoạn B). ' +
      'App chấm giai điệu tay phải; tay trái đánh kèm theo khuông Fa.',
    category: 'song',
    clef: 'grand',
    timeSignature: [3, 4],
    keySignature: 'Dm',
    difficulty: 3,
    hand: 'both',
    tempo: 100,
    sections: [
      { measure: 1, label: 'A' },
      { measure: 17, label: 'B' },
    ],
    source: 'Khuyết danh, nhạc guitar Tây Ban Nha thế kỷ 19 — phạm vi công cộng; bản piano dễ Rê thứ',
    notation:
      // Đoạn A (ô 1–16) và đoạn B (ô 17–32): giai điệu tay phải giống nhau.
      ROMANCE_MELODY + ' | ' + ROMANCE_MELODY,
    accompanimentNotation:
      // Đoạn A: hợp âm giữ cả ô nhịp.
      'D3+F3+A3/hd:5+3+1 | D3+F3+A3/hd | D3+F3+A3/hd | D3+F3+A3/hd | D3+F3+A3/hd | D3+F3+A3/hd | ' +
      'G2+Bb2+D3/hd:5+(3)+1 | G2+Bb2+D3/hd | A2+C#3+E3/hd:5+(3)+1 | A2+C#3+E3/hd | D3+F3+A3/hd:5+3+1 | D3+F3+A3/hd | ' +
      'A2+C#3+E3/hd | A2+C#3+E3/hd | D3+F3+A3/hd | D3+F3+A3/hd | ' +
      // Đoạn B: rải hợp âm từng nốt đen.
      'D3:5 F3:3 A3:1 | D3 F3 A3 | D3 F3 A3 | D3 F3 A3 | D3 F3 A3 | D3 F3 A3 | ' +
      'G2:5 Bb2:(3) D3:1 | G2 Bb2 D3 | A2:5 C#3:(3) E3:1 | A2 C#3 E3 | D3 F3 A3 | D3 F3 A3 | ' +
      'A2 C#3 E3 | A2 C#3 E3 | D3 F3 A3 | D3/hd',
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
  {
    id: 'song-happy-birthday',
    title: 'Happy Birthday (Chúc mừng sinh nhật)',
    description: 'Bài hát chúc mừng sinh nhật (Đô trưởng, nhịp 3/4), bắt đầu bằng nhịp lấy đà.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    pickup: 1,
    difficulty: 2,
    hand: 'right',
    source: 'Giai điệu "Good Morning to All", Mildred & Patty Hill (1893) — phạm vi công cộng',
    notation:
      'G4/8d G4/16 | A4 G4 C5 | B4/h G4/8d G4/16 | A4 G4 D5 | C5/h G4/8d G4/16 | ' +
      'G5 E5 C5 | B4 A4 F5/8d F5/16 | E5 C5 D5 | C5/hd',
  },
  {
    id: 'song-london-bridge',
    title: 'London Bridge (Cây cầu London)',
    description: 'Đồng dao Anh (Đô trưởng), các bước liền bậc dễ chơi.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    source: 'Đồng dao Anh — phạm vi công cộng',
    notation:
      'G4/qd A4/8 G4 F4 | E4 F4 G4/h | D4 E4 F4/h | E4 F4 G4/h | ' +
      'G4/qd A4/8 G4 F4 | E4 F4 G4/h | D4/h G4 E4 | C4/w',
  },
  {
    id: 'song-au-clair',
    title: 'Au clair de la lune (Dưới ánh trăng)',
    description: 'Dân ca Pháp (Đô trưởng), đoạn giữa xuống tới Sol3.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 1,
    hand: 'right',
    source: 'Dân ca Pháp thế kỷ 18 — phạm vi công cộng',
    notation:
      'C4 C4 C4 D4 | E4/h D4/h | C4 E4 D4 D4 | C4/w | C4 C4 C4 D4 | E4/h D4/h | C4 E4 D4 D4 | C4/w | ' +
      'D4 D4 D4 D4 | A3/h A3/h | D4 C4 B3 A3 | G3/w | C4 C4 C4 D4 | E4/h D4/h | C4 E4 D4 D4 | C4/w',
  },
  {
    id: 'song-old-macdonald',
    title: 'Old MacDonald Had a Farm',
    description: 'Bài hát thiếu nhi (Sol trưởng) về nông trại của ông MacDonald.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    keySignature: 'G',
    difficulty: 1,
    hand: 'right',
    source: 'Bài hát dân gian Mỹ — phạm vi công cộng',
    notation: 'G4 G4 G4 D4 | E4 E4 D4/h | B4 B4 A4 A4 | G4/hd D4 | G4 G4 G4 D4 | E4 E4 D4/h | B4 B4 A4 A4 | G4/w',
  },
  {
    id: 'song-row-boat',
    title: 'Row, Row, Row Your Boat',
    description: 'Bài hát thiếu nhi (Đô trưởng, nhịp 6/8) — luyện nhóm ba nốt móc đơn.',
    category: 'song',
    clef: 'treble',
    timeSignature: [6, 8],
    difficulty: 2,
    hand: 'right',
    source: 'Bài hát dân gian Mỹ (1852) — phạm vi công cộng',
    notation:
      'C4/qd C4/qd | C4 D4/8 E4/qd | E4 D4/8 E4 F4/8 | G4/hd | ' +
      'C5/8 C5/8 C5/8 G4/8 G4/8 G4/8 | E4/8 E4/8 E4/8 C4/8 C4/8 C4/8 | G4 F4/8 E4 D4/8 | C4/hd',
  },
  {
    id: 'song-yankee-doodle',
    title: 'Yankee Doodle',
    description: 'Bài hát dân gian Mỹ (Sol trưởng), vui tươi.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    keySignature: 'G',
    difficulty: 2,
    hand: 'right',
    source: 'Bài hát dân gian Mỹ thế kỷ 18 — phạm vi công cộng',
    notation:
      'G4 G4 A4 B4 | G4 B4 A4 D4 | G4 G4 A4 B4 | G4/h F#4/h | ' +
      'G4 G4 A4 B4 | C5 B4 A4 G4 | F#4 D4 E4 F#4 | G4/h G4/h',
  },
  {
    id: 'song-oh-susanna',
    title: 'Oh! Susanna',
    description: 'Bài hát của Stephen Foster (Đô trưởng), bắt đầu bằng nhịp lấy đà.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    pickup: 1,
    difficulty: 2,
    hand: 'right',
    source: 'Stephen Foster (1848) — phạm vi công cộng',
    notation:
      'C4/8 D4/8 | E4 G4 G4/qd A4/8 | G4 E4 C4/qd D4/8 | E4 E4 D4 C4 | D4/hd C4/8 D4/8 | ' +
      'E4 G4 G4/qd A4/8 | G4 E4 C4/qd D4/8 | E4 E4 D4 D4 | C4/w',
  },
  {
    id: 'song-clementine',
    title: 'Oh My Darling, Clementine',
    description: 'Bài hát dân gian Mỹ (Đô trưởng, nhịp 3/4), xuống tới Sol3.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    pickup: 1,
    difficulty: 2,
    hand: 'right',
    source: 'Percy Montrose (1884) — phạm vi công cộng',
    notation:
      'C4/8 C4/8 | C4 G3 E4/8 E4/8 | E4 C4 C4/8 E4/8 | G4/qd G4/8 F4/8 E4/8 | D4/h D4/8 E4/8 | ' +
      'F4 F4 E4/8 D4/8 | E4 C4 C4/8 E4/8 | D4/qd G3/8 B3/8 D4/8 | C4/hd',
  },
  {
    id: 'song-sakura',
    title: 'Sakura Sakura (Hoa anh đào)',
    description: 'Dân ca Nhật Bản, âm giai ngũ cung La – Si – Đô – Mi – Fa.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    keySignature: 'Am',
    difficulty: 2,
    hand: 'right',
    source: 'Dân ca Nhật Bản (thời Edo) — phạm vi công cộng',
    notation:
      'A4 A4 B4/h | A4 A4 B4/h | A4 B4 C5 B4 | A4 B4/8 A4/8 F4/h | E4 C4 E4 F4 | E4 E4/8 C4/8 B3/h | ' +
      'A4 B4 C5 B4 | A4 B4/8 A4/8 F4/h | E4 C4 E4 F4 | E4 E4/8 C4/8 B3/h | ' +
      'A4 A4 B4/h | A4 A4 B4/h | E4 F4 B4/8 A4/8 F4 | E4/w',
  },
  {
    id: 'song-auld-lang-syne',
    title: 'Auld Lang Syne (Bài ca tạm biệt)',
    description: 'Bài hát tiễn năm cũ của Scotland (Fa trưởng), bắt đầu bằng nhịp lấy đà.',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    keySignature: 'F',
    pickup: 1,
    difficulty: 2,
    hand: 'right',
    source: 'Dân ca Scotland, lời Robert Burns (1788) — phạm vi công cộng',
    notation:
      'C4 | F4/qd F4/8 F4 A4 | G4/qd F4/8 G4 A4 | F4/qd F4/8 A4 C5 | D5/hd D5 | ' +
      'C5/qd A4/8 A4 F4 | G4/qd F4/8 G4 A4 | F4/qd D4/8 D4 C4 | F4/w',
  },
  {
    id: 'song-amazing-grace',
    title: 'Amazing Grace',
    description: 'Thánh ca (Sol trưởng, nhịp 3/4), giai điệu "New Britain".',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    keySignature: 'G',
    pickup: 1,
    difficulty: 2,
    hand: 'right',
    source: 'Giai điệu "New Britain" (1829), lời John Newton — phạm vi công cộng',
    notation:
      'D4 | G4/h B4/8 G4/8 | B4/h A4 | G4/h E4 | D4/h D4 | G4/h B4/8 G4/8 | B4/h A4/8 B4/8 | D5/hd | D5/h B4 | ' +
      'D5/qd B4/8 D5/8 B4/8 | G4/h D4 | E4/qd G4/8 G4/8 E4/8 | D4/h D4 | G4/h B4/8 G4/8 | B4/h A4 | G4/hd',
  },
  {
    id: 'song-silent-night',
    title: 'Silent Night (Đêm thánh vô cùng)',
    description: 'Bài hát Giáng sinh (Đô trưởng, nhịp 3/4).',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    difficulty: 2,
    hand: 'right',
    source: 'Franz Xaver Gruber (1818) — phạm vi công cộng',
    notation:
      'G4/qd A4/8 G4 | E4/hd | G4/qd A4/8 G4 | E4/hd | D5/h D5 | B4/hd | C5/h C5 | G4/hd | ' +
      'A4/h A4 | C5/qd B4/8 A4 | G4/qd A4/8 G4 | E4/hd | A4/h A4 | C5/qd B4/8 A4 | G4/qd A4/8 G4 | E4/hd | ' +
      'D5/h D5 | F5/qd D5/8 B4 | C5/hd | E5/hd | C5 G4 E4 | G4/qd F4/8 D4 | C4/hd',
  },
  {
    id: 'song-greensleeves',
    title: 'Greensleeves',
    description: 'Dân ca Anh thời Phục hưng (La thứ, nhịp 3/4), có Sol thăng ở cuối câu.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    keySignature: 'Am',
    pickup: 1,
    difficulty: 3,
    hand: 'right',
    source: 'Dân ca Anh thế kỷ 16 — phạm vi công cộng',
    notation:
      'A4 | C5/h D5 | E5/qd F5/8 E5 | D5/h B4 | G4/qd A4/8 B4 | C5/h A4 | A4/qd G#4/8 A4 | B4/h G#4 | E4/h A4 | ' +
      'C5/h D5 | E5/qd F5/8 E5 | D5/h B4 | G4/qd A4/8 B4 | C5/qd B4/8 A4 | G#4/qd F#4/8 G#4 | A4/hd',
  },
  {
    id: 'song-minuet-g',
    title: 'Minuet in G',
    description: 'Minuet Sol trưởng trong sổ tay Anna Magdalena Bach — giai điệu tay phải, 16 ô nhịp.',
    category: 'song',
    clef: 'treble',
    timeSignature: [3, 4],
    keySignature: 'G',
    difficulty: 3,
    hand: 'right',
    source: 'Christian Petzold (khoảng 1725) — phạm vi công cộng',
    notation:
      'D5 G4/8 A4/8 B4/8 C5/8 | D5 G4 G4 | E5 C5/8 D5/8 E5/8 F#5/8 | G5 G4 G4 | ' +
      'C5 D5/8 C5/8 B4/8 A4/8 | B4 C5/8 B4/8 A4/8 G4/8 | F#4 G4/8 A4/8 B4/8 G4/8 | A4/hd | ' +
      'D5 G4/8 A4/8 B4/8 C5/8 | D5 G4 G4 | E5 C5/8 D5/8 E5/8 F#5/8 | G5 G4 G4 | ' +
      'C5 D5/8 C5/8 B4/8 A4/8 | B4 C5/8 B4/8 A4/8 G4/8 | A4 B4/8 A4/8 G4/8 F#4/8 | G4/hd',
  },
  {
    id: 'song-prelude-c',
    title: 'Prelude in C (Bach)',
    description: '4 ô nhịp đầu Prelude Đô trưởng BWV 846 — hợp âm rải từng nốt (bản gốc chơi bằng hai tay).',
    category: 'song',
    clef: 'treble',
    timeSignature: [4, 4],
    difficulty: 3,
    hand: 'right',
    source: 'J. S. Bach, Das Wohltemperierte Klavier I (1722) — phạm vi công cộng',
    notation:
      'C4/16 E4/16 G4/16 C5/16 E5/16 G4/16 C5/16 E5/16 C4/16 E4/16 G4/16 C5/16 E5/16 G4/16 C5/16 E5/16 | ' +
      'C4/16 D4/16 A4/16 D5/16 F5/16 A4/16 D5/16 F5/16 C4/16 D4/16 A4/16 D5/16 F5/16 A4/16 D5/16 F5/16 | ' +
      'B3/16 D4/16 G4/16 D5/16 F5/16 G4/16 D5/16 F5/16 B3/16 D4/16 G4/16 D5/16 F5/16 G4/16 D5/16 F5/16 | ' +
      'C4/16 E4/16 G4/16 C5/16 E5/16 G4/16 C5/16 E5/16 C4/16 E4/16 G4/16 C5/16 E5/16 G4/16 C5/16 E5/16',
  },
];

export const LESSONS: Lesson[] = defs.map(({ notation, accompanimentNotation, ...rest }) => ({
  ...rest,
  notes: parseNotes(notation),
  ...(accompanimentNotation ? { accompaniment: parseAccompaniment(accompanimentNotation) } : {}),
}));
