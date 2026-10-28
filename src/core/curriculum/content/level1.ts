/**
 * Cấp độ 1 — "Làm quen Piano": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Mọi giai điệu là bài tập tự soạn cho giáo trình VietPiano (không chép từ giáo trình thương mại).
 * Quy ước: C4 = Đô giữa = MIDI 60. Thế tay cố định: tay phải ngón 1 ở C4; tay trái ngón 5 ở C3.
 */
import type { ChoiceQuestion, CurriculumLesson, KeyQuizRound, Week } from '../types';
import { both, buildLessons, countPage, keyboardPage, lh, NO_DURATION_MIC, NO_FINGER_CHECK, play, practice, rh, staffPage, KEYS, type LessonDef } from './helpers';

const LEVEL = 'level-1';

const R = {
  group2: { prompt: 'Bấm một phím trong nhóm 2 phím đen', target: { type: 'black-group', size: 2 } },
  group3: { prompt: 'Bấm một phím trong nhóm 3 phím đen', target: { type: 'black-group', size: 3 } },
  black: { prompt: 'Bấm một phím đen bất kỳ', target: { type: 'black' } },
  white: { prompt: 'Bấm một phím trắng bất kỳ', target: { type: 'white' } },
  c4: { prompt: 'Bấm Đô giữa (C4)', target: { type: 'midi', midi: 60 } },
  c3: { prompt: 'Bấm nốt Đô thấp hơn Đô giữa (C3)', target: { type: 'midi', midi: 48 } },
  c5: { prompt: 'Bấm nốt Đô cao hơn Đô giữa (C5)', target: { type: 'midi', midi: 72 } },
  anyC: { prompt: 'Bấm một nốt Đô bất kỳ', target: { type: 'pitch-class', pc: 0 } },
  otherC: { prompt: 'Bấm một nốt Đô KHÁC Đô giữa', target: { type: 'pitch-class', pc: 0, exclude: [60] } },
} satisfies Record<string, KeyQuizRound>;

const FINGER_OPTIONS = ['1', '2', '3', '4', '5'];
const Q = {
  thumb: { prompt: 'Ngón cái là ngón số mấy?', options: FINGER_OPTIONS, answer: 0, illustration: { type: 'hand', hand: 'right' } },
  index: { prompt: 'Ngón trỏ là ngón số mấy?', options: FINGER_OPTIONS, answer: 1 },
  middle: { prompt: 'Ngón giữa là ngón số mấy?', options: FINGER_OPTIONS, answer: 2 },
  pinky: { prompt: 'Ngón út là ngón số mấy?', options: FINGER_OPTIONS, answer: 4 },
  cPosition: {
    prompt: 'Nốt Đô nằm ở đâu?',
    options: ['Bên trái nhóm 2 phím đen', 'Bên phải nhóm 2 phím đen', 'Giữa nhóm 3 phím đen'],
    answer: 0,
  },
  quarter: { prompt: 'Nốt đen dài mấy phách?', options: ['1 phách', '2 phách', '4 phách'], answer: 0 },
  half: { prompt: 'Nốt trắng dài mấy phách?', options: ['1 phách', '2 phách', '4 phách'], answer: 1 },
  whole: { prompt: 'Nốt tròn dài mấy phách?', options: ['1 phách', '2 phách', '4 phách'], answer: 2 },
  rest: { prompt: 'Gặp dấu lặng đen thì làm gì?', options: ['Nghỉ (không đánh) 1 phách', 'Đánh thật mạnh', 'Giữ phím 2 phách'], answer: 0 },
  fourFour: { prompt: 'Nhịp 4/4: mỗi ô nhịp có mấy phách?', options: ['2 phách', '3 phách', '4 phách'], answer: 2 },
  trebleClef: { prompt: 'Khoá Sol ôm dòng kẻ nào?', options: ['Dòng 1 (Mi)', 'Dòng 2 (Sol)', 'Dòng 3 (Si)'], answer: 1 },
  bassC3: { prompt: 'Tay trái đặt ngón 5 ở nốt nào?', options: ['C3 (Đô thấp)', 'G3 (Sol thấp)', 'C4 (Đô giữa)'], answer: 0 },
} satisfies Record<string, ChoiceQuestion>;

/** "Dạo chơi buổi sáng" — tự soạn, hai tay thay phiên (8 ô nhịp). */
const MORNING =
  'RH C4:1 E4:3 G4/h:5 | F4:4 E4:3 D4/h:2 | LH C3:5 E3:3 G3/h:1 | F3:2 E3:3 D3/h:4 | ' +
  'RH E4:3 F4:4 G4:5 E4:3 | D4:2 E4:3 C4/h:1 | LH G3:1 F3:2 E3:3 D3:4 | C3/hd:5 R';

/** "Tốt nghiệp" — tự soạn, bài cuối cấp 1 (8 ô nhịp). */
const GRADUATION =
  'RH C4:1 D4:2 E4:3 G4:5 | F4:4 D4:2 E4/h:3 | LH G3:1 E3:3 C3/h:5 | D3:4 F3:2 E3/h:3 | ' +
  'RH E4:3 G4:5 F4:4 D4:2 | C4:1 E4:3 D4/h:2 | LH E3:3 D3:4 C3:5 R | RH C4/w:1';

const defs: LessonDef[] = [
  // ── Tuần 1 — Làm quen Piano ─────────────────────────────────────────
  {
    lessonId: 'l1-01-keyboard',
    weekId: 'l1-w1',
    number: 1,
    title: 'Khám phá bàn phím',
    description: 'Phím trắng, phím đen và hai loại nhóm phím đen — tấm bản đồ để tìm mọi nốt trên đàn.',
    learningObjectives: ['Phân biệt phím trắng và phím đen', 'Nhận ra nhóm 2 và nhóm 3 phím đen', 'Tìm nhanh một nhóm phím đen bất kỳ'],
    estimatedDuration: 10,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Bàn phím piano',
        pages: [
          keyboardPage('Phím trắng và phím đen', 'Đàn piano có phím trắng và phím đen. Phím đen nằm cao hơn, xếp thành từng nhóm nhỏ.', 'black', 'Nhìn kìa! Phím đen đứng thành từng nhóm nhỏ như những người bạn.'),
          keyboardPage('Nhóm 2 phím đen', 'Có những nhóm gồm 2 phím đen đứng cạnh nhau. Nhóm này lặp lại đều trên khắp bàn phím.', 'black-group-2', 'Hai phím đen đứng cạnh nhau — như hai anh em sinh đôi.'),
          keyboardPage('Nhóm 3 phím đen', 'Xen giữa là các nhóm 3 phím đen. Cả bàn phím cứ thế lặp lại: 2 – 3 – 2 – 3…', 'black-group-3', 'Ba phím đen là ba chị em. Cứ 2 rồi 3, 2 rồi 3!'),
        ],
      },
    ],
    exercises: [
      practice({ kind: 'key-quiz', id: 'warmup', title: 'Khởi động', keyboard: KEYS, retry: true, rounds: [R.black, R.white, R.group2, R.group3], pass: {} }),
      {
        kind: 'key-quiz',
        id: 'test',
        title: 'Kiểm tra: tìm nhóm phím đen',
        instructions: '5 lượt, mỗi lượt bấm một lần. Cần đúng ít nhất 4 lượt.',
        keyboard: KEYS,
        retry: false,
        rounds: [R.group2, R.group3, R.group2, R.group3, R.group2],
        pass: { minCorrect: 4 },
      },
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-02-find-c',
    weekId: 'l1-w1',
    number: 2,
    title: 'Tìm nốt Đô',
    description: 'Nốt Đô (C) luôn nằm ngay bên trái nhóm 2 phím đen. Đô giữa (C4) là nốt ở gần giữa đàn nhất.',
    learningObjectives: ['Tìm nốt C nhờ nhóm 2 phím đen', 'Tìm Đô giữa C4', 'Tìm nốt C ở các quãng tám khác'],
    estimatedDuration: 10,
    prerequisites: ['l1-01-keyboard'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nốt Đô',
        pages: [
          keyboardPage('Đô nằm bên trái nhóm 2 phím đen', 'Tìm một nhóm 2 phím đen, phím trắng ngay bên trái chính là nốt Đô (C).', 'all-c', 'Nốt Đô trốn ngay bên trái hai anh em phím đen!'),
          keyboardPage('Đô giữa — C4', 'Nốt Đô gần giữa đàn nhất gọi là Đô giữa, viết là C4. Đây là nốt mốc của cả giáo trình.', [60], 'Đô giữa là "nhà" của bàn tay phải.'),
          keyboardPage('Các nốt Đô khác', 'Đô thấp hơn là C3, Đô cao hơn là C5. Cứ 8 phím trắng lại gặp một nốt Đô — gọi là một quãng tám.', [48, 72], 'Có nhiều nốt Đô lắm — cao, thấp đều là Đô!'),
        ],
      },
    ],
    exercises: [
      practice({ kind: 'key-quiz', id: 'warmup', title: 'Luyện tìm Đô', keyboard: KEYS, retry: true, rounds: [R.c4, R.otherC, R.c4, R.anyC], pass: {} }),
      {
        kind: 'key-quiz',
        id: 'test',
        title: 'Kiểm tra: tìm nốt Đô',
        instructions: 'Cần đúng ít nhất 80% (4/5 lượt).',
        keyboard: KEYS,
        retry: false,
        rounds: [R.c4, R.anyC, R.c5, R.c3, R.otherC],
        pass: { minAccuracy: 0.8 },
      },
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-03-fingers',
    weekId: 'l1-w1',
    number: 3,
    title: 'Số ngón tay',
    description: 'Mỗi ngón tay có một số từ 1 đến 5. Số ngón ghi trên bản nhạc cho biết dùng ngón nào.',
    learningObjectives: ['Biết số ngón 1–5 của hai tay', 'Đặt tay đúng tư thế', 'Chơi C4–D4–E4 bằng ngón 1–2–3'],
    estimatedDuration: 12,
    prerequisites: ['l1-02-find-c'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Ngón tay',
        pages: [
          { title: 'Số ngón tay', body: 'Ngón cái là 1, ngón trỏ 2, ngón giữa 3, ngón áp út 4, ngón út 5 — giống nhau ở cả hai tay.', illustration: { type: 'hand', hand: 'right' }, kids: 'Ngón cái là số 1, ngón út là số 5. Giơ tay lên đếm nào!' },
          { title: 'Tư thế bàn tay', body: 'Ngồi thẳng, vai thả lỏng. Bàn tay cong tròn như đang ôm một quả bóng nhỏ, đầu ngón tay chạm phím.', illustration: { type: 'hand', hand: 'left' }, kids: 'Bàn tay cong như ôm một quả trứng — đừng bóp vỡ nhé!' },
          {
            title: 'Đặt tay phải',
            body: 'Ngón 1 đặt ở Đô giữa (C4), ngón 2 ở Rê (D4), ngón 3 ở Mi (E4).',
            illustration: { type: 'keyboard', from: 55, to: 69, highlight: [60, 62, 64], fingers: { 60: 1, 62: 2, 64: 3 } },
          },
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: số ngón tay', questions: [Q.thumb, Q.index, Q.middle, Q.pinky], pass: { minAccuracy: 0.75 } },
      play('play', 'Chơi C – D – E bằng ngón 1 – 2 – 3', 'wait', rh('C4:1 D4:2 E4/h:3 | E4:3 D4:2 C4/h:1')),
    ],
    assessment: { passScore: 75, checkpoint: false },
  },
  {
    lessonId: 'l1-04-cde',
    weekId: 'l1-w1',
    number: 4,
    title: 'Ba nốt Đô – Rê – Mi',
    description: 'Chơi chuỗi C4 – D4 – E4 – D4 – C4 theo khuông nhạc, app chờ bạn đánh đúng từng nốt.',
    learningObjectives: ['Nhận biết và chơi C4, D4, E4', 'Chơi chuỗi C–D–E–D–C ở Wait Mode', 'Độ chính xác nốt ≥ 85%'],
    estimatedDuration: 12,
    prerequisites: ['l1-03-fingers'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đô – Rê – Mi',
        pages: [
          {
            title: 'Ba phím quanh nhóm 2 phím đen',
            body: 'Đô bên trái nhóm 2 phím đen, Rê ở giữa hai phím đen, Mi bên phải.',
            illustration: { type: 'keyboard', from: 55, to: 69, highlight: [60, 62, 64], labels: true },
          },
          staffPage('Nghe mẫu', 'Bấm "Nghe mẫu" để nghe chuỗi Đô – Rê – Mi – Rê – Đô.', rh('C4:1 D4:2 E4:3 D4:2 | C4/w:1')),
        ],
      },
    ],
    exercises: [
      practice(play('warmup', 'Luyện: C – D – E – D – C', 'wait', rh('C4:1 D4:2 E4:3 D4:2 | C4/w:1'))),
      play('test', 'Bài chính: Đô – Rê – Mi', 'wait', rh('C4:1 D4:2 E4:3 D4:2 | C4:1 D4:2 E4/h:3 | E4:3 D4:2 C4:1 D4:2 | C4/w:1'), {
        pass: { minAccuracy: 0.85, minCompletion: 1 },
        instructions: 'Độ chính xác nốt cần ≥ 85%.',
      }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-05-week1-test',
    weekId: 'l1-w1',
    number: 5,
    title: 'Kiểm tra tuần 1',
    description: 'Ôn lại bàn phím, nốt Đô, số ngón tay và chơi một giai điệu ngắn. Cần 80/100 điểm.',
    learningObjectives: ['Nhận biết bàn phím', 'Tìm nốt C', 'Nhận biết số ngón', 'Chơi giai điệu ngắn'],
    estimatedDuration: 15,
    prerequisites: ['l1-04-cde'],
    notes: [NO_FINGER_CHECK],
    activities: [],
    exercises: [
      { kind: 'key-quiz', id: 'keys', title: 'Phần 1: bàn phím và nốt Đô', keyboard: KEYS, retry: false, rounds: [R.group2, R.group3, R.c4, R.otherC, R.c5], pass: { minAccuracy: 0.8 } },
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 2: ngón tay và nốt Đô', questions: [Q.thumb, Q.middle, Q.pinky, Q.cPosition], pass: { minAccuracy: 0.75 } },
      play('play', 'Phần 3: giai điệu ngắn', 'wait', rh('C4:1 D4:2 E4:3 C4:1 | E4:3 D4:2 C4/h:1 | D4:2 E4:3 D4:2 E4:3 | C4/w:1'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Đọc khuông nhạc ────────────────────────────────────────
  {
    lessonId: 'l1-06-staff',
    weekId: 'l1-w2',
    number: 6,
    title: 'Khuông nhạc và khoá Sol',
    description: 'Năm dòng kẻ, bốn khe, khoá Sol — và ba nốt đầu tiên trên khuông: Mi, Fa, Sol.',
    learningObjectives: ['Biết khuông nhạc có 5 dòng 4 khe', 'Khoá Sol ôm dòng 2 = nốt Sol (G4)', 'Đọc E4 (dòng 1), F4 (khe 1), G4 (dòng 2)'],
    estimatedDuration: 15,
    prerequisites: ['l1-05-week1-test'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Khuông nhạc',
        pages: [
          staffPage('Năm dòng kẻ', 'Khuông nhạc có 5 dòng kẻ và 4 khe, đếm từ dưới lên. Nốt càng cao trên khuông thì phím càng ở bên phải.', rh('E4/w | F4/w | G4/w')),
          staffPage('Khoá Sol', 'Khoá Sol cuộn quanh dòng thứ 2 — nốt nằm trên dòng đó là Sol (G4).', rh('G4/w')),
          staffPage('Mi – Fa – Sol', 'Mi (E4) nằm trên dòng 1, Fa (F4) trong khe 1, Sol (G4) trên dòng 2.', rh('E4/h F4/h | G4/w'), 'Mi ngồi trên dòng 1, Fa nằm trong khe, Sol ôm dòng 2!'),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['E4', 'F4', 'G4', 'F4', 'E4', 'G4'], choices: ['E4', 'F4', 'G4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['G4', 'E4', 'F4', 'G4', 'E4', 'F4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông: Mi – Fa – Sol', 'wait', rh('E4:3 F4:4 G4/h:5 | G4:5 F4:4 E4/h:3 | E4:3 G4:5 F4:4 E4:3 | F4:4 G4:5 E4/h:3')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-07-c-d-staff',
    weekId: 'l1-w2',
    number: 7,
    title: 'Đô và Rê trên khuông',
    description: 'Đô giữa nằm trên một dòng kẻ phụ phía dưới khuông, Rê nằm ngay dưới dòng 1.',
    learningObjectives: ['Đọc C4 trên dòng kẻ phụ', 'Đọc D4 dưới dòng 1', 'Phân biệt C4 – D4 – E4'],
    estimatedDuration: 15,
    prerequisites: ['l1-06-staff'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Đô và Rê',
        pages: [
          staffPage('Đô giữa có dòng kẻ phụ', 'Đô giữa (C4) nằm dưới khuông, có một gạch ngang nhỏ xuyên qua — gọi là dòng kẻ phụ.', rh('C4/w')),
          staffPage('Rê ngồi dưới dòng 1', 'Rê (D4) nằm sát ngay dưới dòng kẻ thứ nhất, không có dòng kẻ phụ.', rh('C4/h D4/h | E4/w'), 'Đô đội mũ (dòng kẻ phụ), Rê ngồi dưới chân khuông!'),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['C4', 'D4', 'E4', 'D4', 'C4', 'E4', 'D4', 'C4'], choices: ['C4', 'D4', 'E4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['D4', 'C4', 'E4', 'C4', 'D4', 'E4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông: Đô – Rê – Mi', 'wait', rh('C4:1 D4:2 C4/h:1 | D4:2 E4:3 D4/h:2 | C4:1 E4:3 D4:2 C4:1 | D4:2 E4:3 C4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-08-f-g',
    weekId: 'l1-w2',
    number: 8,
    title: 'Nhận diện Fa và Sol',
    description: 'Phân biệt Fa (khe 1) và Sol (dòng 2), xen lẫn với Rê và Mi.',
    learningObjectives: ['Đọc nhanh F4 và G4', 'Không nhầm Fa (khe) với Mi/Sol (dòng)', 'Chơi giai điệu có F4 – G4'],
    estimatedDuration: 15,
    prerequisites: ['l1-07-c-d-staff'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dòng hay khe?',
        pages: [
          staffPage('Dòng – khe – dòng', 'Đi lên từng bậc: Mi (dòng 1) → Fa (khe 1) → Sol (dòng 2). Nốt nằm trên dòng thì dòng kẻ xuyên qua giữa nốt.', rh('E4 F4 G4 F4 | E4 F4 G4/h')),
          {
            title: 'Fa bên trái nhóm 3 phím đen',
            body: 'Trên đàn: Fa (F4) ngay bên trái nhóm 3 phím đen, Sol (G4) kế bên. Tay phải: ngón 4 ở Fa, ngón 5 ở Sol.',
            illustration: { type: 'keyboard', from: 55, to: 69, highlight: [65, 67], fingers: { 65: 4, 67: 5 } },
          },
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['F4', 'G4', 'E4', 'G4', 'F4', 'D4', 'G4', 'F4'], choices: ['D4', 'E4', 'F4', 'G4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['G4', 'F4', 'G4', 'E4', 'F4', 'G4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông: Fa – Sol', 'wait', rh('G4:5 F4:4 G4/h:5 | E4:3 F4:4 G4/h:5 | G4:5 E4:3 F4:4 D4:2 | E4:3 F4:4 G4/h:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-09-five-notes',
    weekId: 'l1-w2',
    number: 9,
    title: 'Đọc và chơi 5 nốt',
    description: 'Đủ năm nốt Đô – Rê – Mi – Fa – Sol, mỗi ngón một phím. Bài 8 ô nhịp đầu tiên!',
    learningObjectives: ['Đọc C4–G4 trên khuông', 'Mỗi ngón giữ một phím (thế tay Đô)', 'Chơi trọn bài 8 ô nhịp ở Wait Mode'],
    estimatedDuration: 15,
    prerequisites: ['l1-08-f-g'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Thế tay Đô',
        pages: [
          {
            title: 'Năm ngón – năm nốt',
            body: 'Ngón 1 ở C4, rồi lần lượt 2 – 3 – 4 – 5 ở D4, E4, F4, G4. Không cần nhấc tay khi chơi.',
            illustration: { type: 'keyboard', from: 55, to: 69, highlight: [60, 62, 64, 65, 67], fingers: { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 } },
          },
          staffPage('Nghe mẫu bài "Năm ngón dạo chơi"', 'Nghe trước bài sẽ chơi.', rh('C4:1 D4:2 E4:3 F4:4 | G4/h:5 E4/h:3 | F4:4 E4:3 D4:2 E4:3 | C4/w:1', 66, 'Năm ngón dạo chơi')),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['C4', 'E4', 'G4', 'D4', 'F4', 'C4', 'G4', 'E4'], pass: { minAccuracy: 0.8 } },
      play(
        'play',
        'Năm ngón dạo chơi',
        'wait',
        rh('C4:1 D4:2 E4:3 F4:4 | G4/h:5 E4/h:3 | F4:4 E4:3 D4:2 E4:3 | C4/w:1 | E4:3 F4:4 G4:5 E4:3 | D4:2 F4:4 E4/h:3 | G4:5 F4:4 E4:3 D4:2 | C4/w:1', 66, 'Năm ngón dạo chơi'),
        { weight: 2 },
      ),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-10-week2-test',
    weekId: 'l1-w2',
    number: 10,
    title: 'Kiểm tra đọc nốt',
    description: 'Gọi tên nốt, nhìn nốt đánh nốt và chơi một bài theo khuông. Cần 80/100 điểm.',
    learningObjectives: ['Nhận diện C4–G4 trên khuông', 'Đánh đúng nốt nhìn thấy', 'Chơi bài theo khuông'],
    estimatedDuration: 15,
    prerequisites: ['l1-09-five-notes'],
    activities: [],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Phần 1: gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['E4', 'C4', 'G4', 'D4', 'F4', 'E4', 'G4', 'C4'], choices: ['C4', 'D4', 'E4', 'F4', 'G4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Phần 2: nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['F4', 'D4', 'G4', 'C4', 'E4', 'F4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Phần 3: chơi theo khuông', 'wait', rh('E4:3 G4:5 F4:4 D4:2 | C4:1 E4:3 D4/h:2 | F4:4 G4:5 E4:3 C4:1 | D4:2 E4:3 C4/h:1'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Tiết tấu ──────────────────────────────────────────────
  {
    lessonId: 'l1-11-quarter',
    weekId: 'l1-w3',
    number: 11,
    title: 'Nốt đen — 1 phách',
    description: 'Nốt đen dài đúng 1 phách. Bật metronome, đếm đều 1 – 2 – 3 – 4 và gõ theo.',
    learningObjectives: ['Nốt đen = 1 phách', 'Gõ đều theo metronome', 'Chơi nốt đen đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l1-10-week2-test'],
    notes: [NO_DURATION_MIC],
    ageVariants: { kids: { tempoPercent: 85 } },
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nốt đen',
        pages: [
          countPage('Đếm phách', 'Mỗi nốt đen là một phách. Nhịp 4/4: mỗi ô nhịp có 4 phách — đếm to "1 – 2 – 3 – 4".', rh('C4 C4 C4 C4 | C4 C4 C4 C4'), ['1', '2', '3', '4', '1', '2', '3', '4'], 'Tích – tắc – tích – tắc: mỗi nốt đen là một tiếng tích tắc!'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ nốt đen theo metronome', 'rhythm', rh('C4 C4 C4 C4 | C4 C4 C4 C4 | C4 C4 C4 C4'), { instructions: 'Đánh phím nào cũng được — chỉ chấm thời điểm.' }),
      play('perform', 'Biểu diễn: nốt đen', 'performance', rh('C4:1 D4:2 E4:3 D4:2 | C4:1 D4:2 E4:3 E4:3 | D4:2 D4:2 E4:3 D4:2 | C4:1 D4:2 C4:1 C4:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-12-half',
    weekId: 'l1-w3',
    number: 12,
    title: 'Nốt trắng — 2 phách',
    description: 'Nốt trắng (đầu rỗng, có đuôi) dài 2 phách: đánh ở phách 1 rồi giữ phím qua phách 2.',
    learningObjectives: ['Nốt trắng = 2 phách', 'Giữ phím đủ trường độ', 'Kết hợp nốt đen và nốt trắng'],
    estimatedDuration: 15,
    prerequisites: ['l1-11-quarter'],
    notes: [NO_DURATION_MIC],
    ageVariants: { kids: { tempoPercent: 85 } },
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nốt trắng',
        pages: [
          countPage('Giữ 2 phách', 'Đánh ở "1", giữ phím khi đếm "2". Nốt trắng dài bằng hai nốt đen.', rh('C4/h C4/h | C4 C4 C4/h'), ['1 – 2', '3 – 4', '1', '2', '3 – 4'], 'Đánh rồi giữ yên — đếm "một – hai" mới nhấc tay.'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ nốt trắng – nốt đen', 'rhythm', rh('C4/h C4/h | C4 C4 C4/h | C4/h C4 C4 | C4/h C4/h')),
      play('perform', 'Biểu diễn: nốt trắng', 'performance', rh('E4/h:3 D4/h:2 | C4:1 D4:2 E4/h:3 | E4:3 E4:3 D4/h:2 | D4:2 E4:3 C4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-13-whole',
    weekId: 'l1-w3',
    number: 13,
    title: 'Nốt tròn — 4 phách',
    description: 'Nốt tròn (đầu rỗng, không đuôi) dài 4 phách — chiếm trọn một ô nhịp 4/4.',
    learningObjectives: ['Nốt tròn = 4 phách', 'Giữ phím cả ô nhịp', 'So sánh nốt đen, trắng, tròn'],
    estimatedDuration: 15,
    prerequisites: ['l1-12-half'],
    notes: [NO_DURATION_MIC],
    ageVariants: { kids: { tempoPercent: 85 } },
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nốt tròn',
        pages: [
          countPage('Giữ 4 phách', 'Đánh ở "1", giữ phím qua "2 – 3 – 4". Một nốt tròn = hai nốt trắng = bốn nốt đen.', rh('C4/w | C4/h C4/h | C4 C4 C4 C4'), ['1 – 2 – 3 – 4', '1 – 2', '3 – 4', '1', '2', '3', '4'], 'Nốt tròn ngủ một giấc dài — đếm đến 4 mới dậy!'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ nốt tròn – trắng – đen', 'rhythm', rh('C4/w | C4/h C4/h | C4 C4 C4 C4 | C4/w')),
      play('perform', 'Biểu diễn: nốt tròn', 'performance', rh('C4/w:1 | D4/w:2 | E4/h:3 D4/h:2 | C4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-14-rest',
    weekId: 'l1-w3',
    number: 14,
    title: 'Dấu lặng đen — 1 phách nghỉ',
    description: 'Dấu lặng đen là 1 phách im lặng: vẫn đếm nhưng không đánh. Gõ trong dấu lặng sẽ bị trừ điểm nhịp.',
    learningObjectives: ['Dấu lặng đen = nghỉ 1 phách', 'Vẫn đếm khi nghỉ', 'Không đánh trong dấu lặng'],
    estimatedDuration: 15,
    prerequisites: ['l1-13-whole'],
    notes: [NO_DURATION_MIC],
    ageVariants: { kids: { tempoPercent: 85 } },
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu lặng đen',
        pages: [
          countPage('Nghỉ 1 phách', 'Dấu lặng đen trông như tia chớp nhỏ. Khi gặp nó, nhấc tay và đếm thầm.', rh('C4 C4 C4 R | C4 R C4 R'), ['1', '2', '3', '(4)', '1', '(2)', '3', '(4)'], 'Gặp tia chớp thì "suỵt" — im lặng một phách!'),
        ],
      },
    ],
    exercises: [
      play('rhythm', 'Gõ và nghỉ đúng phách', 'rhythm', rh('C4 C4 C4 R | C4 R C4 R | C4 C4 R C4 | C4/h R R')),
      play('perform', 'Biểu diễn: có dấu lặng', 'performance', rh('E4:3 D4:2 C4:1 R | E4:3 D4:2 C4:1 R | C4:1 D4:2 E4:3 F4:4 | G4/h:5 R R')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-15-rhythm-test',
    weekId: 'l1-w3',
    number: 15,
    title: 'Kiểm tra tiết tấu 4/4',
    description: 'Câu hỏi về trường độ, gõ tiết tấu và biểu diễn theo metronome. Cần 80/100 điểm.',
    learningObjectives: ['Nhớ trường độ nốt đen, trắng, tròn, dấu lặng đen', 'Giữ nhịp đều', 'Biểu diễn đúng nốt và đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l1-14-rest'],
    notes: [NO_DURATION_MIC],
    ageVariants: { kids: { tempoPercent: 85 } },
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: trường độ', questions: [Q.quarter, Q.half, Q.whole, Q.rest, Q.fourFour], pass: { minAccuracy: 0.8 } },
      play('rhythm', 'Phần 2: gõ tiết tấu', 'rhythm', rh('C4 C4 C4/h | C4/w | C4 R C4 R | C4/h C4 R')),
      play('perform', 'Phần 3: biểu diễn', 'performance', rh('C4:1 D4:2 E4:3 R | E4/h:3 D4/h:2 | C4:1 E4:3 D4:2 R | C4/w:1'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Hai tay và biểu diễn ───────────────────────────────────
  {
    lessonId: 'l1-16-left-hand',
    weekId: 'l1-w4',
    number: 16,
    title: 'Tay trái: Đô – Sol thấp',
    description: 'Tay trái chơi C3 – G3 trên khoá Fa: ngón 5 ở Đô thấp (C3), ngón 1 ở Sol (G3).',
    learningObjectives: ['Đặt tay trái ở thế Đô (C3–G3)', 'Đọc C3–G3 trên khoá Fa', 'Chơi bài tay trái ở Wait Mode'],
    estimatedDuration: 15,
    prerequisites: ['l1-15-rhythm-test'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Tay trái',
        pages: [
          {
            title: 'Thế tay trái',
            body: 'Tay trái đánh số ngón giống tay phải (ngón cái = 1), nên ngón 5 đặt ở C3 và ngón 1 ở G3.',
            illustration: { type: 'keyboard', from: 45, to: 57, highlight: [48, 50, 52, 53, 55], fingers: { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1 } },
          },
          staffPage('Khoá Fa', 'Nốt tay trái viết trên khoá Fa. Hai chấm của khoá Fa ôm dòng 4 — đó là Fa (F3). Đô thấp (C3) nằm trong khe 2.', lh('C3:5 D3:4 E3:3 F3:2 | G3/w:1')),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt (khoá Fa)', clef: 'bass', answer: 'play', sequence: ['C3', 'E3', 'G3', 'D3', 'F3', 'C3'], pass: { minAccuracy: 0.8 } },
      play('play1', 'Tay trái đi lên – đi xuống', 'wait', lh('C3:5 D3:4 E3:3 F3:2 | G3/w:1 | G3:1 F3:2 E3:3 D3:4 | C3/w:5')),
      play('play2', 'Tay trái nhảy bậc', 'wait', lh('C3:5 E3:3 G3/h:1 | F3:2 E3:3 D3/h:4 | E3:3 D3:4 E3:3 F3:2 | C3/w:5')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-17-hand-switch',
    weekId: 'l1-w4',
    number: 17,
    title: 'Đổi tay trái – tay phải',
    description: 'Hai tay thay phiên nhau trên khuông đôi: tay phải khoá Sol, tay trái khoá Fa. Luyện riêng từng tay nếu khó.',
    learningObjectives: ['Đọc khuông đôi', 'Chuyển tay không ngắt quãng', 'Luyện riêng từng tay rồi ghép lại'],
    estimatedDuration: 15,
    prerequisites: ['l1-16-left-hand'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Khuông đôi',
        pages: [
          staffPage('Khuông đôi', 'Khuông trên (khoá Sol) cho tay phải, khuông dưới (khoá Fa) cho tay trái. Khuông nào đang có dấu lặng thì tay đó nghỉ.', both('RH C4:1 D4:2 E4/h:3 | LH G3:1 F3:2 E3/h:3')),
        ],
      },
    ],
    exercises: [
      play('play1', 'Hỏi – đáp giữa hai tay', 'wait', both('RH C4:1 D4:2 E4/h:3 | LH G3:1 F3:2 E3/h:3 | RH E4:3 D4:2 C4/h:1 | LH C3/w:5')),
      play('play2', 'Đổi tay giữa ô nhịp', 'wait', both('RH E4:3 F4:4 G4/h:5 | LH E3:3 D3:4 C3/h:5 | RH G4:5 F4:4 E4:3 D4:2 | LH D3:4 E3:3 RH C4/h:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-18-piece-4',
    weekId: 'l1-w4',
    number: 18,
    title: 'Bài nhạc 4 ô nhịp',
    description: 'Bài "Sao đêm" (tự soạn): tập chậm ở Wait Mode, rồi biểu diễn theo metronome.',
    learningObjectives: ['Đọc trọn bài 4 ô nhịp', 'Chơi đúng nốt ở Wait Mode', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l1-17-hand-switch'],
    notes: [NO_DURATION_MIC],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Sao đêm',
        pages: [staffPage('Nghe mẫu', 'Nghe bài trước khi chơi — chú ý nốt Mi dài 3 phách ở cuối.', rh('E4:3 E4:3 G4:5 G4:5 | F4:4 E4:3 D4/h:2 | E4:3 D4:2 C4:1 D4:2 | E4/hd:3 R', 66, 'Sao đêm'))],
      },
    ],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', rh('E4:3 E4:3 G4:5 G4:5 | F4:4 E4:3 D4/h:2 | E4:3 D4:2 C4:1 D4:2 | E4/hd:3 R', 66, 'Sao đêm'), {
        pass: { minAccuracy: 0.85, minCompletion: 1 },
      }),
      play('perform', 'Biểu diễn', 'performance', rh('E4:3 E4:3 G4:5 G4:5 | F4:4 E4:3 D4/h:2 | E4:3 D4:2 C4:1 D4:2 | E4/hd:3 R', 66, 'Sao đêm'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-19-piece-8',
    weekId: 'l1-w4',
    number: 19,
    title: 'Bài nhạc 8 ô nhịp',
    description: 'Bài "Dạo chơi buổi sáng" (tự soạn), hai tay thay phiên. Luyện từng tay, rồi biểu diễn cả bài.',
    learningObjectives: ['Chơi trọn bài 8 ô nhịp', 'Chuyển tay đúng lúc', 'Biểu diễn liên tục không dừng'],
    estimatedDuration: 20,
    prerequisites: ['l1-18-piece-4'],
    notes: [NO_DURATION_MIC],
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', both(MORNING, 66, 'Dạo chơi buổi sáng'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', both(MORNING, 66, 'Dạo chơi buổi sáng'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l1-20-final',
    weekId: 'l1-w4',
    number: 20,
    title: 'Kiểm tra cuối cấp 1',
    description: 'Lý thuyết, đọc nốt và biểu diễn bài "Tốt nghiệp" (tự soạn) hai tay. Cần 80/100 điểm.',
    learningObjectives: ['Ôn toàn bộ kiến thức cấp 1', 'Đọc nốt khoá Sol và khoá Fa', 'Biểu diễn trọn bài 8 ô nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l1-19-piece-8'],
    notes: [NO_DURATION_MIC],
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.cPosition, Q.thumb, Q.trebleClef, Q.half, Q.rest, Q.bassC3], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'name', title: 'Phần 2: gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['G4', 'D4', 'F4', 'C4', 'E4', 'G4'], choices: ['C4', 'D4', 'E4', 'F4', 'G4'], pass: { minAccuracy: 0.8 } },
      play('perform', 'Phần 3: biểu diễn "Tốt nghiệp"', 'performance', both(GRADUATION, 66, 'Tốt nghiệp'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL1_WEEKS: Week[] = [
  {
    weekId: 'l1-w1',
    number: 1,
    title: 'Tuần 1 — Làm quen Piano',
    description: 'Bàn phím, nốt Đô, số ngón tay, ba nốt Đô – Rê – Mi.',
    lessonIds: ['l1-01-keyboard', 'l1-02-find-c', 'l1-03-fingers', 'l1-04-cde', 'l1-05-week1-test'],
    extraPractice: [
      { lessonId: 'notes-middle-c', tip: 'Đô giữa nằm ngay bên trái nhóm 2 phím đen ở giữa đàn; trên khuông có một dòng kẻ phụ.' },
      { lessonId: 'notes-c-d', tip: 'Rê nằm giữa hai phím đen; trên khuông Rê ngồi ngay dưới dòng kẻ thứ nhất.' },
      { lessonId: 'notes-c-d-e', tip: 'Mi nằm bên phải nhóm 2 phím đen; trên khuông Mi nằm trên dòng kẻ thứ nhất.' },
    ],
  },
  {
    weekId: 'l1-w2',
    number: 2,
    title: 'Tuần 2 — Đọc khuông nhạc',
    description: 'Khuông nhạc, khoá Sol, đọc và chơi 5 nốt C4 – G4.',
    lessonIds: ['l1-06-staff', 'l1-07-c-d-staff', 'l1-08-f-g', 'l1-09-five-notes', 'l1-10-week2-test'],
    extraPractice: [
      { lessonId: 'notes-f-g', tip: 'Fa nằm bên trái nhóm 3 phím đen. Nốt đi lên trên khuông = phím đi sang phải.' },
      { lessonId: 'notes-a-b-c', tip: 'Mở rộng: dời cả bàn tay, ngón cái đặt ở Sol. Đô5 nằm trong khe thứ ba của khuông.' },
      { lessonId: 'notes-seven', tip: 'Mở rộng: Đô Rê Mi Fa Sol La Si — đọc tên nốt thành tiếng khi đánh.' },
      { lessonId: 'notes-lines', tip: 'Năm dòng kẻ từ dưới lên: Mi – Sol – Si – Rê – Fa.' },
      { lessonId: 'notes-spaces', tip: 'Bốn khe từ dưới lên: Fa – La – Đô – Mi.' },
      { lessonId: 'notes-mixed', tip: 'Nhìn nốt trước khi nhìn tay — app chờ đến khi bạn đánh đúng.' },
    ],
  },
  {
    weekId: 'l1-w3',
    number: 3,
    title: 'Tuần 3 — Tiết tấu',
    description: 'Nốt đen, nốt trắng, nốt tròn, dấu lặng đen; metronome và nhịp 4/4.',
    lessonIds: ['l1-11-quarter', 'l1-12-half', 'l1-13-whole', 'l1-14-rest', 'l1-15-rhythm-test'],
  },
  {
    weekId: 'l1-w4',
    number: 4,
    title: 'Tuần 4 — Hai tay và biểu diễn',
    description: 'Tay trái C3 – G3, đổi tay, bài nhạc 4 và 8 ô nhịp, kiểm tra cuối cấp.',
    lessonIds: ['l1-16-left-hand', 'l1-17-hand-switch', 'l1-18-piece-4', 'l1-19-piece-8', 'l1-20-final'],
    extraPractice: [
      { lessonId: 'notes-bass', tip: 'Khoá Fa: hai chấm ôm dòng kẻ thứ tư — đó là nốt Fa3. Đô3 ở khe thứ hai.' },
      { lessonId: 'notes-bass-mixed', tip: 'Nhớ mốc: Fa3 trên dòng thứ tư, Đô3 trong khe thứ hai, La3 ở dòng trên cùng.' },
      { lessonId: 'song-twinkle', tip: 'Thử sức: chơi trọn một bài hát chỉ với các nốt đã học (thêm nốt La).' },
    ],
  },
];

export const LEVEL1_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
