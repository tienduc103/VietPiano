/**
 * Cấp độ 3 — "Móc đơn và chấm dôi": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Nội dung: nốt móc đơn (đếm "1 và"), dấu lặng móc đơn, nốt đen chấm dôi (1 phách rưỡi) trong 4/4 và 3/4,
 * đảo phách đơn giản (móc đơn – đen – móc đơn, gõ nửa sau phách), gam Đô trưởng luồn ngón hai tay.
 * Mọi giai điệu là bài tập tự soạn cho giáo trình VietPiano. Tay phải thế Đô (1 = C4), tay trái thế Đô (5 = C3).
 * Bài tiết tấu và móc đơn để 60–66 BPM: móc đơn cách nhau ~0,5 giây — micro kịp nhận từng tiếng gõ.
 */
import type { ChoiceQuestion, CurriculumLesson, Piece, Week } from '../types';
import { both, buildLessons, countPage, in34, lh, NO_DURATION_MIC, NO_FINGER_CHECK, play, practice, rh, staffPage, type LessonDef } from './helpers';

const LEVEL = 'level-3';
const KIDS_SLOWER = { kids: { tempoPercent: 85 } };

const Q = {
  eighth: { prompt: 'Một nốt móc đơn dài bao lâu?', options: ['Nửa phách', '1 phách', '2 phách'], answer: 0 },
  twoEighths: { prompt: 'Hai nốt móc đơn bằng nốt gì?', options: ['Một nốt đen', 'Hai nốt đen', 'Một nốt trắng'], answer: 0 },
  countAnd: { prompt: 'Đếm các nốt móc đơn thế nào?', options: ['1 và 2 và 3 và 4 và', '1 2 3 4', '1 – 2 – 3 – 4'], answer: 0 },
  eighthRest: { prompt: 'Dấu lặng móc đơn nghỉ bao lâu?', options: ['Nửa phách', '1 phách', '2 phách'], answer: 0 },
  dottedQuarter: { prompt: 'Nốt đen chấm dôi dài mấy phách?', options: ['1 phách', '1 phách rưỡi', '2 phách'], answer: 1 },
  dotRule: { prompt: 'Dấu chấm dôi làm nốt dài thêm bao nhiêu?', options: ['Thêm một nửa trường độ của nốt đó', 'Thêm đúng 1 phách', 'Gấp đôi'], answer: 0 },
  dottedPair: { prompt: 'Sau nốt đen chấm dôi thường là nốt gì để đủ 2 phách?', options: ['Nốt móc đơn', 'Nốt đen', 'Nốt trắng'], answer: 0 },
  syncopation: { prompt: 'Đảo phách là gì?', options: ['Nốt bắt đầu ở nửa sau phách và ngân qua phách tiếp theo', 'Chơi thật nhanh', 'Nghỉ cả ô nhịp'], answer: 0 },
  syncCount: { prompt: 'Móc đơn – đen – móc đơn dài tổng cộng mấy phách?', options: ['1 phách', '2 phách', '3 phách'], answer: 1 },
  thumbUnder: { prompt: 'Gam Đô trưởng tay phải đi lên: sau ngón 3 ở Mi, ngón nào đánh Fa?', options: ['Ngón 4', 'Ngón 1 (luồn dưới bàn tay)', 'Ngón 5'], answer: 1 },
  scaleNotes: { prompt: 'Gam Đô trưởng có mấy nốt khác tên nhau?', options: ['5 nốt', '7 nốt', '8 nốt'], answer: 1 },
  lhCross: { prompt: 'Gam Đô trưởng tay trái đi lên: sau ngón 1 ở Sol, ngón nào đánh La?', options: ['Ngón 2', 'Ngón 3 (vắt qua ngón cái)', 'Ngón 5'], answer: 1 },
} satisfies Record<string, ChoiceQuestion>;

/** "Bước chân vui" — tự soạn, 4/4, tay phải thế Đô, nhiều móc đơn (8 ô nhịp). */
const HAPPY_STEPS =
  'C4/8:1 D4/8:2 E4:3 C4/8:1 D4/8:2 E4:3 | F4/8:4 E4/8:3 D4:2 G4/h:5 | E4/8:3 F4/8:4 G4:5 E4/8:3 F4/8:4 G4:5 | F4/8:4 E4/8:3 D4/8:2 E4/8:3 C4/h:1 | ' +
  'G4:5 F4/8:4 E4/8:3 F4:4 E4/8:3 D4/8:2 | E4:3 D4/8:2 C4/8:1 D4/h:2 | C4/8:1 D4/8:2 E4/8:3 F4/8:4 G4:5 E4:3 | D4/8:2 E4/8:3 D4:2 C4/h:1';

/** "Ánh trăng nhỏ" — tự soạn, 4/4, nốt đen chấm dôi + móc đơn (8 ô nhịp). */
const MOONLIGHT =
  'E4/qd:3 D4/8:2 C4:1 E4:3 | G4/qd:5 F4/8:4 E4/h:3 | F4/qd:4 E4/8:3 D4:2 F4:4 | E4/w:3 | ' +
  'G4/qd:5 F4/8:4 E4:3 C4:1 | D4/qd:2 E4/8:3 F4/h:4 | E4/qd:3 D4/8:2 C4:1 D4:2 | C4/w:1';

/** "Nhảy dây" — tự soạn, 4/4, đảo phách móc đơn – đen – móc đơn (8 ô nhịp). */
const JUMP_ROPE =
  'C4/8:1 E4:3 C4/8:1 G4/h:5 | F4:4 E4/8:3 D4:2 E4/8:3 C4:1 | D4/8:2 F4:4 D4/8:2 E4/h:3 | G4:5 F4/8:4 E4:3 D4/8:2 C4:1 | ' +
  'E4/8:3 G4:5 E4/8:3 F4/h:4 | E4:3 D4/8:2 E4:3 F4/8:4 G4:5 | E4/8:3 D4:2 E4/8:3 C4/h:1 | D4:2 E4:3 C4/h:1';

/** Hai tay thế Đô thay phiên, có móc đơn và chấm dôi — tự soạn, 4/4 (8 ô nhịp). */
const HANDS_EIGHTH =
  'RH C4/8:1 D4/8:2 E4:3 G4/h:5 | LH G3/8:1 F3/8:2 E3:3 C3/h:5 | RH E4/8:3 F4:4 E4/8:3 D4/h:2 | LH D3/8:4 E3:3 D3/8:4 C3/h:5 | ' +
  'RH E4/qd:3 F4/8:4 G4:5 E4:3 | LH E3/qd:3 D3/8:4 C3:5 E3:3 | RH D4/8:2 E4/8:3 D4:2 C4/h:1 | LH C3/w:5';

/** "Chuyến tàu nhỏ" — tự soạn, 4/4, tay phải thế Đô, móc đơn liên tục (8 ô nhịp). */
const LITTLE_TRAIN =
  'C4/8:1 E4/8:3 G4/8:5 E4/8:3 C4/h:1 | D4/8:2 F4/8:4 E4/8:3 D4/8:2 E4/h:3 | G4:5 E4/8:3 C4/8:1 G4:5 E4/8:3 C4/8:1 | D4/qd:2 E4/8:3 D4/h:2 | ' +
  'E4/8:3 F4/8:4 G4/8:5 F4/8:4 E4:3 C4:1 | D4/8:2 E4/8:3 F4:4 E4/h:3 | G4/8:5 F4/8:4 E4/8:3 D4/8:2 E4/qd:3 D4/8:2 | C4/w:1';

/** "Khúc hát ru" — tự soạn, 3/4, hai tay thế Đô thay phiên, nốt đen chấm dôi (8 ô nhịp). */
const LULLABY =
  'RH E4/qd:3 F4/8:4 E4:3 | D4/h:2 C4:1 | LH E3/qd:3 D3/8:4 C3:5 | G3/hd:1 | ' +
  'RH E4/qd:3 F4/8:4 G4:5 | F4/h:4 E4:3 | LH D3/qd:4 E3/8:3 D3:4 | C3/hd:5';

/** "Tốt nghiệp cấp 3" — tự soạn, 4/4, hai tay thay phiên: móc đơn, chấm dôi, đảo phách (8 ô nhịp). */
const GRADUATION_3 =
  'RH C4/8:1 D4/8:2 E4:3 G4/qd:5 E4/8:3 | F4/8:4 E4:3 D4/8:2 C4/h:1 | LH C3/8:5 D3/8:4 E3:3 G3/qd:1 E3/8:3 | F3/8:2 E3:3 D3/8:4 C3/h:5 | ' +
  'RH E4/qd:3 F4/8:4 G4:5 E4:3 | D4/8:2 E4/8:3 D4:2 C4/h:1 | LH E3/qd:3 D3/8:4 C3:5 E3:3 | C3/w:5';

/** Gam Đô trưởng tay phải (luồn ngón 1 ở Fa khi đi lên, vắt ngón 3 qua ở Mi khi đi xuống). */
const SCALE_RH = 'C4:1 D4:2 E4:3 F4:1 | G4:2 A4:3 B4:4 C5:5 | B4:4 A4:3 G4:2 F4:1 | E4:3 D4:2 C4/h:1';
/** Gam Đô trưởng tay trái (vắt ngón 3 qua ở La khi đi lên, luồn ngón 1 ở Sol khi đi xuống). */
const SCALE_LH = 'C3:5 D3:4 E3:3 F3:2 | G3:1 A3:3 B3:2 C4:1 | B3:2 A3:3 G3:1 F3:2 | E3:3 D3:4 C3/h:5';

const scaleKeysRh = { type: 'keyboard' as const, from: 59, to: 74, highlight: [60, 62, 64, 65, 67, 69, 71, 72], fingers: { 60: 1, 62: 2, 64: 3, 65: 1, 67: 2, 69: 3, 71: 4, 72: 5 } };
const scaleKeysLh = { type: 'keyboard' as const, from: 47, to: 62, highlight: [48, 50, 52, 53, 55, 57, 59, 60], fingers: { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1, 57: 3, 59: 2, 60: 1 } };
const waltz = (notation: string, bpm = 66, title?: string): Piece => in34(rh(notation, bpm, title));

const defs: LessonDef[] = [
  // ── Tuần 1 — Nốt móc đơn ────────────────────────────────────────────
  {
    lessonId: 'l3-01-eighths',
    weekId: 'l3-w1',
    number: 1,
    title: 'Nốt móc đơn',
    description: 'Nốt móc đơn dài nửa phách: hai nốt móc đơn bằng một nốt đen. Đếm "1 và 2 và".',
    learningObjectives: ['Nhận ra nốt móc đơn (có đuôi cờ hoặc nối gạch ngang)', 'Đếm "1 và 2 và"', 'Gõ móc đơn đều tay theo metronome'],
    estimatedDuration: 15,
    prerequisites: ['l2-20-final'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nốt móc đơn',
        pages: [
          countPage(
            'Nửa phách',
            'Nốt móc đơn có một đuôi cờ; hai nốt đứng cạnh nhau thì nối bằng một gạch ngang. Mỗi nốt dài nửa phách — đếm chữ "và" vào nửa sau phách.',
            rh('C4 C4 C4/8 C4/8 C4 | C4/8 C4/8 C4/8 C4/8 C4/h'),
            ['1', '2', '3', 'và', '4', '1', 'và', '2', 'và', '3 – 4'],
            'Hai bạn móc đơn nắm tay nhau, chạy nhanh gấp đôi bạn nốt đen!',
          ),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: nốt móc đơn', questions: [Q.eighth, Q.twoEighths, Q.countAnd], pass: { minAccuracy: 0.66 } },
      play('rhythm', 'Gõ nốt đen và móc đơn', 'rhythm', rh('C4 C4 C4/8 C4/8 C4 | C4/8 C4/8 C4 C4/8 C4/8 C4 | C4 C4/8 C4/8 C4 C4 | C4/8 C4/8 C4/8 C4/8 C4/h'), {
        instructions: 'Đánh phím nào cũng được — chỉ chấm thời điểm. Đếm to "1 và 2 và".',
      }),
      play('perform', 'Biểu diễn: móc đơn trong giai điệu', 'performance', rh('C4:1 D4:2 E4/8:3 D4/8:2 C4:1 | E4:3 F4:4 G4/h:5 | F4/8:4 E4/8:3 D4/8:2 E4/8:3 C4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-02-eighth-pairs',
    weekId: 'l3-w1',
    number: 2,
    title: 'Móc đơn đi từng cặp',
    description: 'Hai nốt móc đơn khác tên đi liền nhau: ngón tay chuyển nhẹ, đều như bước chân.',
    learningObjectives: ['Đọc cặp móc đơn đi lên / đi xuống', 'Chơi móc đơn đều tay ở thế Đô', 'Gõ xen kẽ móc đơn và nốt đen'],
    estimatedDuration: 15,
    prerequisites: ['l3-01-eighths'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Cặp móc đơn',
        pages: [staffPage('Nghe mẫu', 'Bốn móc đơn đi lên rồi một nốt trắng; sau đó đi xuống.', rh('C4/8 D4/8 E4/8 F4/8 G4/h | G4/8 F4/8 E4/8 D4/8 C4/h'), 'Chạy lên cầu thang thật nhanh rồi đứng nghỉ!')],
      },
    ],
    exercises: [
      practice(play('warmup', 'Khởi động: móc đơn đi lên', 'wait', rh('C4/8:1 D4/8:2 E4:3 D4/8:2 E4/8:3 F4:4 | G4/w:5'))),
      play('play', 'Giai điệu móc đơn', 'wait', rh('E4/8:3 F4/8:4 G4:5 F4/8:4 E4/8:3 D4:2 | E4/8:3 F4/8:4 G4:5 E4/h:3 | C4/8:1 D4/8:2 E4/8:3 F4/8:4 G4:5 E4:3 | D4/8:2 C4/8:1 D4:2 C4/h:1')),
      play('rhythm', 'Gõ móc đơn – nốt đen', 'rhythm', rh('C4/8 C4/8 C4 C4/8 C4/8 C4 | C4 C4/8 C4/8 C4/h | C4/8 C4/8 C4/8 C4/8 C4 C4 | C4/8 C4/8 C4 C4/h')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-03-eighth-rest',
    weekId: 'l3-w1',
    number: 3,
    title: 'Dấu lặng móc đơn',
    description: 'Dấu lặng móc đơn nghỉ nửa phách. Gặp nó: nhấc tay thật nhanh rồi đánh tiếp ở nửa phách sau.',
    learningObjectives: ['Nhận ra dấu lặng móc đơn', 'Nghỉ đúng nửa phách', 'Gõ nốt ở nửa sau phách ("và")'],
    estimatedDuration: 15,
    prerequisites: ['l3-02-eighth-pairs'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Lặng móc đơn',
        pages: [
          countPage(
            'Nghỉ nửa phách',
            'Chữ trong ngoặc là lúc nghỉ — đếm thầm, không đánh.',
            rh('C4/8 R/8 C4/8 R/8 C4/h | R/8 C4/8 R/8 C4/8 C4/h'),
            ['1', '(và)', '2', '(và)', '3 – 4', '(1)', 'và', '(2)', 'và', '3 – 4'],
            'Chạm phím rồi nhấc tay ngay — như chạm vào nồi nóng!',
          ),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: lặng móc đơn', questions: [Q.eighthRest, Q.eighth], pass: { minAccuracy: 0.5 } },
      play('rhythm', 'Gõ và nghỉ nửa phách', 'rhythm', rh('C4 C4/8 R/8 C4 C4/8 R/8 | C4/8 R/8 C4/8 R/8 C4/h | R/8 C4/8 R/8 C4/8 C4 C4 | C4/8 R/8 C4 C4/h')),
      play('perform', 'Biểu diễn: có lặng móc đơn', 'performance', rh('C4:1 E4/8:3 R/8 D4:2 F4/8:4 R/8 | E4/8:3 R/8 G4/8:5 R/8 E4/h:3 | D4:2 F4/8:4 E4/8:3 D4:2 R | C4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-04-happy-steps',
    weekId: 'l3-w1',
    number: 4,
    title: 'Bài nhạc: Bước chân vui',
    description: 'Bài "Bước chân vui" (tự soạn) 8 ô nhịp, nhiều móc đơn. Tập chậm rồi biểu diễn theo metronome.',
    learningObjectives: ['Chơi trọn bài 8 ô nhịp có móc đơn', 'Giữ móc đơn đều khi đổi hướng giai điệu', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l3-03-eighth-rest'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Bước chân vui', pages: [staffPage('Nghe mẫu', 'Nghe trước — chú ý hai ô nhịp 1 và 3 lặp lại một hình móc đơn.', rh(HAPPY_STEPS, 60, 'Bước chân vui'))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', rh(HAPPY_STEPS, 60, 'Bước chân vui'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', rh(HAPPY_STEPS, 60, 'Bước chân vui'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-05-week1-test',
    weekId: 'l3-w1',
    number: 5,
    title: 'Kiểm tra tuần 1',
    description: 'Câu hỏi về móc đơn, gõ tiết tấu và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Nốt móc đơn, dấu lặng móc đơn', 'Gõ đúng nửa phách', 'Biểu diễn giai điệu có móc đơn'],
    estimatedDuration: 15,
    prerequisites: ['l3-04-happy-steps'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.eighth, Q.twoEighths, Q.eighthRest, Q.countAnd], pass: { minAccuracy: 0.75 } },
      play('rhythm', 'Phần 2: gõ tiết tấu', 'rhythm', rh('C4/8 C4/8 C4 C4 C4/8 C4/8 | C4/8 R/8 C4/8 R/8 C4/h | C4 C4/8 C4/8 C4/8 C4/8 C4 | C4/8 C4/8 C4 C4/h')),
      play('perform', 'Phần 3: biểu diễn', 'performance', rh('E4:3 D4/8:2 C4/8:1 D4:2 E4:3 | F4/8:4 E4/8:3 D4/8:2 C4/8:1 D4/h:2 | E4/8:3 F4/8:4 G4:5 F4/8:4 E4/8:3 D4:2 | E4/8:3 D4/8:2 E4:3 C4/h:1'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Nốt đen chấm dôi ──────────────────────────────────────
  {
    lessonId: 'l3-06-dotted-quarter',
    weekId: 'l3-w2',
    number: 6,
    title: 'Nốt đen chấm dôi',
    description: 'Dấu chấm dôi làm nốt dài thêm một nửa: nốt đen chấm dôi = 1 phách rưỡi, thường đi cùng một móc đơn cho đủ 2 phách.',
    learningObjectives: ['Hiểu quy tắc dấu chấm dôi', 'Đếm "1 – (2) và"', 'Gõ hình đen chấm dôi – móc đơn'],
    estimatedDuration: 15,
    prerequisites: ['l3-05-week1-test'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đen chấm dôi',
        pages: [
          countPage(
            '1 phách rưỡi',
            'Đánh ở phách 1, giữ qua phách 2, rồi đánh móc đơn ở chữ "và" của phách 2.',
            rh('C4/qd C4/8 C4/h | C4/qd C4/8 C4 C4'),
            ['1 – (2)', 'và', '3 – 4', '1 – (2)', 'và', '3', '4'],
            'Bước dài, bước ngắn — như đi khập khiễng vui vẻ!',
          ),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: chấm dôi', questions: [Q.dottedQuarter, Q.dotRule, Q.dottedPair], pass: { minAccuracy: 0.66 } },
      play('rhythm', 'Gõ đen chấm dôi – móc đơn', 'rhythm', rh('C4/qd C4/8 C4 C4 | C4/qd C4/8 C4/h | C4 C4/qd C4/8 C4 | C4/qd C4/8 C4/h')),
      play('perform', 'Biểu diễn: chấm dôi', 'performance', rh('C4/qd:1 D4/8:2 E4:3 C4:1 | E4/qd:3 F4/8:4 G4/h:5 | G4/qd:5 F4/8:4 E4:3 D4:2 | C4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-07-dotted-three-four',
    weekId: 'l3-w2',
    number: 7,
    title: 'Chấm dôi trong nhịp 3/4',
    description: 'Hình đen chấm dôi – móc đơn chiếm 2 phách đầu của ô nhịp 3/4, còn lại một nốt đen.',
    learningObjectives: ['Đếm "1 – (2) và 3"', 'Giữ phách mạnh ở phách 1', 'Biểu diễn valse có chấm dôi'],
    estimatedDuration: 15,
    prerequisites: ['l3-06-dotted-quarter'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Chấm dôi nhịp 3/4',
        pages: [countPage('Một ô nhịp 3/4', 'Đen chấm dôi (1 phách rưỡi) + móc đơn (nửa phách) + nốt đen (1 phách) = 3 phách.', in34(rh('C4/qd C4/8 C4 | C4/hd')), ['1 – (2)', 'và', '3', '1 – 2 – 3'])],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ tiết tấu 3/4 có chấm dôi', 'rhythm', waltz('C4/qd C4/8 C4 | C4 C4 C4 | C4/qd C4/8 C4 | C4/hd | C4 C4/qd C4/8 | C4/h C4 | C4/qd C4/8 C4 | C4/hd')),
      play('perform', 'Biểu diễn valse chấm dôi', 'performance', waltz('E4/qd:3 F4/8:4 G4:5 | E4/h:3 C4:1 | D4/qd:2 E4/8:3 F4:4 | D4/hd:2 | G4/qd:5 F4/8:4 E4:3 | F4/h:4 D4:2 | E4/qd:3 D4/8:2 C4:1 | C4/hd:1'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-08-moonlight',
    weekId: 'l3-w2',
    number: 8,
    title: 'Bài nhạc: Ánh trăng nhỏ',
    description: 'Bài "Ánh trăng nhỏ" (tự soạn) 8 ô nhịp, mỗi câu mở đầu bằng nốt đen chấm dôi. Hát nhẩm "dàiii – ngắn" khi chơi.',
    learningObjectives: ['Chơi trọn bài 8 ô nhịp có chấm dôi', 'Giữ đủ 1 phách rưỡi trước nốt móc đơn', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l3-07-dotted-three-four'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Ánh trăng nhỏ', pages: [staffPage('Nghe mẫu', 'Nghe trước — mỗi ô nhịp lẻ bắt đầu bằng "dàiii – ngắn".', rh(MOONLIGHT, 60, 'Ánh trăng nhỏ'))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', rh(MOONLIGHT, 60, 'Ánh trăng nhỏ'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', rh(MOONLIGHT, 60, 'Ánh trăng nhỏ'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-09-lh-eighths',
    weekId: 'l3-w2',
    number: 9,
    title: 'Tay trái: móc đơn và chấm dôi',
    description: 'Tay trái thế Đô (ngón 5 ở C3) chơi móc đơn và đen chấm dôi trên khoá Fa.',
    learningObjectives: ['Đọc móc đơn trên khoá Fa', 'Tay trái chơi móc đơn đều tay', 'Biểu diễn bài tay trái có chấm dôi'],
    estimatedDuration: 15,
    prerequisites: ['l3-08-moonlight'],
    notes: [NO_DURATION_MIC, NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Tay trái',
        pages: [staffPage('Nghe mẫu', 'Tay trái đi lên – xuống bằng móc đơn, rồi hình "dàiii – ngắn".', lh('C3/8 D3/8 E3 F3/8 E3/8 D3 | C3/qd D3/8 E3/h'), 'Tay trái cũng biết chạy nhanh đấy!')],
      },
    ],
    exercises: [
      play('play', 'Tay trái: móc đơn', 'wait', lh('C3/8:5 D3/8:4 E3:3 F3/8:2 E3/8:3 D3:4 | C3/qd:5 D3/8:4 E3/h:3 | G3/qd:1 F3/8:2 E3:3 D3:4 | C3/w:5')),
      play('perform', 'Biểu diễn tay trái', 'performance', lh('E3/qd:3 D3/8:4 C3:5 E3:3 | G3/8:1 F3/8:2 E3/8:3 D3/8:4 E3/h:3 | F3/qd:2 E3/8:3 D3:4 F3:2 | E3/8:3 D3/8:4 E3:3 C3/h:5'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-10-week2-test',
    weekId: 'l3-w2',
    number: 10,
    title: 'Kiểm tra tuần 2',
    description: 'Câu hỏi về chấm dôi, gõ tiết tấu và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Nốt đen chấm dôi, quy tắc chấm dôi', 'Gõ đen chấm dôi – móc đơn', 'Biểu diễn đúng nốt và đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l3-09-lh-eighths'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.dottedQuarter, Q.dotRule, Q.dottedPair, Q.eighth], pass: { minAccuracy: 0.75 } },
      play('rhythm', 'Phần 2: gõ tiết tấu', 'rhythm', rh('C4/qd C4/8 C4 C4 | C4/8 C4/8 C4 C4/qd C4/8 | C4/h C4/qd C4/8 | C4 C4/8 C4/8 C4/h')),
      play('perform', 'Phần 3: biểu diễn', 'performance', rh('C4/qd:1 E4/8:3 G4:5 E4:3 | F4/qd:4 E4/8:3 D4/h:2 | E4/8:3 F4/8:4 G4:5 F4/qd:4 E4/8:3 | D4/qd:2 E4/8:3 C4/h:1'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Đảo phách đơn giản ─────────────────────────────────────
  {
    lessonId: 'l3-11-syncopation',
    weekId: 'l3-w3',
    number: 11,
    title: 'Đảo phách: móc đơn – đen – móc đơn',
    description: 'Nốt đen bắt đầu ở chữ "và" và ngân qua phách 2 — nghe như bị "trật nhịp" một cách vui tai. Đó là đảo phách.',
    learningObjectives: ['Nhận ra hình móc đơn – đen – móc đơn', 'Đếm "1 và (2) và"', 'Gõ đảo phách đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l3-10-week2-test'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đảo phách',
        pages: [
          countPage(
            'Nốt đen ở giữa phách',
            'Móc đơn ở phách 1, nốt đen ở chữ "và" (ngân qua phách 2), móc đơn ở chữ "và" của phách 2.',
            rh('C4/8 C4 C4/8 C4/h | C4/8 C4 C4/8 C4 C4'),
            ['1', 'và – (2)', 'và', '3 – 4', '1', 'và – (2)', 'và', '3', '4'],
            'Ngắn – dài – ngắn: như nhảy lò cò!',
          ),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: đảo phách', questions: [Q.syncopation, Q.syncCount], pass: { minAccuracy: 0.5 } },
      play('rhythm', 'Gõ đảo phách', 'rhythm', rh('C4 C4 C4/8 C4 C4/8 | C4/8 C4 C4/8 C4/h | C4 C4/8 C4 C4/8 C4 | C4/8 C4 C4/8 C4/h')),
      play('perform', 'Biểu diễn: đảo phách', 'performance', rh('C4:1 D4:2 E4/8:3 F4:4 E4/8:3 | D4/8:2 E4:3 D4/8:2 C4/h:1 | E4:3 F4/8:4 G4:5 F4/8:4 E4:3 | D4/8:2 E4:3 D4/8:2 C4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-12-offbeat',
    weekId: 'l3-w3',
    number: 12,
    title: 'Gõ nửa sau phách',
    description: 'Lặng móc đơn ở đầu phách, nốt ở chữ "và". Giữ đếm thật đều trong đầu — tay chỉ đánh vào "và".',
    learningObjectives: ['Đánh nốt ở nửa sau phách', 'Không vội khi đầu phách là dấu lặng', 'Biểu diễn giai điệu nghịch phách'],
    estimatedDuration: 15,
    prerequisites: ['l3-11-syncopation'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nửa sau phách',
        pages: [
          countPage(
            'Chỉ đánh vào "và"',
            'Đếm thầm số phách, đánh vào chữ "và".',
            rh('R/8 C4/8 R/8 C4/8 C4/h | R/8 C4/8 R/8 C4/8 R/8 C4/8 C4'),
            ['(1)', 'và', '(2)', 'và', '3 – 4', '(1)', 'và', '(2)', 'và', '(3)', 'và', '4'],
          ),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ nửa sau phách', 'rhythm', rh('C4 R/8 C4/8 C4 R/8 C4/8 | R/8 C4/8 R/8 C4/8 C4/h | C4/8 C4/8 R/8 C4/8 C4 C4 | R/8 C4/8 C4 C4/h')),
      play('perform', 'Biểu diễn: nghịch phách', 'performance', rh('C4:1 R/8 E4/8:3 D4:2 R/8 F4/8:4 | E4:3 R/8 G4/8:5 E4/h:3 | R/8 D4/8:2 R/8 E4/8:3 F4:4 D4:2 | R/8 E4/8:3 D4:2 C4/h:1'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-13-jump-rope',
    weekId: 'l3-w3',
    number: 13,
    title: 'Bài nhạc: Nhảy dây',
    description: 'Bài "Nhảy dây" (tự soạn) 8 ô nhịp, đảo phách ở hầu hết các ô. Tập chậm, đếm to, rồi biểu diễn.',
    learningObjectives: ['Chơi trọn bài có đảo phách', 'Giữ nốt đen giữa phách đủ dài', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l3-12-offbeat'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Nhảy dây', pages: [staffPage('Nghe mẫu', 'Nghe trước — "ngắn – dài – ngắn" như sợi dây quay.', rh(JUMP_ROPE, 60, 'Nhảy dây'))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', rh(JUMP_ROPE, 60, 'Nhảy dây'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', rh(JUMP_ROPE, 60, 'Nhảy dây'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-14-hands-eighths',
    weekId: 'l3-w3',
    number: 14,
    title: 'Hai tay thay phiên: móc đơn',
    description: 'Hai tay thế Đô thay phiên, mỗi tay có móc đơn và chấm dôi. Luyện riêng từng tay nếu khó.',
    learningObjectives: ['Đổi tay mà không ngắt nhịp', 'Móc đơn đều ở cả hai tay', 'Biểu diễn bài 8 ô nhịp hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l3-13-jump-rope'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', both(HANDS_EIGHTH, 60, 'Hai tay móc đơn'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', both(HANDS_EIGHTH, 60, 'Hai tay móc đơn'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-15-rhythm-test',
    weekId: 'l3-w3',
    number: 15,
    title: 'Kiểm tra tiết tấu',
    description: 'Câu hỏi về móc đơn, chấm dôi, đảo phách; gõ tiết tấu và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Đảo phách, nửa sau phách', 'Đen chấm dôi, lặng móc đơn', 'Biểu diễn đúng nốt và đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l3-14-hands-eighths'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.syncopation, Q.syncCount, Q.eighthRest, Q.dottedQuarter], pass: { minAccuracy: 0.75 } },
      play('rhythm', 'Phần 2: gõ tiết tấu', 'rhythm', rh('C4/8 C4 C4/8 C4 C4 | R/8 C4/8 R/8 C4/8 C4/h | C4/qd C4/8 C4/8 C4 C4/8 | C4 C4/8 C4/8 C4/h')),
      play('perform', 'Phần 3: biểu diễn', 'performance', rh('E4/8:3 G4:5 E4/8:3 D4:2 C4:1 | D4/qd:2 E4/8:3 F4/h:4 | R/8 E4/8:3 R/8 D4/8:2 E4:3 G4:5 | F4/8:4 E4:3 D4/8:2 C4/h:1'), {
        weight: 2,
      }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Gam Đô trưởng và biểu diễn ─────────────────────────────
  {
    lessonId: 'l3-16-scale-rh',
    weekId: 'l3-w4',
    number: 16,
    title: 'Luồn ngón cái: gam Đô trưởng tay phải',
    description: 'Tám nốt C4 → C5 bằng năm ngón: sau Mi (ngón 3), ngón cái luồn dưới bàn tay để đánh Fa. Đi xuống thì ngón 3 vắt qua ở Mi.',
    learningObjectives: ['Luồn ngón cái dưới bàn tay', 'Chơi gam Đô trưởng tay phải đi lên – đi xuống', 'Giữ đều khi đổi vị trí tay'],
    estimatedDuration: 15,
    prerequisites: ['l3-15-rhythm-test'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Luồn ngón cái',
        pages: [
          { title: 'Ngón tay cho gam Đô trưởng', body: 'Đi lên: 1 – 2 – 3, luồn ngón 1 ở Fa, rồi 2 – 3 – 4 – 5. Đi xuống: 5 – 4 – 3 – 2 – 1, vắt ngón 3 qua ở Mi, rồi 2 – 1.', illustration: scaleKeysRh, kids: 'Ngón cái chui qua đường hầm dưới bàn tay!' },
          staffPage('Nghe mẫu', 'Gam Đô trưởng đi lên rồi đi xuống.', rh(SCALE_RH, 66, 'Gam Đô trưởng')),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: luồn ngón', questions: [Q.thumbUnder, Q.scaleNotes], pass: { minAccuracy: 0.5 } },
      practice(play('warmup', 'Luyện luồn ngón: Đô Rê Mi Fa', 'wait', rh('C4:1 D4:2 E4:3 F4:1 | E4:3 D4:2 C4/h:1'))),
      play('play', 'Gam Đô trưởng (Wait Mode)', 'wait', rh(SCALE_RH, 66, 'Gam Đô trưởng')),
      play('perform', 'Biểu diễn gam Đô trưởng', 'performance', rh(SCALE_RH, 66, 'Gam Đô trưởng'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-17-scale-lh',
    weekId: 'l3-w4',
    number: 17,
    title: 'Gam Đô trưởng tay trái',
    description: 'Tay trái C3 → C4: 5 – 4 – 3 – 2 – 1, vắt ngón 3 qua ngón cái ở La, rồi 2 – 1. Đi xuống thì luồn ngón cái ở Sol.',
    learningObjectives: ['Vắt ngón 3 qua ngón cái (tay trái)', 'Chơi gam Đô trưởng tay trái', 'Đọc C3 – C4 trên khoá Fa'],
    estimatedDuration: 15,
    prerequisites: ['l3-16-scale-rh'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Gam tay trái',
        pages: [
          { title: 'Ngón tay cho gam tay trái', body: 'Đi lên: 5 – 4 – 3 – 2 – 1, vắt ngón 3 qua ở La, rồi 2 – 1. Đi xuống: 1 – 2 – 3, luồn ngón 1 ở Sol, rồi 2 – 3 – 4 – 5.', illustration: scaleKeysLh },
          staffPage('Nghe mẫu', 'Gam Đô trưởng tay trái đi lên rồi đi xuống.', lh(SCALE_LH, 66, 'Gam Đô trưởng tay trái')),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: gam tay trái', questions: [Q.lhCross], pass: { minAccuracy: 1 } },
      play('play', 'Gam tay trái (Wait Mode)', 'wait', lh(SCALE_LH, 66, 'Gam Đô trưởng tay trái')),
      play('perform', 'Biểu diễn gam tay trái', 'performance', lh(SCALE_LH, 66, 'Gam Đô trưởng tay trái'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-18-little-train',
    weekId: 'l3-w4',
    number: 18,
    title: 'Bài nhạc: Chuyến tàu nhỏ',
    description: 'Bài "Chuyến tàu nhỏ" (tự soạn) 8 ô nhịp, móc đơn liên tục như tiếng bánh xe. Tập chậm rồi biểu diễn.',
    learningObjectives: ['Chơi chuỗi móc đơn dài đều tay', 'Kết hợp móc đơn và chấm dôi', 'Biểu diễn trọn bài'],
    estimatedDuration: 20,
    prerequisites: ['l3-17-scale-lh'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Chuyến tàu nhỏ', pages: [staffPage('Nghe mẫu', 'Nghe trước — "xình xịch" đều như bánh xe lửa.', rh(LITTLE_TRAIN, 66, 'Chuyến tàu nhỏ'))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', rh(LITTLE_TRAIN, 66, 'Chuyến tàu nhỏ'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', rh(LITTLE_TRAIN, 66, 'Chuyến tàu nhỏ'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-19-lullaby',
    weekId: 'l3-w4',
    number: 19,
    title: 'Bài nhạc hai tay: Khúc hát ru',
    description: 'Bài "Khúc hát ru" (tự soạn) 3/4, hai tay thế Đô thay phiên, mỗi câu mở đầu bằng nốt đen chấm dôi.',
    learningObjectives: ['Chấm dôi trong nhịp 3/4 ở cả hai tay', 'Đổi tay nhẹ nhàng, liền mạch', 'Biểu diễn bài hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l3-18-little-train'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', in34(both(LULLABY, 60, 'Khúc hát ru')), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', in34(both(LULLABY, 60, 'Khúc hát ru')), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l3-20-final',
    weekId: 'l3-w4',
    number: 20,
    title: 'Kiểm tra cuối cấp 3',
    description: 'Lý thuyết, gõ tiết tấu tổng hợp và biểu diễn bài "Tốt nghiệp cấp 3" (tự soạn) hai tay. Cần 80/100 điểm.',
    learningObjectives: ['Ôn toàn bộ kiến thức cấp 3', 'Gõ đúng móc đơn, chấm dôi, đảo phách', 'Biểu diễn bài hai tay'],
    estimatedDuration: 25,
    prerequisites: ['l3-19-lullaby'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.eighth, Q.eighthRest, Q.dottedQuarter, Q.syncopation, Q.thumbUnder, Q.twoEighths], pass: { minAccuracy: 0.8 } },
      play('rhythm', 'Phần 2: gõ tiết tấu tổng hợp', 'rhythm', rh('C4/8 C4/8 C4 C4/qd C4/8 | C4/8 C4 C4/8 C4/h | R/8 C4/8 R/8 C4/8 C4 C4 | C4/qd C4/8 C4/h')),
      play('perform', 'Phần 3: biểu diễn "Tốt nghiệp cấp 3"', 'performance', both(GRADUATION_3, 60, 'Tốt nghiệp cấp 3'), { weight: 3 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL3_WEEKS: Week[] = [
  {
    weekId: 'l3-w1',
    number: 1,
    title: 'Tuần 1 — Nốt móc đơn',
    description: 'Móc đơn, đếm "1 và", dấu lặng móc đơn; bài "Bước chân vui".',
    lessonIds: ['l3-01-eighths', 'l3-02-eighth-pairs', 'l3-03-eighth-rest', 'l3-04-happy-steps', 'l3-05-week1-test'],
    extraPractice: [
      { lessonId: 'song-frere-jacques', tip: 'Có nốt móc đơn — đếm "1 và 2 và" khi chơi.' },
      { lessonId: 'song-clementine', tip: 'Thêm một bài có móc đơn, nhịp vừa phải.' },
    ],
  },
  {
    weekId: 'l3-w2',
    number: 2,
    title: 'Tuần 2 — Nốt đen chấm dôi',
    description: 'Đen chấm dôi – móc đơn trong 4/4 và 3/4, tay trái móc đơn; bài "Ánh trăng nhỏ".',
    lessonIds: ['l3-06-dotted-quarter', 'l3-07-dotted-three-four', 'l3-08-moonlight', 'l3-09-lh-eighths', 'l3-10-week2-test'],
    extraPractice: [
      { lessonId: 'song-jingle-bells', tip: 'Tìm hình "đen chấm dôi – móc đơn" ở câu thứ ba.' },
      { lessonId: 'song-london-bridge', tip: 'Mở đầu bằng nốt đen chấm dôi — "dàiii – ngắn".' },
    ],
  },
  {
    weekId: 'l3-w3',
    number: 3,
    title: 'Tuần 3 — Đảo phách đơn giản',
    description: 'Móc đơn – đen – móc đơn, đánh vào nửa sau phách; bài "Nhảy dây", hai tay có móc đơn.',
    lessonIds: ['l3-11-syncopation', 'l3-12-offbeat', 'l3-13-jump-rope', 'l3-14-hands-eighths', 'l3-15-rhythm-test'],
    extraPractice: [
      { lessonId: 'song-oh-susanna', tip: 'Nhiều móc đơn liên tiếp — giữ nhịp thật đều.' },
      { lessonId: 'song-row-boat', tip: 'Có móc đơn và chấm dôi — đếm to trước khi chơi.' },
    ],
  },
  {
    weekId: 'l3-w4',
    number: 4,
    title: 'Tuần 4 — Gam Đô trưởng và biểu diễn',
    description: 'Luồn ngón cái, gam Đô trưởng hai tay; bài "Chuyến tàu nhỏ", "Khúc hát ru" và kiểm tra cuối cấp.',
    lessonIds: ['l3-16-scale-rh', 'l3-17-scale-lh', 'l3-18-little-train', 'l3-19-lullaby', 'l3-20-final'],
    extraPractice: [
      { lessonId: 'scale-c-major', tip: 'Gam Đô trưởng tay phải — tăng dần nhịp độ khi đã chắc ngón.' },
      { lessonId: 'scale-c-major-left', tip: 'Gam Đô trưởng tay trái — để ý chỗ vắt ngón 3.' },
    ],
  },
];

export const LEVEL3_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
