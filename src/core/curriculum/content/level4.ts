/**
 * Cấp độ 4 — "Dấu thăng, dấu giáng": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Nội dung: dấu thăng, nửa cung / nguyên cung, dấu hoá bất thường giữ hiệu lực hết ô nhịp, dấu giáng, dấu hoàn,
 * hoá biểu Sol trưởng (Fa thăng) và Fa trưởng (Si giáng), gam Sol trưởng / Fa trưởng, bài hai tay trong hai giọng.
 * Mọi giai điệu là bài tập tự soạn cho giáo trình VietPiano.
 * Ký hiệu luôn ghi đủ dấu hoá ("F#4", "Bb4"); bài có `keySignature` thì khuông nhạc tự bỏ dấu đã có trong hoá biểu.
 * Thế tay: phải thế Đô (1 = C4), thế Rê (1 = D4: D E F♯ G A), thế Sol (1 = G4), thế Fa (1 = F4: F G A B♭ C);
 * trái thế Rê (5 = D3: D E F♯ G A), thế Fa (5 = F2: F G A B♭ C).
 */
import type { ChoiceQuestion, CurriculumLesson, KeyQuizRound, Week } from '../types';
import { both, buildLessons, in34, inKey, keyboardPage, KEYS, lh, NO_DURATION_MIC, NO_FINGER_CHECK, play, practice, rh, staffPage, type LessonDef } from './helpers';

const LEVEL = 'level-4';
const KIDS_SLOWER = { kids: { tempoPercent: 85 } };

const R = {
  fSharp4: { prompt: 'Bấm Fa thăng (F♯4)', target: { type: 'midi', midi: 66 } },
  anyFSharp: { prompt: 'Bấm một nốt Fa thăng (F♯) bất kỳ', target: { type: 'pitch-class', pc: 6 } },
  cSharp4: { prompt: 'Bấm Đô thăng (C♯4)', target: { type: 'midi', midi: 61 } },
  bFlat4: { prompt: 'Bấm Si giáng (B♭4)', target: { type: 'midi', midi: 70 } },
  anyBFlat: { prompt: 'Bấm một nốt Si giáng (B♭) bất kỳ', target: { type: 'pitch-class', pc: 10 } },
  eFlat4: { prompt: 'Bấm Mi giáng (E♭4)', target: { type: 'midi', midi: 63 } },
  halfUpC: { prompt: 'Bấm nốt cao hơn Đô giữa (C4) nửa cung', target: { type: 'midi', midi: 61 } },
  halfUpE: { prompt: 'Bấm nốt cao hơn Mi (E4) nửa cung', target: { type: 'midi', midi: 65 } },
  halfDownB: { prompt: 'Bấm nốt thấp hơn Si (B4) nửa cung', target: { type: 'midi', midi: 70 } },
  wholeUpC: { prompt: 'Bấm nốt cao hơn Đô giữa (C4) một cung', target: { type: 'midi', midi: 62 } },
} satisfies Record<string, KeyQuizRound>;

const Q = {
  sharp: { prompt: 'Dấu thăng (♯) làm nốt thay đổi thế nào?', options: ['Cao lên nửa cung', 'Thấp xuống nửa cung', 'Trở về nốt tự nhiên'], answer: 0 },
  flat: { prompt: 'Dấu giáng (♭) làm nốt thay đổi thế nào?', options: ['Thấp xuống nửa cung', 'Cao lên nửa cung', 'Dài thêm nửa phách'], answer: 0 },
  natural: { prompt: 'Dấu hoàn (♮) dùng để làm gì?', options: ['Bỏ dấu thăng / giáng, trở về nốt tự nhiên', 'Làm nốt cao lên một cung', 'Nghỉ một phách'], answer: 0 },
  halfStep: { prompt: 'Nửa cung là khoảng cách giữa…', options: ['Hai phím liền nhau (tính cả phím đen)', 'Hai phím trắng bất kỳ', 'Hai nốt Đô'], answer: 0 },
  eF: { prompt: 'Giữa Mi và Fa có phím đen không?', options: ['Không — Mi và Fa cách nhau nửa cung', 'Có một phím đen', 'Có hai phím đen'], answer: 0 },
  wholeStep: { prompt: 'Một cung bằng mấy nửa cung?', options: ['1', '2', '3'], answer: 1 },
  barRule: { prompt: 'Dấu thăng / giáng ghi cạnh nốt có hiệu lực tới đâu?', options: ['Tới hết ô nhịp đó', 'Chỉ đúng nốt đó', 'Tới hết bài'], answer: 0 },
  fSharpWhere: { prompt: 'Fa thăng (F♯) là phím nào?', options: ['Phím đen ngay bên phải Fa', 'Phím đen ngay bên trái Fa', 'Phím trắng Sol'], answer: 0 },
  bFlatWhere: { prompt: 'Si giáng (B♭) là phím nào?', options: ['Phím đen ngay bên trái Si', 'Phím đen ngay bên phải Si', 'Phím trắng La'], answer: 0 },
  gKey: { prompt: 'Hoá biểu có một dấu thăng ở dòng Fa là giọng nào?', options: ['Sol trưởng', 'Fa trưởng', 'Đô trưởng'], answer: 0 },
  fKey: { prompt: 'Hoá biểu có một dấu giáng ở dòng Si là giọng nào?', options: ['Fa trưởng', 'Sol trưởng', 'Đô trưởng'], answer: 0 },
  gKeyMeaning: { prompt: 'Trong giọng Sol trưởng, mọi nốt Fa được chơi thế nào?', options: ['Fa thăng (phím đen)', 'Fa tự nhiên (phím trắng)', 'Fa giáng'], answer: 0 },
  fKeyMeaning: { prompt: 'Trong giọng Fa trưởng, mọi nốt Si được chơi thế nào?', options: ['Si giáng (phím đen)', 'Si tự nhiên (phím trắng)', 'Si thăng'], answer: 0 },
  gScaleBlack: { prompt: 'Gam Sol trưởng có nốt nào là phím đen?', options: ['Fa thăng', 'Si giáng', 'Đô thăng'], answer: 0 },
  fScaleThumb: { prompt: 'Gam Fa trưởng tay phải đi lên: ngón cái luồn dưới ở nốt nào?', options: ['Đô (C5) — ngay sau ngón 4 ở Si giáng', 'Si giáng', 'Fa cao'], answer: 0 },
  whichKeyG: { prompt: 'Bản nhạc này ở giọng nào?', options: ['Sol trưởng', 'Fa trưởng', 'Đô trưởng'], answer: 0, illustration: { type: 'staff', piece: inKey(rh('G4 A4 B4 F#4 | G4/w'), 'G') } },
  whichKeyF: { prompt: 'Bản nhạc này ở giọng nào?', options: ['Sol trưởng', 'Fa trưởng', 'Đô trưởng'], answer: 1, illustration: { type: 'staff', piece: inKey(rh('F4 A4 Bb4 G4 | F4/w'), 'F') } },
  whichKeyC: { prompt: 'Bản nhạc này ở giọng nào?', options: ['Sol trưởng', 'Fa trưởng', 'Đô trưởng'], answer: 2, illustration: { type: 'staff', piece: rh('C4 E4 G4 E4 | C4/w') } },
} satisfies Record<string, ChoiceQuestion>;

/** "Đồi thông" — tự soạn, Sol trưởng, tay phải thế Rê (8 ô nhịp). */
const PINE_HILL =
  'D4:1 F#4:3 A4/h:5 | G4:4 F#4:3 E4/h:2 | F#4/qd:3 G4/8:4 A4:5 F#4:3 | E4/w:2 | ' +
  'A4:5 G4:4 F#4:3 E4:2 | F#4/qd:3 E4/8:2 D4/h:1 | E4:2 F#4:3 G4:4 E4:2 | D4/w:1';

/** Hai tay giọng Sol trưởng: tay phải thế Sol, tay trái thế Rê, thay phiên — tự soạn (8 ô nhịp). */
const G_HANDS =
  'RH G4:1 A4:2 B4/h:3 | LH A3:1 G3:2 F#3/h:3 | RH B4:3 C5:4 D5/h:5 | LH F#3:3 E3:4 D3/h:5 | ' +
  'RH D5:5 C5:4 B4:3 A4:2 | LH E3:4 F#3:3 G3:2 A3:1 | RH B4:3 A4:2 G4/h:1 | LH D3/w:5';

/** "Chiều quê" — tự soạn, 3/4, Fa trưởng, tay phải thế Fa (8 ô nhịp). */
const EVENING = 'F4:1 A4:3 C5:5 | Bb4/h:4 A4:3 | G4:2 Bb4:4 A4:3 | G4/hd:2 | A4:3 Bb4:4 C5:5 | A4/h:3 F4:1 | G4:2 A4:3 G4:2 | F4/hd:1';

/** Hai tay giọng Fa trưởng: hai tay thế Fa thay phiên — tự soạn (8 ô nhịp). */
const F_HANDS =
  'RH F4:1 G4:2 A4/h:3 | LH C3:1 Bb2:2 A2/h:3 | RH A4:3 Bb4:4 C5/h:5 | LH A2:3 G2:4 F2/h:5 | ' +
  'RH C5:5 Bb4:4 A4:3 G4:2 | LH G2:4 A2:3 Bb2:2 C3:1 | RH A4:3 G4:2 F4/h:1 | LH F2/w:5';

/** "Tốt nghiệp cấp 4" — tự soạn, Fa trưởng, hai tay thay phiên (8 ô nhịp). */
const GRADUATION_4 =
  'RH F4:1 A4:3 C5/h:5 | Bb4:4 A4:3 G4/h:2 | LH C3:1 A2:3 F2/h:5 | G2:4 Bb2:2 A2/h:3 | ' +
  'RH A4:3 Bb4:4 C5:5 A4:3 | G4:2 Bb4:4 A4/h:3 | LH Bb2:2 A2:3 G2:4 C3:1 | F2/w:5';

/** Gam Sol trưởng tay phải (luồn ngón cái ở Đô khi đi lên, vắt ngón 3 qua ở Si khi đi xuống). */
const SCALE_G = 'G4:1 A4:2 B4:3 C5:1 | D5:2 E5:3 F#5:4 G5:5 | F#5:4 E5:3 D5:2 C5:1 | B4:3 A4:2 G4/h:1';
/** Gam Fa trưởng tay phải (ngón 4 ở Si giáng, luồn ngón cái ở Đô). */
const SCALE_F = 'F4:1 G4:2 A4:3 Bb4:4 | C5:1 D5:2 E5:3 F5:4 | E5:3 D5:2 C5:1 Bb4:4 | A4:3 G4:2 F4/h:1';

const dPositionKeys = { type: 'keyboard' as const, from: 60, to: 71, highlight: [62, 64, 66, 67, 69], fingers: { 62: 1, 64: 2, 66: 3, 67: 4, 69: 5 } };
const fPositionKeys = { type: 'keyboard' as const, from: 64, to: 76, highlight: [65, 67, 69, 70, 72], fingers: { 65: 1, 67: 2, 69: 3, 70: 4, 72: 5 } };
const lhFPositionKeys = { type: 'keyboard' as const, from: 36, to: 52, highlight: [41, 43, 45, 46, 48], fingers: { 41: 5, 43: 4, 45: 3, 46: 2, 48: 1 } };
const lhDPositionKeys = { type: 'keyboard' as const, from: 48, to: 60, highlight: [50, 52, 54, 55, 57], fingers: { 50: 5, 52: 4, 54: 3, 55: 2, 57: 1 } };
const gScaleKeys = { type: 'keyboard' as const, from: 64, to: 81, highlight: [67, 69, 71, 72, 74, 76, 78, 79], fingers: { 67: 1, 69: 2, 71: 3, 72: 1, 74: 2, 76: 3, 78: 4, 79: 5 } };
const fScaleKeys = { type: 'keyboard' as const, from: 64, to: 79, highlight: [65, 67, 69, 70, 72, 74, 76, 77], fingers: { 65: 1, 67: 2, 69: 3, 70: 4, 72: 1, 74: 2, 76: 3, 77: 4 } };

const defs: LessonDef[] = [
  // ── Tuần 1 — Dấu thăng, giọng Sol trưởng ──────────────────────────────
  {
    lessonId: 'l4-01-sharp',
    weekId: 'l4-w1',
    number: 1,
    title: 'Dấu thăng ♯',
    description: 'Dấu thăng làm nốt cao lên nửa cung: Fa thăng (F♯) là phím đen ngay bên phải Fa.',
    learningObjectives: ['Hiểu dấu thăng: cao lên nửa cung', 'Tìm Fa thăng, Đô thăng trên đàn', 'Chơi giai điệu có Fa thăng'],
    estimatedDuration: 15,
    prerequisites: ['l3-20-final'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu thăng',
        pages: [
          keyboardPage('Fa thăng', 'Dấu thăng ♯ làm nốt cao lên nửa cung — sang phím ngay bên phải. Fa thăng là phím đen đầu tiên của nhóm 3 phím đen.', [65, 66], 'Fa bước sang phải một bước nhỏ là thành Fa thăng!'),
          staffPage('Nghe mẫu', 'Fa rồi Fa thăng: nghe Fa thăng cao hơn một chút, sát với Sol.', rh('F4/h F#4/h | G4/w')),
        ],
      },
    ],
    exercises: [
      practice({ kind: 'key-quiz', id: 'warmup', title: 'Luyện tìm nốt thăng', keyboard: KEYS, retry: true, rounds: [R.anyFSharp, R.fSharp4, R.anyFSharp, R.cSharp4], pass: {} }),
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: dấu thăng', questions: [Q.sharp, Q.fSharpWhere], pass: { minAccuracy: 0.5 } },
      play('play', 'Giai điệu có Fa thăng', 'wait', rh('C4:1 D4:2 E4:3 F#4:4 | G4/w:5 | G4:5 F#4:4 E4:3 D4:2 | C4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-02-half-steps',
    weekId: 'l4-w1',
    number: 2,
    title: 'Nửa cung và một cung',
    description: 'Hai phím liền nhau (kể cả phím đen) cách nhau nửa cung; hai nửa cung là một cung. Mi – Fa và Si – Đô chỉ cách nửa cung.',
    learningObjectives: ['Tìm nốt cao / thấp hơn nửa cung', 'Biết Mi – Fa, Si – Đô cách nửa cung', 'Chơi các nốt liền nhau theo nửa cung'],
    estimatedDuration: 15,
    prerequisites: ['l4-01-sharp'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nửa cung',
        pages: [
          keyboardPage('Mi – Fa, Si – Đô', 'Giữa Mi và Fa, giữa Si và Đô không có phím đen: hai cặp này chỉ cách nhau nửa cung. Các cặp phím trắng khác cách nhau một cung.', [64, 65, 71, 72]),
          staffPage('Nghe mẫu', 'Đi từng nửa cung: Đô – Đô thăng – Rê.', rh('C4 C#4 D4 C#4 | C4/w')),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: nửa cung, một cung', questions: [Q.halfStep, Q.eF, Q.wholeStep], pass: { minAccuracy: 0.66 } },
      { kind: 'key-quiz', id: 'keys', title: 'Tìm nốt theo nửa cung', keyboard: KEYS, retry: false, rounds: [R.halfUpC, R.halfUpE, R.wholeUpC, R.halfDownB, R.fSharp4], pass: { minAccuracy: 0.8 } },
      play('play', 'Đi từng nửa cung', 'wait', rh('C4 C#4 D4 C#4 | C4/h E4/h | E4 F4 F#4 F4 | E4/w')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-03-sharps-staff',
    weekId: 'l4-w1',
    number: 3,
    title: 'Dấu thăng trên khuông',
    description: 'Dấu ♯ ghi ngay trước nốt, cùng dòng / khe với nốt, và giữ hiệu lực tới hết ô nhịp đó.',
    learningObjectives: ['Đọc nốt có dấu thăng', 'Nhớ: dấu hoá giữ hiệu lực hết ô nhịp', 'Chơi theo khuông có Fa thăng'],
    estimatedDuration: 15,
    prerequisites: ['l4-02-half-steps'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu thăng trên khuông',
        pages: [
          staffPage('Hết ô nhịp', 'Nốt Fa thứ hai trong ô nhịp không ghi lại dấu ♯ nhưng vẫn là Fa thăng — dấu hoá giữ tới vạch nhịp.', rh('F4 F#4 G4 F#4 | G4/w'), 'Dấu thăng có phép thuật kéo dài tới hết ô nhịp!'),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hiệu lực dấu hoá', questions: [Q.barRule], pass: { minAccuracy: 1 } },
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['F4', 'F#4', 'G4', 'F#4', 'F4', 'G4'], choices: ['F4', 'F#4', 'G4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Nhìn nốt – đánh nốt', clef: 'treble', answer: 'play', sequence: ['F#4', 'F4', 'G4', 'C#4', 'C4', 'F#4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi theo khuông', 'wait', rh('E4:3 F#4:4 G4/h:5 | G4:5 F#4:4 E4/h:3 | D4:2 E4:3 F#4:4 E4:3 | D4/w:2')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-04-g-major',
    weekId: 'l4-w1',
    number: 4,
    title: 'Hoá biểu Sol trưởng',
    description: 'Một dấu thăng ở dòng Fa ngay sau khoá Sol: MỌI nốt Fa trong bài là Fa thăng, không cần ghi lại dấu ♯ cạnh nốt.',
    learningObjectives: ['Nhận ra hoá biểu Sol trưởng', 'Nhớ chơi Fa thăng dù không có dấu cạnh nốt', 'Chơi ở thế tay Rê (D4 – A4)'],
    estimatedDuration: 15,
    prerequisites: ['l4-03-sharps-staff'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Sol trưởng',
        pages: [
          staffPage('Một dấu thăng', 'Dấu ♯ trên dòng Fa (dòng 5) ngay sau khoá Sol là hoá biểu Sol trưởng. Nốt Fa trong bài không có dấu nhưng vẫn là Fa thăng.', inKey(rh('D4 E4 F#4 G4 | A4/w'), 'G'), 'Dấu thăng đứng gác ở đầu bài: mọi bạn Fa đều phải đi phím đen!'),
          { title: 'Thế tay Rê', body: 'Ngón 1 ở Rê (D4); ngón 3 nằm sẵn trên Fa thăng.', illustration: dPositionKeys },
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hoá biểu Sol trưởng', questions: [Q.gKey, Q.gKeyMeaning], pass: { minAccuracy: 0.5 } },
      { kind: 'note-reading', id: 'find', title: 'Đánh nốt — nhớ hoá biểu', clef: 'treble', answer: 'play', keySignature: 'G', sequence: ['F#4', 'G4', 'E4', 'F#4', 'A4', 'D4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi giọng Sol trưởng', 'wait', inKey(rh('D4:1 E4:2 F#4:3 G4:4 | A4/h:5 F#4/h:3 | G4:4 F#4:3 E4:2 F#4:3 | D4/w:1'), 'G')),
      play('perform', 'Biểu diễn', 'performance', inKey(rh('A4:5 G4:4 F#4:3 E4:2 | D4/h:1 F#4/h:3 | E4:2 F#4:3 G4:4 E4:2 | D4/w:1', 66), 'G')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-05-week1-test',
    weekId: 'l4-w1',
    number: 5,
    title: 'Kiểm tra tuần 1',
    description: 'Câu hỏi về dấu thăng, nửa cung và hoá biểu Sol trưởng; tìm phím và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Dấu thăng, nửa cung, một cung', 'Hoá biểu Sol trưởng', 'Biểu diễn giọng Sol trưởng'],
    estimatedDuration: 15,
    prerequisites: ['l4-04-g-major'],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.sharp, Q.halfStep, Q.barRule, Q.gKey, Q.gKeyMeaning], pass: { minAccuracy: 0.8 } },
      { kind: 'key-quiz', id: 'keys', title: 'Phần 2: tìm phím', keyboard: KEYS, retry: false, rounds: [R.fSharp4, R.cSharp4, R.halfUpE, R.anyFSharp, R.wholeUpC], pass: { minAccuracy: 0.8 } },
      play('perform', 'Phần 3: biểu diễn', 'performance', inKey(rh('D4:1 F#4:3 A4/h:5 | G4:4 F#4:3 E4/h:2 | F#4:3 G4:4 A4:5 F#4:3 | E4:2 F#4:3 D4/h:1', 66), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Dấu giáng, dấu hoàn, giọng Fa trưởng ─────────────────────
  {
    lessonId: 'l4-06-flat',
    weekId: 'l4-w2',
    number: 6,
    title: 'Dấu giáng ♭',
    description: 'Dấu giáng làm nốt thấp xuống nửa cung: Si giáng (B♭) là phím đen ngay bên trái Si.',
    learningObjectives: ['Hiểu dấu giáng: thấp xuống nửa cung', 'Tìm Si giáng, Mi giáng trên đàn', 'Chơi ở thế tay Fa (F4 – C5)'],
    estimatedDuration: 15,
    prerequisites: ['l4-05-week1-test'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu giáng',
        pages: [
          keyboardPage('Si giáng', 'Dấu giáng ♭ làm nốt thấp xuống nửa cung — sang phím ngay bên trái. Si giáng là phím đen cuối của nhóm 3 phím đen.', [70, 71], 'Si lùi sang trái một bước nhỏ là thành Si giáng!'),
          { title: 'Thế tay Fa', body: 'Ngón 1 ở Fa (F4), ngón 4 trên Si giáng, ngón 5 ở Đô cao.', illustration: fPositionKeys },
        ],
      },
    ],
    exercises: [
      practice({ kind: 'key-quiz', id: 'warmup', title: 'Luyện tìm nốt giáng', keyboard: KEYS, retry: true, rounds: [R.anyBFlat, R.bFlat4, R.eFlat4, R.anyBFlat], pass: {} }),
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: dấu giáng', questions: [Q.flat, Q.bFlatWhere], pass: { minAccuracy: 0.5 } },
      play('play', 'Thế tay Fa có Si giáng', 'wait', rh('F4:1 G4:2 A4:3 Bb4:4 | C5/w:5 | C5:5 Bb4:4 A4:3 G4:2 | F4/w:1')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-07-natural',
    weekId: 'l4-w2',
    number: 7,
    title: 'Dấu hoàn ♮',
    description: 'Trong cùng ô nhịp, sau Si giáng muốn chơi lại Si thường thì ghi dấu hoàn ♮ — nốt trở về phím trắng.',
    learningObjectives: ['Hiểu dấu hoàn', 'Phân biệt Si và Si giáng trên khuông', 'Chơi giai điệu có dấu hoàn'],
    estimatedDuration: 15,
    prerequisites: ['l4-06-flat'],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dấu hoàn',
        pages: [staffPage('Trở về phím trắng', 'Ô nhịp 1: Si giáng rồi Si có dấu hoàn — phím đen rồi phím trắng.', rh('A4 Bb4 A4 B4 | C5/w'), 'Dấu hoàn như cục tẩy: xoá dấu giáng đi!')],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: dấu hoàn', questions: [Q.natural, Q.barRule], pass: { minAccuracy: 0.5 } },
      { kind: 'note-reading', id: 'name', title: 'Si hay Si giáng?', clef: 'treble', answer: 'name', sequence: ['B4', 'Bb4', 'A4', 'Bb4', 'B4', 'A4'], choices: ['A4', 'Bb4', 'B4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Giai điệu có dấu hoàn', 'wait', rh('A4:2 Bb4:3 A4:2 G4:1 | A4:2 B4:3 C5/h:4 | C5:4 Bb4:3 A4:2 G4:1 | A4/w:2')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-08-f-major',
    weekId: 'l4-w2',
    number: 8,
    title: 'Hoá biểu Fa trưởng',
    description: 'Một dấu giáng ở dòng Si (dòng 3): MỌI nốt Si trong bài là Si giáng.',
    learningObjectives: ['Nhận ra hoá biểu Fa trưởng', 'Nhớ chơi Si giáng dù không có dấu cạnh nốt', 'Biểu diễn giọng Fa trưởng'],
    estimatedDuration: 15,
    prerequisites: ['l4-07-natural'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Fa trưởng',
        pages: [
          staffPage('Một dấu giáng', 'Dấu ♭ trên dòng Si ngay sau khoá Sol là hoá biểu Fa trưởng. Nốt Si không có dấu nhưng vẫn là Si giáng.', inKey(rh('F4 G4 A4 Bb4 | C5/w'), 'F')),
          { title: 'Thế tay Fa', body: 'Ngón 4 nằm sẵn trên Si giáng.', illustration: fPositionKeys },
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hoá biểu Fa trưởng', questions: [Q.fKey, Q.fKeyMeaning], pass: { minAccuracy: 0.5 } },
      { kind: 'note-reading', id: 'find', title: 'Đánh nốt — nhớ hoá biểu', clef: 'treble', answer: 'play', keySignature: 'F', sequence: ['Bb4', 'A4', 'C5', 'G4', 'Bb4', 'F4'], pass: { minAccuracy: 0.8 } },
      play('play', 'Chơi giọng Fa trưởng', 'wait', inKey(rh('F4:1 A4:3 C5/h:5 | Bb4:4 A4:3 G4/h:2 | A4:3 Bb4:4 C5:5 A4:3 | G4:2 A4:3 F4/h:1'), 'F')),
      play('perform', 'Biểu diễn', 'performance', inKey(rh('C5:5 Bb4:4 A4:3 G4:2 | F4/h:1 A4/h:3 | G4:2 A4:3 Bb4:4 G4:2 | F4/w:1', 66), 'F')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-09-lh-f',
    weekId: 'l4-w2',
    number: 9,
    title: 'Tay trái thế Fa',
    description: 'Tay trái: ngón 5 ở Fa thấp (F2), ngón 2 trên Si giáng (B♭2), ngón 1 ở Đô (C3). Đọc trên khoá Fa có hoá biểu Fa trưởng.',
    learningObjectives: ['Đặt tay trái thế Fa (F2 – C3)', 'Đọc Si giáng trên khoá Fa', 'Biểu diễn tay trái giọng Fa trưởng'],
    estimatedDuration: 15,
    prerequisites: ['l4-08-f-major'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Tay trái thế Fa',
        pages: [
          { title: 'Thế tay Fa (tay trái)', body: 'Ngón 5 ở F2, ngón 4 – 3 – 2 – 1 ở G2, A2, B♭2, C3.', illustration: lhFPositionKeys },
          staffPage('Nghe mẫu', 'Năm nốt thế Fa tay trái đi lên.', inKey(lh('F2 G2 A2 Bb2 | C3/w'), 'F')),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'name', title: 'Gọi tên nốt khoá Fa', clef: 'bass', answer: 'name', sequence: ['F2', 'A2', 'Bb2', 'C3', 'G2', 'Bb2'], choices: ['F2', 'G2', 'A2', 'Bb2', 'C3'], pass: { minAccuracy: 0.8 } },
      play('play', 'Tay trái thế Fa', 'wait', inKey(lh('F2:5 G2:4 A2:3 Bb2:2 | C3/w:1 | C3:1 Bb2:2 A2:3 G2:4 | F2/w:5'), 'F')),
      play('perform', 'Biểu diễn tay trái', 'performance', inKey(lh('F2:5 A2:3 C3/h:1 | Bb2:2 A2:3 G2/h:4 | A2:3 Bb2:2 C3:1 A2:3 | G2:4 A2:3 F2/h:5', 66), 'F'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-10-week2-test',
    weekId: 'l4-w2',
    number: 10,
    title: 'Kiểm tra tuần 2',
    description: 'Câu hỏi về dấu giáng, dấu hoàn và hoá biểu Fa trưởng; đọc nốt và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Dấu giáng, dấu hoàn', 'Hoá biểu Fa trưởng', 'Biểu diễn giọng Fa trưởng'],
    estimatedDuration: 15,
    prerequisites: ['l4-09-lh-f'],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.flat, Q.natural, Q.fKey, Q.fKeyMeaning, Q.bFlatWhere], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'name', title: 'Phần 2: gọi tên nốt', clef: 'treble', answer: 'name', sequence: ['Bb4', 'B4', 'A4', 'Bb4', 'C5'], choices: ['A4', 'Bb4', 'B4', 'C5'], pass: { minAccuracy: 0.8 } },
      play('perform', 'Phần 3: biểu diễn', 'performance', inKey(rh('F4:1 G4:2 A4:3 Bb4:4 | C5/h:5 A4/h:3 | Bb4:4 A4:3 G4:2 A4:3 | F4/w:1', 66), 'F'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Giọng Sol trưởng ──────────────────────────────────────────
  {
    lessonId: 'l4-11-g-scale',
    weekId: 'l4-w3',
    number: 11,
    title: 'Gam Sol trưởng',
    description: 'G4 → G5: 1 – 2 – 3, luồn ngón cái ở Đô, rồi 2 – 3 – 4 – 5. Ngón 4 đánh Fa thăng.',
    learningObjectives: ['Chơi gam Sol trưởng tay phải', 'Luồn ngón cái ở Đô', 'Nhớ Fa thăng trong gam'],
    estimatedDuration: 15,
    prerequisites: ['l4-10-week2-test'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Gam Sol trưởng',
        pages: [
          { title: 'Ngón tay cho gam Sol trưởng', body: 'Đi lên: 1 – 2 – 3, luồn ngón 1 ở Đô cao, rồi 2 – 3 – 4 – 5 (ngón 4 ở Fa thăng). Đi xuống ngược lại, vắt ngón 3 qua ở Si.', illustration: gScaleKeys },
          staffPage('Nghe mẫu', 'Gam Sol trưởng đi lên rồi đi xuống.', inKey(rh(SCALE_G, 66, 'Gam Sol trưởng'), 'G')),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: gam Sol trưởng', questions: [Q.gScaleBlack, Q.gKeyMeaning], pass: { minAccuracy: 0.5 } },
      practice(play('warmup', 'Luyện luồn ngón: Sol La Si Đô', 'wait', inKey(rh('G4:1 A4:2 B4:3 C5:1 | B4:3 A4:2 G4/h:1'), 'G'))),
      play('play', 'Gam Sol trưởng (Wait Mode)', 'wait', inKey(rh(SCALE_G, 66, 'Gam Sol trưởng'), 'G')),
      play('perform', 'Biểu diễn gam Sol trưởng', 'performance', inKey(rh(SCALE_G, 66, 'Gam Sol trưởng'), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-12-lh-d',
    weekId: 'l4-w3',
    number: 12,
    title: 'Tay trái thế Rê (Sol trưởng)',
    description: 'Tay trái: ngón 5 ở Rê (D3), ngón 3 trên Fa thăng (F♯3), ngón 1 ở La (A3). Đọc khoá Fa có một dấu thăng.',
    learningObjectives: ['Đặt tay trái thế Rê', 'Đọc Fa thăng trên khoá Fa theo hoá biểu', 'Biểu diễn tay trái giọng Sol trưởng'],
    estimatedDuration: 15,
    prerequisites: ['l4-11-g-scale'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Tay trái thế Rê',
        pages: [
          { title: 'Thế tay Rê (tay trái)', body: 'Ngón 5 ở D3, ngón 4 – 3 – 2 – 1 ở E3, F♯3, G3, A3.', illustration: lhDPositionKeys },
          staffPage('Nghe mẫu', 'Khoá Fa có hoá biểu Sol trưởng: nốt Fa là Fa thăng.', inKey(lh('D3 E3 F#3 G3 | A3/w'), 'G')),
        ],
      },
    ],
    exercises: [
      { kind: 'note-reading', id: 'find', title: 'Đánh nốt — nhớ hoá biểu', clef: 'bass', answer: 'play', keySignature: 'G', sequence: ['F#3', 'D3', 'A3', 'F#3', 'E3', 'G3'], pass: { minAccuracy: 0.8 } },
      play('play', 'Tay trái thế Rê', 'wait', inKey(lh('D3:5 E3:4 F#3:3 G3:2 | A3/w:1 | A3:1 G3:2 F#3:3 E3:4 | D3/w:5'), 'G')),
      play('perform', 'Biểu diễn tay trái', 'performance', inKey(lh('D3:5 F#3:3 A3/h:1 | G3:2 F#3:3 E3/h:4 | F#3:3 G3:2 A3:1 F#3:3 | E3:4 F#3:3 D3/h:5', 66), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-13-pine-hill',
    weekId: 'l4-w3',
    number: 13,
    title: 'Bài nhạc: Đồi thông',
    description: 'Bài "Đồi thông" (tự soạn) 8 ô nhịp giọng Sol trưởng, tay phải thế Rê. Không có dấu ♯ cạnh nốt — nhớ hoá biểu!',
    learningObjectives: ['Chơi trọn bài giọng Sol trưởng', 'Giữ Fa thăng suốt bài', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l4-12-lh-d'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Đồi thông', pages: [staffPage('Nghe mẫu', 'Nghe trước — đếm xem bài có bao nhiêu nốt Fa thăng.', inKey(rh(PINE_HILL, 66, 'Đồi thông'), 'G'))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', inKey(rh(PINE_HILL, 66, 'Đồi thông'), 'G'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', inKey(rh(PINE_HILL, 66, 'Đồi thông'), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-14-g-hands',
    weekId: 'l4-w3',
    number: 14,
    title: 'Hai tay giọng Sol trưởng',
    description: 'Tay phải thế Sol, tay trái thế Rê, thay phiên nhau. Fa thăng chỉ có ở tay trái trong bài này.',
    learningObjectives: ['Hai tay ở hai thế tay khác nhau', 'Đọc hoá biểu trên khuông đôi', 'Biểu diễn bài 8 ô nhịp hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l4-13-pine-hill'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', inKey(both(G_HANDS, 66, 'Hai tay Sol trưởng'), 'G'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', inKey(both(G_HANDS, 66, 'Hai tay Sol trưởng'), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-15-week3-test',
    weekId: 'l4-w3',
    number: 15,
    title: 'Kiểm tra tuần 3',
    description: 'Câu hỏi về giọng Sol trưởng và cung / nửa cung, đọc nốt theo hoá biểu và biểu diễn. Cần 80/100 điểm.',
    learningObjectives: ['Giọng Sol trưởng, gam Sol trưởng', 'Đọc nốt theo hoá biểu', 'Biểu diễn đúng nốt và đúng nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l4-14-g-hands'],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.gKey, Q.gKeyMeaning, Q.gScaleBlack, Q.wholeStep, Q.halfStep], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'find', title: 'Phần 2: đánh nốt theo hoá biểu', clef: 'treble', answer: 'play', keySignature: 'G', sequence: ['F#4', 'B4', 'D5', 'F#4', 'A4', 'G4'], pass: { minAccuracy: 0.8 } },
      play('perform', 'Phần 3: biểu diễn', 'performance', inKey(rh('D4:1 E4:2 F#4:3 A4:5 | G4:4 F#4:3 E4/h:2 | F#4:3 G4:4 A4:5 F#4:3 | E4:2 F#4:3 D4/h:1', 66), 'G'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Giọng Fa trưởng và biểu diễn ──────────────────────────────
  {
    lessonId: 'l4-16-f-scale',
    weekId: 'l4-w4',
    number: 16,
    title: 'Gam Fa trưởng',
    description: 'F4 → F5: 1 – 2 – 3 – 4 (ngón 4 ở Si giáng), luồn ngón cái ở Đô, rồi 2 – 3 – 4.',
    learningObjectives: ['Chơi gam Fa trưởng tay phải', 'Luồn ngón cái sau ngón 4', 'Nhớ Si giáng trong gam'],
    estimatedDuration: 15,
    prerequisites: ['l4-15-week3-test'],
    notes: [NO_FINGER_CHECK],
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Gam Fa trưởng',
        pages: [
          { title: 'Ngón tay cho gam Fa trưởng', body: 'Khác các gam trước: ngón 4 đánh Si giáng rồi mới luồn ngón cái ở Đô. Đi xuống: vắt ngón 4 qua ở Si giáng.', illustration: fScaleKeys },
          staffPage('Nghe mẫu', 'Gam Fa trưởng đi lên rồi đi xuống.', inKey(rh(SCALE_F, 66, 'Gam Fa trưởng'), 'F')),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: gam Fa trưởng', questions: [Q.fScaleThumb, Q.fKeyMeaning], pass: { minAccuracy: 0.5 } },
      practice(play('warmup', 'Luyện luồn ngón sau Si giáng', 'wait', inKey(rh('F4:1 G4:2 A4:3 Bb4:4 | C5:1 Bb4:4 A4:3 G4:2 | F4/w:1'), 'F'))),
      play('play', 'Gam Fa trưởng (Wait Mode)', 'wait', inKey(rh(SCALE_F, 66, 'Gam Fa trưởng'), 'F')),
      play('perform', 'Biểu diễn gam Fa trưởng', 'performance', inKey(rh(SCALE_F, 66, 'Gam Fa trưởng'), 'F'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-17-evening',
    weekId: 'l4-w4',
    number: 17,
    title: 'Bài nhạc 3/4: Chiều quê',
    description: 'Bài "Chiều quê" (tự soạn) 8 ô nhịp, nhịp 3/4, giọng Fa trưởng, tay phải thế Fa.',
    learningObjectives: ['Chơi trọn bài 3/4 giọng Fa trưởng', 'Giữ Si giáng suốt bài', 'Nhấn nhẹ phách 1'],
    estimatedDuration: 20,
    prerequisites: ['l4-16-f-scale'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Chiều quê', pages: [staffPage('Nghe mẫu', 'Nghe trước — "MỘT – hai – ba" nhẹ nhàng như chiều quê.', in34(inKey(rh(EVENING, 72, 'Chiều quê'), 'F')))] }],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', in34(inKey(rh(EVENING, 72, 'Chiều quê'), 'F')), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', in34(inKey(rh(EVENING, 72, 'Chiều quê'), 'F')), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-18-f-hands',
    weekId: 'l4-w4',
    number: 18,
    title: 'Hai tay giọng Fa trưởng',
    description: 'Hai tay thế Fa thay phiên: Si giáng ở cả tay phải (B♭4) và tay trái (B♭2).',
    learningObjectives: ['Hai tay cùng thế Fa', 'Si giáng ở hai quãng 8', 'Biểu diễn bài hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l4-17-evening'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('wait', 'Tập chậm (Wait Mode)', 'wait', inKey(both(F_HANDS, 66, 'Hai tay Fa trưởng'), 'F'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Biểu diễn', 'performance', inKey(both(F_HANDS, 66, 'Hai tay Fa trưởng'), 'F'), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-19-which-key',
    weekId: 'l4-w4',
    number: 19,
    title: 'Sol trưởng hay Fa trưởng?',
    description: 'Nhìn hoá biểu là biết giọng: một dấu thăng → Sol trưởng, một dấu giáng → Fa trưởng, không dấu → Đô trưởng.',
    learningObjectives: ['Nhận ra giọng từ hoá biểu', 'Đọc nốt theo hai hoá biểu khác nhau', 'Chuyển nhanh giữa hai giọng'],
    estimatedDuration: 15,
    prerequisites: ['l4-18-f-hands'],
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Giọng nào?', questions: [Q.whichKeyG, Q.whichKeyF, Q.whichKeyC], pass: { minAccuracy: 0.66 } },
      { kind: 'note-reading', id: 'f-key', title: 'Đánh nốt: giọng Fa trưởng', clef: 'treble', answer: 'play', keySignature: 'F', sequence: ['Bb4', 'F4', 'A4', 'C5', 'Bb4'], pass: { minAccuracy: 0.8 } },
      { kind: 'note-reading', id: 'g-key', title: 'Đánh nốt: giọng Sol trưởng', clef: 'treble', answer: 'play', keySignature: 'G', sequence: ['F#4', 'G4', 'D4', 'A4', 'F#4'], pass: { minAccuracy: 0.8 } },
      play('perform', 'Biểu diễn giọng Fa trưởng', 'performance', inKey(rh('F4:1 A4:3 Bb4:4 C5:5 | A4/h:3 G4/h:2 | Bb4:4 A4:3 G4:2 A4:3 | F4/w:1', 66), 'F')),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l4-20-final',
    weekId: 'l4-w4',
    number: 20,
    title: 'Kiểm tra cuối cấp 4',
    description: 'Lý thuyết dấu hoá và hoá biểu, đọc nốt có dấu hoá, biểu diễn bài "Tốt nghiệp cấp 4" (tự soạn) hai tay. Cần 80/100 điểm.',
    learningObjectives: ['Ôn toàn bộ kiến thức cấp 4', 'Đọc nốt thăng, giáng, hoàn', 'Biểu diễn bài hai tay giọng Fa trưởng'],
    estimatedDuration: 25,
    prerequisites: ['l4-19-which-key'],
    notes: [NO_DURATION_MIC],
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.sharp, Q.flat, Q.natural, Q.halfStep, Q.gKey, Q.fKey, Q.barRule], pass: { minAccuracy: 0.8 } },
      {
        kind: 'note-reading',
        id: 'name',
        title: 'Phần 2: gọi tên nốt có dấu hoá',
        clef: 'treble',
        answer: 'name',
        sequence: ['F#4', 'Bb4', 'C#4', 'Eb4', 'B4', 'F4'],
        choices: ['C#4', 'Eb4', 'F4', 'F#4', 'Bb4', 'B4'],
        pass: { minAccuracy: 0.8 },
      },
      play('perform', 'Phần 3: biểu diễn "Tốt nghiệp cấp 4"', 'performance', inKey(both(GRADUATION_4, 66, 'Tốt nghiệp cấp 4'), 'F'), { weight: 3 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL4_WEEKS: Week[] = [
  {
    weekId: 'l4-w1',
    number: 1,
    title: 'Tuần 1 — Dấu thăng, giọng Sol trưởng',
    description: 'Dấu thăng, nửa cung và một cung, dấu hoá giữ hết ô nhịp, hoá biểu Sol trưởng.',
    lessonIds: ['l4-01-sharp', 'l4-02-half-steps', 'l4-03-sharps-staff', 'l4-04-g-major', 'l4-05-week1-test'],
    extraPractice: [{ lessonId: 'song-old-macdonald', tip: 'Bài giọng Sol trưởng — để ý hoá biểu một dấu thăng ở đầu khuông.' }],
  },
  {
    weekId: 'l4-w2',
    number: 2,
    title: 'Tuần 2 — Dấu giáng, giọng Fa trưởng',
    description: 'Dấu giáng, dấu hoàn, hoá biểu Fa trưởng, tay trái thế Fa.',
    lessonIds: ['l4-06-flat', 'l4-07-natural', 'l4-08-f-major', 'l4-09-lh-f', 'l4-10-week2-test'],
    extraPractice: [{ lessonId: 'song-auld-lang-syne', tip: 'Bài giọng Fa trưởng — mọi nốt Si là Si giáng.' }],
  },
  {
    weekId: 'l4-w3',
    number: 3,
    title: 'Tuần 3 — Giọng Sol trưởng',
    description: 'Gam Sol trưởng, tay trái thế Rê, bài "Đồi thông", hai tay giọng Sol trưởng.',
    lessonIds: ['l4-11-g-scale', 'l4-12-lh-d', 'l4-13-pine-hill', 'l4-14-g-hands', 'l4-15-week3-test'],
    extraPractice: [
      { lessonId: 'song-yankee-doodle', tip: 'Giọng Sol trưởng, nhịp vui — giữ Fa thăng suốt bài.' },
      { lessonId: 'song-minuet-g', tip: 'Thử sức: Minuet giọng Sol trưởng, nhịp 3/4.' },
    ],
  },
  {
    weekId: 'l4-w4',
    number: 4,
    title: 'Tuần 4 — Giọng Fa trưởng và biểu diễn',
    description: 'Gam Fa trưởng, bài "Chiều quê", hai tay giọng Fa trưởng, phân biệt hai giọng; kiểm tra cuối cấp.',
    lessonIds: ['l4-16-f-scale', 'l4-17-evening', 'l4-18-f-hands', 'l4-19-which-key', 'l4-20-final'],
    extraPractice: [{ lessonId: 'song-amazing-grace', tip: 'Giọng Sol trưởng, nhịp 3/4 — ôn lại hoá biểu một dấu thăng.' }],
  },
];

export const LEVEL4_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
