/**
 * Giáo trình bổ sung "Làm quen từng nốt": mỗi buổi giới thiệu MỘT nốt theo cùng một khuôn
 *   Giới thiệu (hình + âm thanh mẫu) → Câu đố trường độ → Câu đố chọn hình → Luyện phím trên đàn → Chọn trò chơi tìm nốt.
 * Tách khỏi cấp 1–6 (không ảnh hưởng gợi ý mở khoá); tiến độ dùng chung kho theo hồ sơ (`curriculumStore`),
 * lessonId có tiền tố "sup-". CHỈ dữ liệu — trò chơi của từng buổi ở `SUPPLEMENT_GAMES` (cấu hình sẵn nốt của buổi).
 *
 * KHUÔN CHUNG: mọi buổi sinh từ `noteLesson(note)` + bảng `SUPPLEMENT_NOTES` (chỉ phần riêng của từng nốt: vị trí
 * trên bàn phím, trên khuông, ngón đánh). Sửa / thêm bước → sửa `noteLesson` để MỌI nốt cùng đổi, không sửa riêng một nốt,
 * rồi ghi vào nhật ký `docs/supplement.md`.
 *
 * "Khám phá nốt nhạc" (`discovery.ts`) dùng lại `SUPPLEMENT_NOTES` (một nguồn dữ kiện nốt cho cả hai giáo trình) và các hàm
 * dựng hình / câu đố export bên dưới — sửa ở đây thì cả hai giáo trình cùng đổi.
 */
import type { Letter } from '../../balloonPop/notes';
import type { GameSpec } from '../../games/gameForLesson';
import type { NoteValue, NoteValueEquation } from '../noteValues';
import type { ChoiceQuestion, Curriculum, CurriculumLesson, Illustration, IntroPage } from '../types';
import { buildLessons, rh } from './helpers';

/** Bàn phím của bài: C3–B5 (đủ ba quãng tám: nốt thấp, nốt giữa, nốt cao của mọi nốt trắng). */
const KEYS = { from: 48, to: 83 };
/** Bàn phím nhỏ trong thẻ hình đáp án: A3–B4, quanh các nốt giữa. */
export const MINI = { from: 57, to: 71 };
/** Bàn phím trang ngón tay: G3–E5 (đủ thế Đô và thế Sol tay phải). */
export const HAND_KEYS = { from: 55, to: 76 };

const LETTER_OF_PC: Record<number, Letter> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
export const isWhite = (m: number) => LETTER_OF_PC[m % 12] !== undefined;
/** MIDI → ký hiệu bài ("D4"). Chỉ phím trắng. */
export const pitchOf = (m: number) => `${LETTER_OF_PC[m % 12]}${Math.floor(m / 12) - 1}`;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const FINGER_NAME = ['', 'cái', 'trỏ', 'giữa', 'áp út', 'út'];
/** Thế tay phải 5 ngón: ngón → phím. */
export const HAND_POSITION = {
  C: { name: 'Đô', fingers: { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 } },
  G: { name: 'Sol', fingers: { 67: 1, 69: 2, 71: 3, 72: 4, 74: 5 } },
} as const;

/** Phần riêng của từng nốt — mọi thứ khác sinh chung trong `noteLesson`. */
export interface SupplementNote {
  letter: Letter;
  name: string;
  /** Nốt "giữa" của bài (quãng tám 4), nốt thấp / cao = ±12. */
  midi: number;
  /** Cách tìm trên bàn phím (theo nhóm phím đen). */
  landmark: { title: string; body: string; kids: string };
  /** Vị trí trên khuông khoá Sol. */
  staff: { body: string; kids: string };
  /** Ngón tay phải + thế tay; `body`/`kids` bỏ trống → câu chung. */
  finger: { n: number; position: keyof typeof HAND_POSITION; body?: string; kids?: string };
}

export const SUPPLEMENT_NOTES: readonly SupplementNote[] = [
  {
    letter: 'C',
    name: 'Đô',
    midi: 60,
    landmark: {
      title: 'Đô nằm bên trái 2 phím đen',
      body: 'Tìm một nhóm 2 phím đen: phím trắng ngay bên trái nhóm đó chính là nốt Đô.',
      kids: 'Bạn Đô luôn đứng bên trái hai anh em phím đen.',
    },
    staff: {
      body: 'Đô giữa (C4) viết ở dòng kẻ phụ ngay dưới khuông khoá Sol — như một quả bóng có gạch ngang qua.',
      kids: 'Trên khuông nhạc, Đô giữa có một gạch ngang qua bụng.',
    },
    finger: {
      n: 1,
      position: 'C',
      body: 'Ngón cái tay phải là ngón 1. Đặt ngón 1 lên Đô giữa — đây là "nhà" của bàn tay phải.',
      kids: 'Ngón cái là ngón số 1. Đặt ngón cái lên bạn Đô nào!',
    },
  },
  {
    letter: 'D',
    name: 'Rê',
    midi: 62,
    landmark: {
      title: 'Rê nằm giữa 2 phím đen',
      body: 'Tìm một nhóm 2 phím đen: phím trắng kẹp giữa hai phím đen đó chính là nốt Rê.',
      kids: 'Bạn Rê đứng giữa hai anh em phím đen, như được ôm vào lòng.',
    },
    staff: {
      body: 'Rê giữa (D4) nằm ngay dưới dòng kẻ thứ nhất của khuông khoá Sol — treo sát dưới khuông, không cần dòng kẻ phụ.',
      kids: 'Bạn Rê ngồi ngay dưới khuông nhạc, sát dòng kẻ dưới cùng.',
    },
    finger: { n: 2, position: 'C' },
  },
  {
    letter: 'E',
    name: 'Mi',
    midi: 64,
    landmark: {
      title: 'Mi nằm bên phải 2 phím đen',
      body: 'Tìm một nhóm 2 phím đen: phím trắng ngay bên phải nhóm đó chính là nốt Mi.',
      kids: 'Bạn Mi đứng ngay bên phải hai anh em phím đen.',
    },
    staff: {
      body: 'Mi giữa (E4) nằm trên dòng kẻ thứ nhất (dòng dưới cùng) của khuông khoá Sol — dòng kẻ chạy qua giữa nốt.',
      kids: 'Bạn Mi nằm trên dòng kẻ dưới cùng, dòng kẻ chạy qua bụng.',
    },
    finger: { n: 3, position: 'C' },
  },
  {
    letter: 'F',
    name: 'Pha',
    midi: 65,
    landmark: {
      title: 'Pha nằm bên trái 3 phím đen',
      body: 'Tìm một nhóm 3 phím đen: phím trắng ngay bên trái nhóm đó chính là nốt Pha.',
      kids: 'Bạn Pha đứng ngay bên trái ba chị em phím đen.',
    },
    staff: {
      body: 'Pha giữa (F4) nằm ở khe thứ nhất của khuông khoá Sol — giữa dòng kẻ 1 và dòng kẻ 2.',
      kids: 'Bạn Pha nằm trong khe dưới cùng, giữa hai dòng kẻ.',
    },
    finger: { n: 4, position: 'C' },
  },
  {
    letter: 'G',
    name: 'Sol',
    midi: 67,
    landmark: {
      title: 'Sol nằm giữa phím đen thứ nhất và thứ hai',
      body: 'Tìm một nhóm 3 phím đen: phím trắng giữa phím đen thứ nhất và thứ hai chính là nốt Sol.',
      kids: 'Bạn Sol đứng giữa chị cả và chị hai của ba chị em phím đen.',
    },
    staff: {
      body: 'Sol giữa (G4) nằm trên dòng kẻ thứ hai — chính dòng mà khoá Sol cuộn tròn quanh.',
      kids: 'Bạn Sol nằm trên dòng kẻ thứ hai, chỗ khoá Sol cuộn tròn.',
    },
    finger: { n: 5, position: 'C' },
  },
  {
    letter: 'A',
    name: 'La',
    midi: 69,
    landmark: {
      title: 'La nằm giữa phím đen thứ hai và thứ ba',
      body: 'Tìm một nhóm 3 phím đen: phím trắng giữa phím đen thứ hai và thứ ba chính là nốt La.',
      kids: 'Bạn La đứng giữa chị hai và chị út của ba chị em phím đen.',
    },
    staff: {
      body: 'La giữa (A4) nằm ở khe thứ hai của khuông khoá Sol — giữa dòng kẻ 2 và dòng kẻ 3.',
      kids: 'Bạn La nằm trong khe thứ hai, ngay trên bạn Sol.',
    },
    // Thế tay mới: nói rõ chuyển ngón cái, không thì La ngón 2 trùng Rê ngón 2 mà không có lời giải thích.
    finger: { n: 2, position: 'G', kids: 'Ngón cái chuyển sang bạn Sol. Ngón trỏ là ngón số 2, chạm bạn La nhé!' },
  },
  {
    letter: 'B',
    name: 'Si',
    midi: 71,
    landmark: {
      title: 'Si nằm bên phải 3 phím đen',
      body: 'Tìm một nhóm 3 phím đen: phím trắng ngay bên phải nhóm đó chính là nốt Si. Ngay sau Si là Đô.',
      kids: 'Bạn Si đứng ngay bên phải ba chị em phím đen, sát bên bạn Đô.',
    },
    staff: {
      body: 'Si giữa (B4) nằm trên dòng kẻ thứ ba — dòng chính giữa khuông khoá Sol; đuôi nốt quay xuống.',
      kids: 'Bạn Si nằm trên dòng kẻ chính giữa khuông nhạc.',
    },
    finger: { n: 3, position: 'G', kids: 'Ngón cái chuyển sang bạn Sol. Ngón giữa là ngón số 3, chạm bạn Si nhé!' },
  },
];

// ── Hình minh hoạ dùng chung ──

export const miniKey = (midi: number): Illustration => ({ type: 'keyboard', ...MINI, highlight: [midi], noLabels: true });
export const staffNote = (pitch: string): Illustration => ({ type: 'staff', piece: { ...rh(`${pitch}/w`), timeSignature: [4, 4] } });
export const finger = (n: number): Illustration => ({ type: 'hand', hand: 'right', highlight: n });
export const bar44 = (notation: string) => ({ ...rh(notation), timeSignature: [4, 4] as [number, 4] });

/** Phép so sánh "`a` nốt `x` = `b` nốt `y`". */
const equals = (a: number, x: NoteValue, b: number, y: NoteValue): NoteValueEquation => ({ left: { count: a, value: x }, right: { count: b, value: y } });

/** Tên trường độ (đáp án bài đố) + số nốt / ký hiệu trong một ô 4/4 (ô nhịp phải đủ phách) + phép so sánh với trường độ liền kề. */
const DURATIONS: { name: string; code: string; count: number; beats: string; equations: NoteValueEquation[]; body: string; kids: (n: string) => string }[] = [
  {
    name: 'Tròn',
    code: 'w',
    count: 1,
    beats: '4 phách',
    equations: [{ left: { count: 1, value: 'w' }, right: { beats: 4 } }, equals(1, 'w', 2, 'h')],
    body: 'Nốt tròn: đầu nốt rỗng, không có đuôi. Ngân dài 4 phách — đếm "1 – 2 – 3 – 4" rồi mới thả phím.',
    kids: (n) => `Đây là ${n} tròn! Bạn ấy bụng trắng, không có đuôi, ngân thật dài bốn phách.`,
  },
  {
    name: 'Trắng',
    code: 'h',
    count: 2,
    beats: '2 phách',
    equations: [equals(2, 'h', 1, 'w'), equals(1, 'h', 2, 'q')],
    body: 'Nốt trắng: đầu nốt rỗng, có đuôi. Ngân 2 phách — hai nốt trắng bằng một nốt tròn.',
    kids: (n) => `Đây là ${n} trắng! Rỗng ruột nhưng có đuôi, ngân hai phách.`,
  },
  {
    name: 'Đen',
    code: 'q',
    count: 4,
    beats: '1 phách',
    equations: [equals(2, 'q', 1, 'h'), equals(1, 'q', 2, '8')],
    body: 'Nốt đen: đầu nốt tô đen, có đuôi. Ngân 1 phách — bốn nốt đen bằng một nốt tròn.',
    kids: (n) => `Đây là ${n} đen! Bụng tô đen, có đuôi, mỗi bạn một phách.`,
  },
  {
    name: 'Móc đơn',
    code: '8',
    count: 8,
    beats: 'nửa phách',
    equations: [equals(2, '8', 1, 'q'), equals(1, '8', 2, '16')],
    body: 'Nốt móc đơn: như nốt đen nhưng thêm một móc (đứng cạnh nhau thì nối bằng một gạch). Mỗi nốt nửa phách — hai móc đơn bằng một nốt đen.',
    kids: (n) => `Đây là ${n} móc đơn! Có một cái móc, chạy nhanh: hai bạn mới bằng một ${n} đen.`,
  },
  {
    name: 'Móc đôi',
    code: '16',
    count: 16,
    beats: '¼ phách',
    equations: [equals(2, '16', 1, '8'), equals(4, '16', 1, 'q')],
    body: 'Nốt móc đôi: có hai móc (đứng cạnh nhau thì nối bằng hai gạch). Mỗi nốt một phần tư phách — bốn móc đôi bằng một nốt đen.',
    kids: (n) => `Đây là ${n} móc đôi! Có hai cái móc, chạy nhanh nhất: bốn bạn mới bằng một ${n} đen.`,
  },
];
const DURATION_NAMES = DURATIONS.map((d) => d.name);
/** Một ô nhịp toàn nốt `pitch` cùng trường độ thứ `i`. */
const durationBar = (pitch: string, i: number) => {
  const d = DURATIONS[i];
  return d.code === 'w' ? `${pitch}/w` : Array(d.count).fill(d.code === 'q' ? pitch : `${pitch}/${d.code}`).join(' ');
};

/** Khuông nốt ở năm trường độ (tên trường độ ghi dưới từng nốt). */
function durationsStaff(pitch: string): Extract<Illustration, { type: 'staff' }> {
  const p = pitch;
  return {
    type: 'staff',
    // Móc đơn / móc đôi đứng sát nhau → đặt sau một nốt dài (trắng) để chữ hai dòng bên dưới không chạm nhau.
    piece: bar44(`${p}/w | ${p}/h ${p}/h | ${p} ${p} ${p} ${p} | ${p}/h ${p}/8 ${p}/8 ${p}/8 ${p}/8 | ${p}/h ${p}/16 ${p}/16 ${p}/16 ${p}/16 ${p}`),
    listen: true,
    noteLabels: ['Tròn', 'Trắng', 'Trắng', ...Array(4).fill('Đen'), 'Trắng', ...Array(4).fill('Móc đơn'), 'Trắng', ...Array(4).fill('Móc đôi'), 'Đen'],
  };
}

/** Câu đố chọn hình; nhãn trung tính "Hình 1…" để không lộ đáp án. Đáp án đặt ở vị trí `pos` (xoay theo nốt). */
export function pictureQuestion(prompt: string, correct: Illustration, distractors: Illustration[], pos: number): ChoiceQuestion {
  const images = [...distractors];
  const answer = pos % (distractors.length + 1);
  images.splice(answer, 0, correct);
  return { prompt, options: images.map((_, i) => `Hình ${i + 1}`), optionImages: images, answer };
}

/** `k` phím trắng gần `m` nhất trong [from, to] (không tính `m`). */
export function nearestWhites(m: number, k: number, from: number, to: number): number[] {
  return range(from, to)
    .filter((x) => x !== m && isWhite(x))
    .sort((a, b) => Math.abs(a - m) - Math.abs(b - m) || b - a)
    .slice(0, k);
}

/** Phím trắng cách `m` đúng `steps` bậc (âm = đi xuống). */
export function whiteStep(m: number, steps: number): number {
  let x = m;
  for (let left = Math.abs(steps); left > 0; ) {
    x += Math.sign(steps);
    if (isWhite(x)) left--;
  }
  return x;
}

/** Phím đen của nhóm (2 hoặc 3 phím) chứa vị trí của nốt, trong quãng tám bắt đầu ở `base` (một nốt Đô). */
export function blackGroup(pc: number, base: number): number[] {
  return (pc <= 4 ? [1, 3] : [6, 8, 10]).map((o) => base + o);
}

// ── Khuôn bài ──

/** Sinh một buổi "làm quen nốt" từ phần riêng của nốt. Sửa ở đây → mọi nốt cùng đổi. */
function noteLesson(note: SupplementNote, index: number) {
  const { name, midi, letter } = note;
  const pc = midi % 12;
  const pitch = pitchOf(midi);
  const octaves = [midi - 12, midi, midi + 12];
  const groupSize = pc <= 4 ? 2 : 3;
  const hand = HAND_POSITION[note.finger.position];
  const n = note.finger.n;
  const fname = FINGER_NAME[n];
  const lowerName = (s: string) => s.toLowerCase();

  const pages: IntroPage[] = [
    {
      title: `Đây là nốt ${name}`,
      body: `Phía trên là nốt ${name} trên khuông nhạc với các trường độ khác nhau; phía dưới là các phím ${name} trên đàn. Bấm Nghe để nghe tiếng ${name}.`,
      kids: `Đây là bạn ${name}! Trên khuông nhạc bạn ấy dài, ngắn khác nhau. Dưới là phím ${name} trên đàn.`,
      illustration: { ...durationsStaff(pitch), caption: `Nốt ${name} trên khuông nhạc` },
      moreIllustrations: [{ type: 'keyboard', ...KEYS, highlight: octaves, listen: [midi], caption: `Phím ${name} trên đàn` }],
    },
    // Giới thiệu kỹ từng trường độ: một ô nhịp cùng trường độ, phóng to, số phách ở tiêu đề thẻ.
    ...DURATIONS.map(
      (d, i): IntroPage => ({
        title: `Đây là ${name} ${lowerName(d.name)}`,
        body: d.body,
        kids: d.kids(name),
        illustration: {
          type: 'staff',
          piece: bar44(durationBar(pitch, i)),
          listen: true,
          zoom: 2,
          hideNames: true,
          caption: `Nốt ${name} ${lowerName(d.name)} — mỗi nốt ${d.beats}`,
        },
        moreIllustrations: [{ type: 'note-values', caption: `Nốt ${lowerName(d.name)} dài bằng bao nhiêu?`, equations: d.equations }],
      }),
    ),
    {
      title: note.landmark.title,
      body: note.landmark.body,
      kids: note.landmark.kids,
      illustration: { type: 'keyboard', ...KEYS, highlight: [48, 60, 72].flatMap((base) => [base + pc, ...blackGroup(pc, base)]).sort((a, b) => a - b), listen: octaves },
    },
    {
      title: `${name} giữa trên khuông nhạc`,
      body: note.staff.body,
      kids: note.staff.kids,
      illustration: { type: 'staff', piece: bar44(`${pitch} ${pitch} ${pitch} ${pitch}`), listen: true },
    },
    {
      title: `Ngón ${n} tay phải đánh ${name}`,
      body: note.finger.body ?? `Đặt tay phải ở thế ${hand.name} (ngón 1 trên ${hand.name} giữa): ngón ${n} — ngón ${fname} — đánh ${name} giữa.`,
      kids: note.finger.kids ?? `Ngón ${fname} là ngón số ${n}. Ngón ${fname} chạm bạn ${name} nhé!`,
      illustration: { type: 'keyboard', ...HAND_KEYS, highlight: [midi], fingers: hand.fingers, listen: [midi] },
    },
    {
      title: `Nhiều nốt ${name}`,
      body: `${name} thấp (${letter}3), ${name} giữa (${letter}4), ${name} cao (${letter}5) — cứ 8 phím trắng lại gặp một nốt ${name}. Nghe: ${name} càng sang phải càng cao.`,
      kids: `Có ${name} thấp, ${name} giữa, ${name} cao. Nghe xem bạn nào cao nhất!`,
      illustration: { type: 'keyboard', ...KEYS, highlight: octaves, listen: octaves },
    },
    {
      title: `Nốt ${name} dài, ngắn khác nhau`,
      body: `Cùng là nốt ${name} nhưng hình nốt cho biết ngân dài bao lâu: nốt tròn 4 phách, nốt trắng 2 phách, nốt đen 1 phách, nốt móc đơn nửa phách, móc đôi một phần tư phách. Bấm Nghe mẫu để nghe.`,
      kids: `Bạn ${name} có nhiều chiếc áo: áo tròn ngân thật dài, áo móc đơn chạy thật nhanh!`,
      illustration: { ...durationsStaff(pitch), caption: `Các trường độ của nốt ${name}` },
    },
  ];

  /** Bài đố trường độ: mỗi trường độ hỏi 2 lần (10 câu), thứ tự câu xáo mỗi lần làm. */
  const durationQuestions: ChoiceQuestion[] = [0, 1].flatMap(() =>
    DURATIONS.map((_, answer) => ({
      prompt: `Các nốt ${name} này là nốt gì?`,
      illustration: { type: 'staff' as const, piece: bar44(durationBar(pitch, answer)), caption: 'Nhìn hình nốt', hideNames: true, zoom: 2 },
      options: DURATION_NAMES,
      answer,
    })),
  );

  const otherFingers = [1, 2, 3, 4, 5].filter((f) => f !== n);
  const pictureQuestions = [
    pictureQuestion(`Phím nào là ${name}?`, miniKey(midi), nearestWhites(midi, 2, MINI.from, MINI.to).map(miniKey), index + 1),
    pictureQuestion(`Phím đang sáng nào là nốt ${name}?`, miniKey(midi), nearestWhites(midi, 4, MINI.from, MINI.to).slice(1).map(miniKey), index + 2),
    pictureQuestion(`Đâu là nốt ${name} giữa trên khuông?`, staffNote(pitch), [whiteStep(midi, 2), whiteStep(midi, -2)].map((m) => staffNote(pitchOf(m))), index),
    pictureQuestion(`Khuông nào có nốt ${name} giữa?`, staffNote(pitch), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => staffNote(pitchOf(m))), index + 2),
    pictureQuestion(`Ngón nào đánh nốt ${name} giữa?`, finger(n), [otherFingers[0], otherFingers[2]].map(finger), index + 2),
    pictureQuestion(`Ngón ${fname} — hình nào?`, finger(n), [otherFingers[1], otherFingers[3]].map(finger), index),
  ];

  return {
    lessonId: `sup-${letter.toLowerCase()}`,
    weekId: 'sup-w1',
    number: index + 1,
    title: `Nốt ${name}`,
    description: `Làm quen nốt ${name}: tìm trên bàn phím, nhận ra trên khuông nhạc, biết ngón đánh và nghe tiếng của nó — rồi chơi trò tìm nốt ${name}.`,
    learningObjectives: [
      `Tìm nốt ${name} nhờ nhóm ${groupSize} phím đen`,
      `Nhận ra ${name} giữa trên khuông nhạc`,
      `Đánh ${name} giữa bằng ngón ${n} tay phải`,
      `Tìm nốt ${name} ở các quãng tám khác`,
    ],
    estimatedDuration: 10,
    ageVariants: { kids: { description: `Hôm nay mình làm quen bạn ${name}! ${note.landmark.kids}` } },
    activities: [{ kind: 'intro', id: 'intro', title: `Nốt ${name}`, pages }],
    exercises: [
      {
        kind: 'choice-quiz',
        id: 'duration-quiz',
        title: `Câu đố: nốt ${name} này là nốt gì?`,
        instructions: 'Nhìn hình nốt trên khuông rồi chọn tên trường độ. Sai thì chọn lại nhé.',
        retry: true,
        shuffle: true,
        questions: durationQuestions,
        pass: { minCorrect: 7 },
      },
      {
        kind: 'choice-quiz',
        id: 'picture-quiz',
        title: 'Câu đố: chọn hình đúng',
        instructions: 'Chạm vào hình đúng. Sai thì chọn lại nhé.',
        retry: true,
        questions: pictureQuestions,
        pass: { minCorrect: 5 },
      },
      {
        kind: 'key-quiz',
        id: 'keys',
        title: `Luyện phím: tìm nốt ${name}`,
        instructions: 'Đánh trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình. Sai thì thử lại.',
        keyboard: KEYS,
        retry: true,
        rounds: [
          { prompt: `Đánh ${name} giữa`, target: { type: 'midi', midi } },
          { prompt: `Đánh ${name} giữa lần nữa`, target: { type: 'midi', midi } },
          { prompt: `Đánh một nốt ${name} khác`, target: { type: 'pitch-class', pc, exclude: [midi] } },
          { prompt: `Đánh ${name} thấp`, target: { type: 'midi', midi: midi - 12 } },
          { prompt: `Đánh ${name} cao`, target: { type: 'midi', midi: midi + 12 } },
        ],
        pass: { minCorrect: 4 },
      },
    ],
    assessment: { passScore: 70, checkpoint: false },
  } satisfies Omit<CurriculumLesson, 'levelId' | 'contentVersion' | 'prerequisites' | 'unlockCriteria'>;
}

export const SUPPLEMENT_LESSONS: CurriculumLesson[] = buildLessons('sup-notes', SUPPLEMENT_NOTES.map(noteLesson));

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

/** Nốt chưa có bài (hiện "Sắp có" trong danh sách) — đã đủ 7 nốt trắng; để dành cho nốt đen sau này. */
export const SUPPLEMENT_UPCOMING: readonly { letter: Letter; name: string }[] = [];

const lessonIdOf = (note: SupplementNote) => `sup-${note.letter.toLowerCase()}`;

/** Thẻ nốt của buổi (danh sách nốt). */
export const SUPPLEMENT_NOTE: Record<string, { letter: Letter; name: string }> = Object.fromEntries(
  SUPPLEMENT_NOTES.map((note) => [lessonIdOf(note), { letter: note.letter, name: note.name }]),
);

/**
 * Trò chơi cuối buổi — bé tự chọn; trò đều cấu hình sẵn nốt của buổi. Không tính vào điểm buổi.
 * `lesson`: trò trong app (`GamePlayer`, kỷ lục ở bản ghi buổi); `balloon-hunt`: mở Bóng bay kiểu Tìm nốt.
 */
export type SupplementGame = { type: 'lesson'; spec: GameSpec } | { type: 'balloon-hunt'; letters: Letter[] };

function noteGames({ letter, name, midi }: SupplementNote): SupplementGame[] {
  return [
    { type: 'balloon-hunt', letters: [letter] },
    {
      type: 'lesson',
      spec: {
        kind: 'key-hunt',
        keyboard: KEYS,
        rounds: [
          { prompt: `Tìm ${name} giữa`, target: { type: 'midi', midi } },
          { prompt: `Tìm ${name} thấp`, target: { type: 'midi', midi: midi - 12 } },
          { prompt: `Tìm ${name} cao`, target: { type: 'midi', midi: midi + 12 } },
          { prompt: `Tìm một nốt ${name} bất kỳ`, target: { type: 'pitch-class', pc: midi % 12 } },
        ],
      },
    },
    { type: 'lesson', spec: { kind: 'staff-shoot', keyboard: { from: 48, to: 71 }, clef: 'treble', notes: [midi] } },
  ];
}

export const SUPPLEMENT_GAMES: Record<string, SupplementGame[]> = Object.fromEntries(SUPPLEMENT_NOTES.map((note) => [lessonIdOf(note), noteGames(note)]));

export const isSupplementLesson = (lessonId: string): boolean => lessonId.startsWith('sup-');
