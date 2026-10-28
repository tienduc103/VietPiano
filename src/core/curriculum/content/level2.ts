/**
 * Cấp độ 2 — "Mở rộng tầm tay": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Nội dung: thế tay Sol (đủ bảy nốt, C4–D5), đổi thế tay, tay trái thế Sol (G2–D3) và đọc khoá Fa,
 * nhịp 3/4, nốt trắng chấm dôi, dấu lặng trắng, quãng (bước liền / nhảy, quãng 5, quãng 8).
 * Mọi giai điệu là bài tập tự soạn cho giáo trình VietPiano.
 * Thế tay: tay phải thế Đô (1 = C4) và thế Sol (1 = G4); tay trái thế Đô (5 = C3) và thế Sol (5 = G2).
 */
import type { ChoiceQuestion, CurriculumLesson, KeyQuizRound, Piece, Week } from '../types';
import { both, buildLessons, countPage, in34, keyboardPage, KEYS, lh, NO_DURATION_MIC, NO_FINGER_CHECK, play, practice, rh, staffPage, type LessonDef } from './helpers';

const LEVEL = 'level-2';
const KIDS_SLOWER = { kids: { tempoPercent: 85 } };

const R = {
  anyA: { prompt: 'Bấm một nốt La (A) bất kỳ', target: { type: 'pitch-class', pc: 9 } },
  anyB: { prompt: 'Bấm một nốt Si (B) bất kỳ', target: { type: 'pitch-class', pc: 11 } },
  anyG: { prompt: 'Bấm một nốt Sol (G) bất kỳ', target: { type: 'pitch-class', pc: 7 } },
  g4: { prompt: 'Bấm Sol (G4) — chỗ đặt ngón 1 của thế tay Sol', target: { type: 'midi', midi: 67 } },
  a4: { prompt: 'Bấm La (A4)', target: { type: 'midi', midi: 69 } },
  b4: { prompt: 'Bấm Si (B4)', target: { type: 'midi', midi: 71 } },
  c5: { prompt: 'Bấm Đô cao (C5)', target: { type: 'midi', midi: 72 } },
  d5: { prompt: 'Bấm Rê cao (D5)', target: { type: 'midi', midi: 74 } },
  octaveUpC: { prompt: 'Bấm nốt Đô cao hơn Đô giữa một quãng 8 (C5)', target: { type: 'midi', midi: 72 } },
  octaveDownC: { prompt: 'Bấm nốt Đô thấp hơn Đô giữa một quãng 8 (C3)', target: { type: 'midi', midi: 48 } },
  fifthG: { prompt: 'Bấm nốt Sol cách Đô giữa một quãng 5 lên (G4)', target: { type: 'midi', midi: 67 } },
  octaveDownG: { prompt: 'Bấm nốt Sol thấp hơn G4 một quãng 8 (G3)', target: { type: 'midi', midi: 55 } },
} satisfies Record<string, KeyQuizRound>;

const STEP_OR_SKIP = ['Bước liền (quãng 2)', 'Nhảy (quãng 3)'];
const interval = (notation: string, answer: number): ChoiceQuestion => ({
  prompt: 'Hai nốt này đi bước liền hay nhảy quãng?',
  options: STEP_OR_SKIP,
  answer,
  illustration: { type: 'staff', piece: rh(notation) },
});

const Q = {
  gThumb: { prompt: 'Thế tay Sol: ngón 1 tay phải đặt ở nốt nào?', options: ['C4 (Đô giữa)', 'G4 (Sol)', 'D5 (Rê cao)'], answer: 1 },
  lhGPinky: { prompt: 'Tay trái thế Sol: ngón 5 đặt ở nốt nào?', options: ['G2 (Sol thấp)', 'C3 (Đô thấp)', 'D3 (Rê)'], answer: 0 },
  shiftWhen: {
    prompt: 'Nên dời cả bàn tay sang thế mới lúc nào?',
    options: ['Lúc có dấu lặng hoặc nốt dài', 'Giữa một nốt ngắn', 'Không bao giờ dời tay'],
    answer: 0,
  },
  threeFour: { prompt: 'Nhịp 3/4: mỗi ô nhịp có mấy phách?', options: ['2 phách', '3 phách', '4 phách'], answer: 1 },
  strongBeat: { prompt: 'Trong nhịp 3/4, phách nào là phách mạnh?', options: ['Phách 1', 'Phách 2', 'Phách 3'], answer: 0 },
  dottedHalf: { prompt: 'Nốt trắng chấm dôi dài mấy phách?', options: ['2 phách', '3 phách', '4 phách'], answer: 1 },
  halfRest: { prompt: 'Dấu lặng trắng nghỉ mấy phách?', options: ['1 phách', '2 phách', '4 phách'], answer: 1 },
  octave: { prompt: 'Từ một nốt Đô tới nốt Đô kế tiếp là quãng mấy?', options: ['Quãng 3', 'Quãng 5', 'Quãng 8'], answer: 2 },
  fifth: { prompt: 'Từ C4 lên G4 là quãng mấy?', options: ['Quãng 3', 'Quãng 5', 'Quãng 8'], answer: 1 },
  a4Space: { prompt: 'Trên khoá Sol, La (A4) nằm ở đâu?', options: ['Dòng 2', 'Khe 2', 'Dòng 3'], answer: 1 },
} satisfies Record<string, ChoiceQuestion>;

/** "Điệu valse nhỏ" — tự soạn, 3/4, tay phải thế Sol (8 ô nhịp). */
const LITTLE_WALTZ = 'G4:1 B4:3 D5:5 | C5/h:4 B4:3 | A4:2 C5:4 B4:3 | G4/hd:1 | B4:3 A4:2 G4:1 | A4/h:2 B4:3 | C5:4 B4:3 A4:2 | G4/hd:1';

/** Hai tay thế Sol thay phiên — tự soạn, 4/4 (8 ô nhịp). */
const HANDS_G =
  'RH G4:1 A4:2 B4/h:3 | LH D3:1 C3:2 B2/h:3 | RH B4:3 C5:4 D5/h:5 | LH B2:3 A2:4 G2/h:5 | ' +
  'RH D5:5 C5:4 B4:3 A4:2 | LH A2:4 B2:3 C3:2 D3:1 | RH B4:3 A4:2 G4/h:1 | LH G2/hd:5 R';

/** Valse hai tay — tự soạn, 3/4, hai tay thế Sol (8 ô nhịp). */
const WALTZ_HANDS = 'RH G4:1 B4:3 D5:5 | C5/h:4 B4:3 | LH D3:1 C3:2 B2:3 | A2/hd:4 | RH A4:2 B4:3 C5:4 | B4/h:3 A4:2 | G4/hd:1 | LH G2/hd:5';

/** "Đường về" — tự soạn, 4/4, tay phải thế Đô, tay trái thế Sol, thay phiên (8 ô nhịp). */
const WAY_HOME =
  'RH E4:3 G4:5 F4:4 D4:2 | E4/h:3 C4/h:1 | LH D3:1 B2:3 G2/h:5 | A2:4 B2:3 C3/h:2 | ' +
  'RH D4:2 E4:3 F4:4 G4:5 | F4:4 D4:2 E4/h:3 | LH B2:3 A2:4 B2:3 D3:1 | G2/hd:5 R';

/** "Valse tốt nghiệp" — tự soạn, bài cuối cấp 2: 3/4, hai tay thế Sol thay phiên (8 ô nhịp). */
const GRADUATION_WALTZ =
  'RH G4:1 A4:2 B4:3 | D5/h:5 B4:3 | LH D3:1 C3:2 B2:3 | G2/hd:5 | ' +
  'RH C5:4 B4:3 A4:2 | B4/h:3 G4:1 | LH A2:4 B2:3 C3:2 | G2/h:5 R';

const gPositionKeys = (from = 62, to = 76) => ({ type: 'keyboard' as const, from, to, highlight: [67, 69, 71, 72, 74], fingers: { 67: 1, 69: 2, 71: 3, 72: 4, 74: 5 } });
const lhGPositionKeys = { type: 'keyboard' as const, from: 41, to: 53, highlight: [43, 45, 47, 48, 50], fingers: { 43: 5, 45: 4, 47: 3, 48: 2, 50: 1 } };
const waltz = (notation: string, bpm = 72, title?: string): Piece => in34(rh(notation, bpm, title));

const defs: LessonDef[] = [
  // ── Tuần 1 — Thế tay Sol, đủ bảy nốt ────────────────────────────────
  {
    lessonId: 'l2-01-g-position',
    weekId: 'l2-w1',
    number: 1,
    title: 'Thế tay Sol',
    description: 'Dời tay phải lên: ngón 1 ở Sol (G4). Năm ngón giờ chơi được Sol – La – Si – Đô – Rê.',
    learningObjectives: ['Đặt tay phải ở thế Sol (G4–D5)', 'Tìm nốt La và Si trên đàn', 'Chơi G4 – A4 – B4 bằng ngón 1 – 2 – 3'],
    estimatedDuration: 12,
    prerequisites: ['l1-20-final'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Thế tay Sol',
        pages: [
          keyboardPage('La và Si', 'La (A) và Si (B) là hai phím trắng cuối của nhóm 3 phím đen — ngay sau Sol. Giờ bạn đã biết đủ bảy nốt: Đô Rê Mi Fa Sol La Si.', [69, 71], 'La và Si là hai bạn mới, đứng ngay sau Sol!'),
          { title: 'Dời tay lên thế Sol', body: 'Đặt ngón 1 lên Sol (G4), các ngón 2 – 3 – 4 – 5 lần lượt ở La, Si, Đô cao, Rê cao.', illustration: gPositionKeys() },
          staffPage('Nghe mẫu', 'Ba nốt Sol – La – Si đi lên rồi đi xuống.', rh('G4:1 A4:2 B4/h:3 | B4:3 A4:2 G4/h:1')),
        ],
      },
    ],
    exercises: [
      practice({ kind: 'key-quiz', id: 'warmup', title: 'Luyện tìm La, Si, Sol', keyboard: KEYS, retry: true, rounds: [R.anyA, R.anyB, R.g4, R.a4], pass: {} }),
      { kind: 'key-quiz', id: 'test', title: 'Kiểm tra: tìm nốt mới', keyboard: KEYS, retry: false, rounds: [R.anyA, R.anyB, R.g4, R.a4, R.b4], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi thế tay Sol', 'wait', rh('G4:1 A4:2 B4/h:3 | B4:3 A4:2 G4/h:1 | G4:1 B4:3 A4:2 G4:1 | A4:2 B4:3 G4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-02-a-b-staff',
    weekId: 'l2-w1',
    number: 2,
    title: 'La và Si trên khuông',
    description: 'La (A4) nằm trong khe 2, Si (B4) nằm trên dòng 3 — giữa khuông nhạc.',
    learningObjectives: ['Đọc A4 (khe 2) và B4 (dòng 3)', 'Phân biệt F4 – G4 – A4 – B4', 'Chơi theo khuông ở thế Sol'],
    estimatedDuration: 15,
    prerequisites: ['l2-01-g-position'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'La và Si',
        pages: [
          staffPage('Khe 2 và dòng 3', 'Đi tiếp từ Sol (dòng 2): La ở khe 2, Si ở dòng 3 — dòng chính giữa khuông.', rh('G4/h A4/h | B4/w'), 'Sol trên dòng 2, La trong khe, Si ngồi giữa khuông!'),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['A4', 'B4', 'G4', 'B4', 'A4', 'F4', 'B4', 'A4'], choices: ['F4', 'G4', 'A4', 'B4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['B4', 'A4', 'G4', 'A4', 'B4', 'G4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông: Sol – La – Si', 'wait', rh('G4:1 A4:2 B4:3 A4:2 | G4/h:1 B4/h:3 | A4:2 B4:3 A4:2 G4:1 | A4/w:2')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-03-c5-d5',
    weekId: 'l2-w1',
    number: 3,
    title: 'Đô cao và Rê cao',
    description: 'Đô cao (C5) ở khe 3, Rê cao (D5) ở dòng 4 — ngón 4 và ngón 5 của thế tay Sol.',
    learningObjectives: ['Đọc C5 (khe 3) và D5 (dòng 4)', 'Dùng đủ 5 ngón ở thế Sol', 'Biết C5 cao hơn C4 một quãng 8'],
    estimatedDuration: 15,
    prerequisites: ['l2-02-a-b-staff'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đô cao, Rê cao',
        pages: [
          staffPage('Khe 3 và dòng 4', 'Sau Si (dòng 3) là Đô cao (khe 3) rồi Rê cao (dòng 4).', rh('B4/h C5/h | D5/w')),
          { title: 'Năm ngón thế Sol', body: 'Ngón 4 ở Đô cao (C5), ngón 5 ở Rê cao (D5).', illustration: gPositionKeys() },
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['C5', 'D5', 'B4', 'C5', 'A4', 'D5', 'C5', 'B4'], choices: ['A4', 'B4', 'C5', 'D5'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi đủ năm ngón thế Sol', 'wait', rh('G4:1 B4:3 D5/h:5 | C5:4 B4:3 A4/h:2 | B4:3 C5:4 D5:5 B4:3 | C5:4 A4:2 G4/h:1'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-04-position-shift',
    weekId: 'l2-w1',
    number: 4,
    title: 'Đổi thế tay Đô ↔ Sol',
    description: 'Chơi thế Đô, dời tay lên thế Sol trong lúc nghỉ, rồi quay về — số ngón trên khuông cho biết lúc nào đã đổi thế.',
    learningObjectives: ['Dời tay trong dấu lặng / nốt dài', 'Nhận ra đổi thế qua số ngón tay', 'Chơi liền mạch qua hai thế tay'],
    estimatedDuration: 15,
    prerequisites: ['l2-03-c5-d5'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đổi thế tay',
        pages: [
          staffPage(
            'Dời tay lúc nghỉ',
            'Ô 1–2 ở thế Đô (ngón 1 ở C4). Trong dấu lặng cuối ô 2, nhấc tay dời lên thế Sol (ngón 1 ở G4).',
            rh('C4:1 D4:2 E4:3 F4:4 | G4/hd:5 R | G4:1 A4:2 B4:3 C5:4 | D5/w:5'),
            'Nghỉ một chút là lúc bàn tay "nhảy" sang nhà mới!',
          ),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: thế tay', questions: [Q.gThumb, Q.shiftWhen], pass: { minAccuracy: 0.5 } },
      practice(play('warmup', 'Luyện: lên thế Sol', 'wait', rh('C4:1 D4:2 E4:3 F4:4 | G4/hd:5 R | G4:1 A4:2 B4:3 C5:4 | D5/hd:5 R'))),
      play(
        'test',
        'Bài chính: lên rồi xuống',
        'wait',
        rh('C4:1 D4:2 E4:3 F4:4 | G4/hd:5 R | G4:1 A4:2 B4:3 C5:4 | D5/hd:5 R | D5:5 C5:4 B4:3 A4:2 | G4/hd:1 R | G4:5 F4:4 E4:3 D4:2 | C4/hd:1 R'),
        { weight: 2, pass: { minAccuracy: 0.85, minCompletion: 1 } },
      ),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-05-week1-test',
    weekId: 'l2-w1',
    number: 5,
    title: 'Kiểm tra tuần 1 (cấp 2)',
    description: 'Đọc nốt C4 – D5, tìm nốt mới trên đàn và chơi bài có đổi thế tay. Cần 80/100 điểm.',
    learningObjectives: ['Đọc đủ bảy nốt trên khoá Sol', 'Tìm La, Si, Sol trên đàn', 'Chơi bài có đổi thế tay'],
    estimatedDuration: 15,
    prerequisites: ['l2-04-position-shift'],
    activities: [],
    exercises: [
      {
        kind: 'note-reading',
        id: 'name',
        title: 'Phần 1: gọi tên nốt',
        clef: 'treble',
        answer: 'name',
        sequence: ['A4', 'D4', 'C5', 'F4', 'B4', 'G4', 'D5', 'E4'],
        choices: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
        pass: { minAccuracy: 0.8 },
      },
      { kind: 'key-quiz', id: 'keys', title: 'Phần 2: tìm nốt', keyboard: KEYS, retry: false, rounds: [R.anyB, R.g4, R.anyA, R.c5, R.d5], pass: { minAccuracy: 0.8 } },
      play('play', 'Phần 3: chơi bài', 'wait', rh('E4:3 F4:4 G4/h:5 | G4:1 A4:2 B4/h:3 | C5:4 B4:3 A4:2 G4:1 | A4:2 B4:3 G4/h:1'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Tay trái mở rộng ───────────────────────────────────────
  {
    lessonId: 'l2-06-bass-a-b',
    weekId: 'l2-w2',
    number: 6,
    title: 'Khoá Fa: thêm La và Si',
    description: 'Ôn C3 – G3 trên khoá Fa và đọc thêm La (A3, dòng 5) và Si (B3, trên khuông).',
    learningObjectives: ['Đọc lại C3 – G3', 'Đọc A3 (dòng 5) và B3 (sát trên khuông)', 'Chơi tay trái qua bảy nốt'],
    estimatedDuration: 15,
    prerequisites: ['l2-05-week1-test'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Khoá Fa',
        pages: [
          staffPage('Lên tới đỉnh khuông', 'Sau Sol (G3, khe 4) là La (A3) trên dòng 5, rồi Si (B3) nằm sát trên khuông. Tiếp theo là Đô giữa — trên một dòng kẻ phụ.', lh('G3/h A3/h | B3/h C4/h')),
        ],
      },
    ],
    exercises: [
      {
        kind: 'note-reading',
        id: 'name',
        title: 'Gọi tên nốt khoá Fa',
        clef: 'bass',
        answer: 'name',
        sequence: ['C3', 'E3', 'G3', 'A3', 'F3', 'B3', 'D3', 'A3'],
        choices: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'],
        pass: { minAccuracy: 0.8 },
      },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'bass', answer: 'play', sequence: ['A3', 'B3', 'G3', 'C3', 'A3', 'E3'], pass: { minAccuracy: 0.8 } },
      play('play', 'Tay trái đi lên tới Si', 'wait', lh('C3:5 D3:4 E3:3 F3:2 | G3:1 A3 B3 A3 | G3:1 F3:2 E3:3 D3:4 | C3/w:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-07-lh-g-position',
    weekId: 'l2-w2',
    number: 7,
    title: 'Tay trái thế Sol',
    description: 'Tay trái dời xuống: ngón 5 ở Sol thấp (G2, dòng 1 khoá Fa), ngón 1 ở Rê (D3).',
    learningObjectives: ['Đặt tay trái ở thế Sol (G2–D3)', 'Đọc G2, A2, B2 trên khoá Fa', 'Chơi bài tay trái thế Sol'],
    estimatedDuration: 15,
    prerequisites: ['l2-06-bass-a-b'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Thế Sol tay trái',
        pages: [
          { title: 'Năm ngón tay trái', body: 'Ngón 5 ở G2, rồi 4 – 3 – 2 – 1 ở A2, B2, C3, D3.', illustration: lhGPositionKeys },
          staffPage('Trên khoá Fa', 'G2 nằm trên dòng 1, A2 khe 1, B2 dòng 2, C3 khe 2, D3 dòng 3.', lh('G2:5 A2:4 B2:3 C3:2 | D3/w:1')),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'bass', answer: 'play', sequence: ['G2', 'B2', 'D3', 'A2', 'C3', 'G2'], pass: { minAccuracy: 0.8 } },
      play('play1', 'Đi lên – đi xuống', 'wait', lh('G2:5 A2:4 B2:3 C3:2 | D3/w:1 | D3:1 C3:2 B2:3 A2:4 | G2/w:5')),
      play('play2', 'Nhảy bậc', 'wait', lh('G2:5 B2:3 D3/h:1 | C3:2 B2:3 A2/h:4 | B2:3 A2:4 B2:3 C3:2 | G2/w:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-08-bass-reading',
    weekId: 'l2-w2',
    number: 8,
    title: 'Đọc nốt khoá Fa',
    description: 'Năm dòng khoá Fa từ dưới lên: Sol – Si – Rê – Fa – La; bốn khe: La – Đô – Mi – Sol.',
    learningObjectives: ['Thuộc tên các dòng và khe khoá Fa', 'Đọc nhanh G2 – A3', 'Chơi bài tay trái đọc từ khuông'],
    estimatedDuration: 15,
    prerequisites: ['l2-07-lh-g-position'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dòng và khe',
        pages: [
          staffPage('Năm dòng', 'Dòng kẻ khoá Fa từ dưới lên: Sol – Si – Rê – Fa – La.', lh('G2 B2 D3 F3 | A3/w')),
          staffPage('Bốn khe', 'Khe khoá Fa từ dưới lên: La – Đô – Mi – Sol.', lh('A2 C3 E3 G3 | C3/w')),
        ],
      },
    ],
    exercises: [
      {
        kind: 'note-reading',
        id: 'name',
        title: 'Gọi tên nốt khoá Fa',
        clef: 'bass',
        answer: 'name',
        sequence: ['G2', 'B2', 'D3', 'F3', 'A3', 'C3', 'E3', 'G3'],
        choices: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3'],
        pass: { minAccuracy: 0.8 },
      },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'bass', answer: 'play', sequence: ['F3', 'A2', 'D3', 'G2', 'C3', 'E3'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông khoá Fa', 'wait', lh('G2:5 A2:4 B2:3 G2:5 | D3/h:1 B2/h:3 | C3:2 B2:3 A2:4 C3:2 | G2/w:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-09-hands-g',
    weekId: 'l2-w2',
    number: 9,
    title: 'Hai tay thế Sol',
    description: 'Tay phải thế Sol, tay trái thế Sol — hai tay thay phiên trên khuông đôi, 8 ô nhịp.',
    learningObjectives: ['Đọc khuông đôi với nốt mới', 'Thay tay đúng lúc', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l2-08-bass-reading'],
    notes: [NO_DURATION_MIC],
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', both(HANDS_G, 60, 'Hai tay thế Sol'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', both(HANDS_G, 60, 'Hai tay thế Sol'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-10-week2-test',
    weekId: 'l2-w2',
    number: 10,
    title: 'Kiểm tra tuần 2 (cấp 2)',
    description: 'Đọc nốt khoá Fa và khoá Sol, chơi bài hai tay thay phiên. Cần 80/100 điểm.',
    learningObjectives: ['Đọc nốt khoá Fa G2 – A3', 'Đánh đúng nốt khoá Sol G4 – D5', 'Chơi bài hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l2-09-hands-g'],
    activities: [],
    exercises: [
      {
        kind: 'note-reading',
        id: 'bass',
        title: 'Phần 1: gọi tên nốt khoá Fa',
        clef: 'bass',
        answer: 'name',
        sequence: ['B2', 'F3', 'G2', 'D3', 'A3', 'C3', 'E3', 'A2'],
        choices: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3'],
        pass: { minAccuracy: 0.8 },
      },
      { kind: 'note-reading', id: 'treble', title: 'Phần 2: nhìn nốt – đánh nốt khoá Sol', clef: 'treble', answer: 'play', sequence: ['B4', 'D5', 'G4', 'C5', 'A4', 'D5'], pass: { minAccuracy: 0.8 } },
      play('play', 'Phần 3: chơi bài hai tay', 'wait', both('RH G4:1 B4:3 D5/h:5 | LH G2:5 B2:3 D3/h:1 | RH C5:4 A4:2 B4/h:3 | LH C3:2 A2:4 G2/h:5'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Nhịp 3/4 ──────────────────────────────────────────────
  {
    lessonId: 'l2-11-three-four',
    weekId: 'l2-w3',
    number: 11,
    title: 'Nhịp 3/4',
    description: 'Mỗi ô nhịp có 3 phách, phách 1 mạnh: "MỘT – hai – ba". Metronome đếm vào 3 phách.',
    learningObjectives: ['Nhịp 3/4 = 3 phách mỗi ô', 'Nhấn phách 1', 'Chơi nốt đen theo nhịp 3/4'],
    estimatedDuration: 15,
    prerequisites: ['l2-10-week2-test'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nhịp 3/4',
        pages: [
          countPage('Đếm ba', 'Số chỉ nhịp 3/4: mỗi ô có 3 phách nốt đen. Đếm "MỘT – hai – ba", phách 1 mạnh hơn.', in34(rh('C4 C4 C4 | C4 C4 C4')), ['1', '2', '3', '1', '2', '3'], 'Bùm – tách – tách, bùm – tách – tách!'),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: nhịp 3/4', questions: [Q.threeFour, Q.strongBeat], pass: { minAccuracy: 0.5 } },
      play('rhythm', 'Gõ nhịp 3/4', 'rhythm', waltz('C4 C4 C4 | C4 C4 C4 | C4 C4 C4 | C4 C4 C4', 66), { instructions: 'Đánh phím nào cũng được — chỉ chấm thời điểm.' }),
      play('perform', 'Biểu diễn nhịp 3/4', 'performance', waltz('C4:1 D4:2 E4:3 | D4:2 E4:3 F4:4 | E4:3 F4:4 G4:5 | G4:5 E4:3 C4:1', 66)),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-12-dotted-half',
    weekId: 'l2-w3',
    number: 12,
    title: 'Nốt trắng chấm dôi — 3 phách',
    description: 'Dấu chấm sau nốt trắng cộng thêm một nửa: 2 + 1 = 3 phách — tròn một ô nhịp 3/4.',
    learningObjectives: ['Nốt trắng chấm dôi = 3 phách', 'Giữ phím đủ 3 phách', 'Kết hợp nốt đen, trắng, trắng chấm dôi'],
    estimatedDuration: 15,
    prerequisites: ['l2-11-three-four'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu chấm dôi',
        pages: [
          countPage('Giữ 3 phách', 'Đánh ở "1", giữ phím qua "2 – 3".', in34(rh('C4/hd | C4/h C4')), ['1 – 2 – 3', '1 – 2', '3'], 'Nốt có chấm nhỏ bên cạnh được thêm một phách nữa!'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ tiết tấu', 'rhythm', waltz('C4/hd | C4 C4 C4 | C4/h C4 | C4/hd', 66)),
      play('perform', 'Biểu diễn', 'performance', waltz('E4/h:3 D4:2 | C4/hd:1 | G4/h:5 F4:4 | E4/hd:3', 66)),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-13-half-rest',
    weekId: 'l2-w3',
    number: 13,
    title: 'Dấu lặng trắng — nghỉ 2 phách',
    description: 'Dấu lặng trắng là một khối nhỏ nằm TRÊN dòng 3, nghỉ 2 phách. (Dấu lặng tròn treo DƯỚI dòng 4.)',
    learningObjectives: ['Dấu lặng trắng = nghỉ 2 phách', 'Vẫn đếm khi nghỉ', 'Không đánh trong lúc nghỉ'],
    estimatedDuration: 15,
    prerequisites: ['l2-12-dotted-half'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu lặng trắng',
        pages: [
          countPage('Nghỉ 2 phách', 'Gặp dấu lặng trắng: nhấc tay, đếm thầm hai phách.', rh('C4 C4 R/h | C4/h R/h'), ['1', '2', '(3 – 4)', '1 – 2', '(3 – 4)'], 'Chiếc mũ nhỏ trên dòng kẻ: suỵt — nghỉ hai phách!'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ và nghỉ đúng phách', 'rhythm', rh('C4 C4 R/h | C4/h R/h | C4 R C4 R | C4/w', 66)),
      play('perform', 'Biểu diễn nhịp 3/4 có dấu lặng', 'performance', waltz('C4:1 R/h | E4:3 R/h | G4:5 E4:3 C4:1 | C4/hd:1', 66)),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-14-waltz-hands',
    weekId: 'l2-w3',
    number: 14,
    title: 'Nhịp 3/4 hai tay',
    description: 'Hai tay thế Sol thay phiên trong nhịp 3/4. Luyện riêng từng tay nếu khó.',
    learningObjectives: ['Giữ nhịp 3/4 khi đổi tay', 'Nốt trắng chấm dôi ở cả hai tay', 'Biểu diễn bài 8 ô nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l2-13-half-rest'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', in34(both(WALTZ_HANDS, 66, 'Valse hai tay')), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', in34(both(WALTZ_HANDS, 66, 'Valse hai tay')), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-15-rhythm-test',
    weekId: 'l2-w3',
    number: 15,
    title: 'Kiểm tra tiết tấu 3/4',
    description: 'Câu hỏi về nhịp 3/4 và trường độ mới, gõ tiết tấu và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Nhịp 3/4, phách mạnh', 'Nốt trắng chấm dôi, dấu lặng trắng', 'Biểu diễn đúng nốt và đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l2-14-waltz-hands'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.threeFour, Q.strongBeat, Q.dottedHalf, Q.halfRest], pass: { minAccuracy: 0.75 } },
      play('rhythm', 'Phần 2: gõ tiết tấu', 'rhythm', waltz('C4 C4 C4 | C4/hd | C4/h C4 | C4 R C4 | C4/h R | C4/hd', 66)),
      play(
        'perform',
        'Phần 3: biểu diễn',
        'performance',
        waltz('G4:1 A4:2 B4:3 | A4/h:2 G4:1 | B4:3 C5:4 D5:5 | B4/hd:3 | C5:4 B4:3 A4:2 | B4/h:3 R | A4:2 B4:3 A4:2 | G4/hd:1', 66),
        { weight: 2 },
      ),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Quãng, quãng tám và biểu diễn ─────────────────────────
  {
    lessonId: 'l2-16-intervals',
    weekId: 'l2-w4',
    number: 16,
    title: 'Bước liền và nhảy quãng',
    description: 'Nốt đi từ dòng sang khe kề bên là bước liền (quãng 2); từ dòng sang dòng (hoặc khe sang khe) là nhảy quãng 3.',
    learningObjectives: ['Nhận ra bước liền và nhảy quãng 3 trên khuông', 'Đọc nhanh theo khoảng cách, không cần đọc từng tên', 'Chơi giai điệu có nhảy quãng'],
    estimatedDuration: 15,
    prerequisites: ['l2-15-rhythm-test'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Quãng',
        pages: [
          staffPage('Bước liền', 'Dòng → khe ngay trên (hoặc ngược lại): hai phím trắng kề nhau.', rh('C4/h D4/h | E4/h F4/h')),
          staffPage('Nhảy quãng 3', 'Dòng → dòng kế tiếp (hoặc khe → khe): bỏ qua một phím trắng.', rh('E4/h G4/h | F4/h A4/h'), 'Nhảy cóc qua một bạn ở giữa!'),
        ],
      },
    ],
    exercises: [
      {
        kind: 'choice-quiz',
        id: 'quiz',
        title: 'Bước hay nhảy?',
        questions: [interval('C4/h D4/h', 0), interval('C4/h E4/h', 1), interval('E4/h G4/h', 1), interval('F4/h G4/h', 0), interval('G4/h B4/h', 1)],
        pass: { minAccuracy: 0.8 },
      },
      play('play', 'Giai điệu nhảy quãng', 'wait', rh('C4:1 E4:3 G4:5 E4:3 | D4:2 F4:4 E4/h:3 | E4:3 G4:5 F4:4 D4:2 | C4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-17-octaves',
    weekId: 'l2-w4',
    number: 17,
    title: 'Quãng 5 và quãng 8',
    description: 'Ngón 1 tới ngón 5 trong một thế tay là quãng 5. Hai nốt cùng tên liền nhau (C4 – C5) cách nhau quãng 8.',
    learningObjectives: ['Tìm quãng 5 từ một nốt', 'Tìm cùng một nốt ở quãng 8 khác', 'Chơi quãng 5, quãng 8 bằng hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l2-16-intervals'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Quãng 5 và quãng 8',
        pages: [
          keyboardPage('Quãng 5', 'C4 → G4: từ ngón 1 tới ngón 5 trong thế tay Đô.', [60, 67]),
          keyboardPage('Quãng 8', 'C3 – C4 – C5: cùng là Đô, mỗi nốt cách nhau 8 phím trắng (tính cả hai đầu).', [48, 60, 72], 'Đô bố, Đô con, Đô cháu — cùng tên, khác cao thấp!'),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: quãng', questions: [Q.octave, Q.fifth], pass: { minAccuracy: 0.5 } },
      { kind: 'key-quiz', id: 'keys', title: 'Tìm quãng 5, quãng 8', keyboard: KEYS, retry: false, rounds: [R.octaveUpC, R.fifthG, R.octaveDownC, R.anyG, R.octaveDownG], pass: { minAccuracy: 0.8 } },
      play('play', 'Quãng 5 hai tay', 'wait', both('RH C4:1 G4:5 C4:1 G4:5 | LH C3:5 G3:1 C3:5 G3:1 | RH E4:3 G4:5 C4/h:1 | LH C3/w:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-18-waltz-piece',
    weekId: 'l2-w4',
    number: 18,
    title: 'Bài nhạc 3/4: Điệu valse nhỏ',
    description: 'Bài "Điệu valse nhỏ" (tự soạn) 8 ô nhịp, tay phải thế Sol. Tập chậm rồi biểu diễn theo metronome.',
    learningObjectives: ['Chơi trọn bài 8 ô nhịp 3/4', 'Nhấn nhẹ phách 1', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l2-17-octaves'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Điệu valse nhỏ',
        pages: [staffPage('Nghe mẫu', 'Nghe trước — chú ý hai nốt Sol dài 3 phách ở ô 4 và ô 8.', waltz(LITTLE_WALTZ, 72, 'Điệu valse nhỏ'))],
      },
    ],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', waltz(LITTLE_WALTZ, 72, 'Điệu valse nhỏ'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', waltz(LITTLE_WALTZ, 72, 'Điệu valse nhỏ'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-19-way-home',
    weekId: 'l2-w4',
    number: 19,
    title: 'Bài nhạc hai tay: Đường về',
    description: 'Bài "Đường về" (tự soạn) 8 ô nhịp: tay phải thế Đô, tay trái thế Sol, thay phiên nhau.',
    learningObjectives: ['Mỗi tay ở một thế khác nhau', 'Đổi tay không ngắt nhịp', 'Biểu diễn liên tục'],
    estimatedDuration: 20,
    prerequisites: ['l2-18-waltz-piece'],
    notes: [NO_DURATION_MIC],
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', both(WAY_HOME, 66, 'Đường về'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', both(WAY_HOME, 66, 'Đường về'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l2-20-final',
    weekId: 'l2-w4',
    number: 20,
    title: 'Kiểm tra cuối cấp 2',
    description: 'Lý thuyết, đọc nốt hai khoá và biểu diễn bài "Valse tốt nghiệp" (tự soạn) hai tay. Cần 80/100 điểm.',
    learningObjectives: ['Ôn toàn bộ kiến thức cấp 2', 'Đọc nốt khoá Sol và khoá Fa', 'Biểu diễn bài 3/4 hai tay'],
    estimatedDuration: 25,
    prerequisites: ['l2-19-way-home'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.gThumb, Q.lhGPinky, Q.threeFour, Q.dottedHalf, Q.halfRest, Q.octave, Q.a4Space], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'treble', title: 'Phần 2: gọi tên nốt khoá Sol', clef: 'treble', answer: 'name', sequence: ['A4', 'C5', 'G4', 'D5', 'B4', 'F4'], choices: ['F4', 'G4', 'A4', 'B4', 'C5', 'D5'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'bass', title: 'Phần 3: gọi tên nốt khoá Fa', clef: 'bass', answer: 'name', sequence: ['G2', 'D3', 'A2', 'F3', 'B2', 'E3'], choices: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3'], pass: { minAccuracy: 0.8 } },
      play('perform', 'Phần 4: biểu diễn "Valse tốt nghiệp"', 'performance', in34(both(GRADUATION_WALTZ, 66, 'Valse tốt nghiệp')), { weight: 3 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL2_WEEKS: Week[] = [
  {
    weekId: 'l2-w1',
    number: 1,
    title: 'Tuần 1 — Thế tay Sol, đủ bảy nốt',
    description: 'La, Si, Đô cao, Rê cao; đổi thế tay Đô ↔ Sol.',
    lessonIds: ['l2-01-g-position', 'l2-02-a-b-staff', 'l2-03-c5-d5', 'l2-04-position-shift', 'l2-05-week1-test'],
    extraPractice: [
      { lessonId: 'notes-a-b-c', tip: 'Dời cả bàn tay, ngón cái đặt ở Sol. Đô5 nằm trong khe thứ ba của khuông.' },
      { lessonId: 'notes-seven', tip: 'Đô Rê Mi Fa Sol La Si — đọc tên nốt thành tiếng khi đánh.' },
      { lessonId: 'notes-lines', tip: 'Năm dòng kẻ khoá Sol từ dưới lên: Mi – Sol – Si – Rê – Fa.' },
      { lessonId: 'notes-spaces', tip: 'Bốn khe khoá Sol từ dưới lên: Fa – La – Đô – Mi.' },
    ],
  },
  {
    weekId: 'l2-w2',
    number: 2,
    title: 'Tuần 2 — Tay trái mở rộng',
    description: 'Khoá Fa tới A3 – B3, tay trái thế Sol (G2 – D3), hai tay thay phiên.',
    lessonIds: ['l2-06-bass-a-b', 'l2-07-lh-g-position', 'l2-08-bass-reading', 'l2-09-hands-g', 'l2-10-week2-test'],
    extraPractice: [
      { lessonId: 'notes-bass', tip: 'Khoá Fa: hai chấm ôm dòng kẻ thứ tư — đó là nốt Fa3.' },
      { lessonId: 'notes-bass-mixed', tip: 'Nhớ mốc: Fa3 trên dòng thứ tư, Đô3 trong khe thứ hai, La3 ở dòng trên cùng.' },
      { lessonId: 'lh-five-finger', tip: 'Tay trái thế Đô — khởi động trước khi xuống thế Sol.' },
    ],
  },
  {
    weekId: 'l2-w3',
    number: 3,
    title: 'Tuần 3 — Nhịp 3/4',
    description: 'Nhịp 3/4, nốt trắng chấm dôi, dấu lặng trắng.',
    lessonIds: ['l2-11-three-four', 'l2-12-dotted-half', 'l2-13-half-rest', 'l2-14-waltz-hands', 'l2-15-rhythm-test'],
    extraPractice: [
      { lessonId: 'song-amazing-grace', tip: 'Bài hát nhịp 3/4 — đếm "MỘT – hai – ba" khi chơi.' },
      { lessonId: 'song-silent-night', tip: 'Thêm một bài 3/4 chậm, nhiều nốt trắng chấm dôi.' },
    ],
  },
  {
    weekId: 'l2-w4',
    number: 4,
    title: 'Tuần 4 — Quãng và biểu diễn',
    description: 'Bước liền, nhảy quãng, quãng 5, quãng 8; hai bài 8 ô nhịp và kiểm tra cuối cấp.',
    lessonIds: ['l2-16-intervals', 'l2-17-octaves', 'l2-18-waltz-piece', 'l2-19-way-home', 'l2-20-final'],
    extraPractice: [
      { lessonId: 'scale-c-major', tip: 'Gam Đô trưởng: luồn ngón cái — chuẩn bị cho cấp 3.' },
      { lessonId: 'song-ode-to-joy', tip: 'Thử sức: bài hát dùng đủ năm ngón thế Đô, có đổi thế ngắn.' },
    ],
  },
];

export const LEVEL2_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
