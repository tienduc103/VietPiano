/**
 * Giáo trình bổ sung "Làm quen từng nốt": mỗi buổi giới thiệu MỘT nốt theo cùng một khuôn
 *   Giới thiệu (hình + âm thanh mẫu) → Câu đố chọn hình → Luyện phím trên đàn → Chọn trò chơi tìm nốt.
 * Tách khỏi cấp 1–6 (không ảnh hưởng gợi ý mở khoá); tiến độ dùng chung kho theo hồ sơ (`curriculumStore`),
 * lessonId có tiền tố "sup-". Hiện có bài mẫu nốt Đô; các nốt khác ở `SUPPLEMENT_UPCOMING` ("sắp có").
 * CHỈ dữ liệu — trò chơi của từng buổi ở `SUPPLEMENT_GAMES` (cấu hình sẵn nốt của buổi).
 */
import type { Letter } from '../../balloonPop/notes';
import type { LessonGameSpec } from '../../games/gameForLesson';
import type { ChoiceQuestion, Curriculum, CurriculumLesson, Illustration } from '../types';
import { buildLessons, rh } from './helpers';

/** Bàn phím của bài: C3–B5 (đủ ba nốt Đô C3, C4, C5 và Đô cao C5 ở giữa). */
const KEYS = { from: 48, to: 83 };
/** Bàn phím nhỏ trong thẻ hình đáp án: một quãng tám rưỡi quanh Đô giữa. */
const MINI = { from: 57, to: 71 };

const miniKey = (midi: number): Illustration => ({ type: 'keyboard', ...MINI, highlight: [midi], noLabels: true });
const staffNote = (pitch: string): Illustration => ({ type: 'staff', piece: { ...rh(`${pitch}/w`), timeSignature: [4, 4] } });
const finger = (n: number): Illustration => ({ type: 'hand', hand: 'right', highlight: n });

/** Nốt Đô ở bốn trường độ: tròn, trắng, đen, móc đơn — tên trường độ ghi dưới từng nốt. */
const C_DURATIONS: Illustration = {
  type: 'staff',
  // Ô cuối: nốt trắng trước, móc đơn sau — móc đơn đứng sát nhau, cuối ô còn chỗ cho chữ hai dòng.
  piece: { ...rh('C4/w | C4/h C4/h | C4 C4 C4 C4 | C4/h C4/8 C4/8 C4/8 C4/8'), timeSignature: [4, 4] },
  listen: true,
  noteLabels: ['Tròn', 'Trắng', 'Trắng', 'Đen', 'Đen', 'Đen', 'Đen', 'Trắng', 'Móc đơn', 'Móc đơn', 'Móc đơn', 'Móc đơn'],
};

/** Câu đố chọn hình; nhãn trung tính "Hình 1…" để không lộ đáp án. */
function pictureQuestion(prompt: string, images: Illustration[], answer: number): ChoiceQuestion {
  return { prompt, options: images.map((_, i) => `Hình ${i + 1}`), optionImages: images, answer };
}

const C_LESSON = {
  lessonId: 'sup-c',
  weekId: 'sup-w1',
  number: 1,
  title: 'Nốt Đô',
  description: 'Làm quen nốt Đô: tìm trên bàn phím, nhận ra trên khuông nhạc, biết ngón đánh và nghe tiếng của nó — rồi chơi trò tìm nốt Đô.',
  learningObjectives: ['Tìm nốt Đô nhờ nhóm 2 phím đen', 'Nhận ra Đô giữa trên khuông nhạc', 'Đánh Đô giữa bằng ngón 1 tay phải', 'Tìm nốt Đô ở các quãng tám khác'],
  estimatedDuration: 10,
  ageVariants: {
    kids: { description: 'Hôm nay mình làm quen bạn Đô — bạn ấy trốn ngay bên trái hai anh em phím đen!' },
  },
  activities: [
    {
      kind: 'intro',
      id: 'intro',
      title: 'Nốt Đô',
      pages: [
        {
          title: 'Đây là nốt Đô',
          body: 'Phía trên là nốt Đô trên khuông nhạc với các trường độ khác nhau; phía dưới là các phím Đô trên đàn. Bấm Nghe để nghe tiếng Đô.',
          kids: 'Đây là bạn Đô! Trên khuông nhạc bạn ấy dài, ngắn khác nhau. Dưới là phím Đô trên đàn.',
          illustration: { ...C_DURATIONS, caption: 'Nốt Đô trên khuông nhạc' },
          moreIllustrations: [{ type: 'keyboard', ...KEYS, highlight: 'all-c', listen: [60], caption: 'Phím Đô trên đàn' }],
        },
        {
          title: 'Đô nằm bên trái 2 phím đen',
          body: 'Tìm một nhóm 2 phím đen: phím trắng ngay bên trái nhóm đó chính là nốt Đô.',
          kids: 'Bạn Đô luôn đứng bên trái hai anh em phím đen.',
          illustration: { type: 'keyboard', ...KEYS, highlight: [48, 49, 51, 60, 61, 63, 72, 73, 75], listen: [48, 60, 72] },
        },
        {
          title: 'Đô giữa trên khuông nhạc',
          body: 'Đô giữa (C4) viết ở dòng kẻ phụ ngay dưới khuông khoá Sol — như một quả bóng có gạch ngang qua.',
          kids: 'Trên khuông nhạc, Đô giữa có một gạch ngang qua bụng.',
          illustration: { type: 'staff', piece: { ...rh('C4 C4 C4 C4'), timeSignature: [4, 4] }, listen: true },
        },
        {
          title: 'Nốt Đô dài, ngắn khác nhau',
          body: 'Cùng là nốt Đô nhưng hình nốt cho biết ngân dài bao lâu: nốt tròn 4 phách, nốt trắng 2 phách, nốt đen 1 phách, nốt móc đơn nửa phách. Bấm Nghe mẫu để nghe.',
          kids: 'Bạn Đô có nhiều chiếc áo: áo tròn ngân thật dài, áo móc đơn chạy thật nhanh!',
          illustration: C_DURATIONS,
        },
        {
          title: 'Ngón 1 tay phải đánh Đô',
          body: 'Ngón cái tay phải là ngón 1. Đặt ngón 1 lên Đô giữa — đây là "nhà" của bàn tay phải.',
          kids: 'Ngón cái là ngón số 1. Đặt ngón cái lên bạn Đô nào!',
          illustration: { type: 'keyboard', from: 55, to: 69, highlight: [60], fingers: { 60: 1 }, listen: [60] },
        },
        {
          title: 'Nhiều nốt Đô',
          body: 'Đô thấp (C3), Đô giữa (C4), Đô cao (C5) — cứ 8 phím trắng lại gặp một nốt Đô. Nghe: Đô càng sang phải càng cao.',
          kids: 'Có Đô thấp, Đô giữa, Đô cao. Nghe xem bạn nào cao nhất!',
          illustration: { type: 'keyboard', ...KEYS, highlight: [48, 60, 72], listen: [48, 60, 72] },
        },
      ],
    },
  ],
  exercises: [
    {
      kind: 'choice-quiz',
      id: 'picture-quiz',
      title: 'Câu đố: chọn hình đúng',
      instructions: 'Chạm vào hình đúng. Sai thì chọn lại nhé.',
      retry: true,
      questions: [
        pictureQuestion('Phím nào là Đô?', [miniKey(62), miniKey(60), miniKey(65)], 1),
        pictureQuestion('Phím đang sáng nào là nốt Đô?', [miniKey(59), miniKey(64), miniKey(60), miniKey(67)], 2),
        pictureQuestion('Đâu là nốt Đô giữa trên khuông?', [staffNote('C4'), staffNote('E4'), staffNote('G4')], 0),
        pictureQuestion('Khuông nào có nốt Đô giữa?', [staffNote('D4'), staffNote('B3'), staffNote('C4')], 2),
        pictureQuestion('Ngón nào đánh nốt Đô giữa?', [finger(3), finger(5), finger(1)], 2),
        pictureQuestion('Ngón cái — ngón số mấy?', [finger(1), finger(2), finger(4)], 0),
      ],
      pass: { minCorrect: 5 },
    },
    {
      kind: 'key-quiz',
      id: 'keys',
      title: 'Luyện phím: tìm nốt Đô',
      instructions: 'Đánh trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình. Sai thì thử lại.',
      keyboard: KEYS,
      retry: true,
      rounds: [
        { prompt: 'Đánh Đô giữa', target: { type: 'midi', midi: 60 } },
        { prompt: 'Đánh Đô giữa lần nữa', target: { type: 'midi', midi: 60 } },
        { prompt: 'Đánh một nốt Đô khác', target: { type: 'pitch-class', pc: 0, exclude: [60] } },
        { prompt: 'Đánh Đô thấp', target: { type: 'midi', midi: 48 } },
        { prompt: 'Đánh Đô cao', target: { type: 'midi', midi: 72 } },
      ],
      pass: { minCorrect: 4 },
    },
  ],
  assessment: { passScore: 70, checkpoint: false },
} satisfies Omit<CurriculumLesson, 'levelId' | 'contentVersion' | 'prerequisites' | 'unlockCriteria'>;

export const SUPPLEMENT_LESSONS: CurriculumLesson[] = buildLessons('sup-notes', [C_LESSON]);

export const SUPPLEMENT: Curriculum = {
  curriculumId: 'vietpiano-supplement',
  title: 'Giáo trình bổ sung',
  contentVersion: 1,
  levels: [
    {
      levelId: 'sup-notes',
      number: 1,
      title: 'Làm quen từng nốt',
      description: 'Mỗi buổi một nốt: giới thiệu có hình và tiếng đàn, câu đố chọn hình, luyện phím, rồi chơi trò tìm nốt.',
      availability: 'available',
      weeks: [{ weekId: 'sup-w1', number: 1, title: 'Các nốt trắng', description: 'Đô, Rê, Mi, Pha, Sol, La, Si.', lessonIds: SUPPLEMENT_LESSONS.map((l) => l.lessonId) }],
      lessons: SUPPLEMENT_LESSONS,
    },
  ],
};

/** Nốt chưa có bài (hiện "Sắp có" trong danh sách). */
export const SUPPLEMENT_UPCOMING: readonly { letter: Letter; name: string }[] = [
  { letter: 'D', name: 'Rê' },
  { letter: 'E', name: 'Mi' },
  { letter: 'F', name: 'Pha' },
  { letter: 'G', name: 'Sol' },
  { letter: 'A', name: 'La' },
  { letter: 'B', name: 'Si' },
];

/** Thẻ nốt của buổi (danh sách nốt). */
export const SUPPLEMENT_NOTE: Record<string, { letter: Letter; name: string }> = {
  'sup-c': { letter: 'C', name: 'Đô' },
};

/** Trò chơi cuối buổi — bé tự chọn; trò đều cấu hình sẵn nốt của buổi. Không tính vào điểm buổi. */
export type SupplementGame = { type: 'lesson'; spec: LessonGameSpec } | { type: 'balloon-hunt'; letters: Letter[] };

export const SUPPLEMENT_GAMES: Record<string, SupplementGame[]> = {
  'sup-c': [
    { type: 'balloon-hunt', letters: ['C'] },
    {
      type: 'lesson',
      spec: {
        kind: 'key-hunt',
        keyboard: KEYS,
        rounds: [
          { prompt: 'Tìm Đô giữa', target: { type: 'midi', midi: 60 } },
          { prompt: 'Tìm Đô thấp', target: { type: 'midi', midi: 48 } },
          { prompt: 'Tìm Đô cao', target: { type: 'midi', midi: 72 } },
          { prompt: 'Tìm một nốt Đô bất kỳ', target: { type: 'pitch-class', pc: 0 } },
        ],
      },
    },
    { type: 'lesson', spec: { kind: 'staff-shoot', keyboard: { from: 48, to: 71 }, clef: 'treble', notes: [60] } },
  ],
};

export const isSupplementLesson = (lessonId: string): boolean => lessonId.startsWith('sup-');
