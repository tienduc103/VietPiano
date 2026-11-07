/**
 * "Khám phá nốt nhạc" — lộ trình TÍCH LUỸ cho bé 4–8 tuổi, cùng PHƯƠNG PHÁP với giáo trình bổ sung "Làm quen từng nốt":
 *   Giới thiệu (hình + tiếng đàn mẫu) → Câu đố chọn hình (sai chọn lại) → Luyện phím trên đàn (sai thử lại) → bé tự chọn trò.
 * Khác "Làm quen từng nốt": mỗi buổi MỘT nốt mới rồi TRỘN với các nốt đã học (phân biệt nốt cạnh nhau + ôn cách quãng),
 * và không dạy trường độ (đã có ở "Làm quen từng nốt" và cấp 1) — buổi ngắn, chỉ tập trung cao độ / vị trí.
 *
 *   1 Khám phá bàn phím → 2–8 Đô … Si (khuôn `noteLesson`) → 9 Đọc khuông Đô giữa → Đô cao → 10 Giai điệu (Wait Mode) → 11 Ôn tập.
 *
 * Dữ kiện từng nốt (cách tìm trên bàn phím, vị trí trên khuông, ngón + thế tay) lấy từ `SUPPLEMENT_NOTES` — MỘT nguồn cho
 * cả hai giáo trình. Sửa / thêm bước của buổi nốt → sửa khuôn `noteLesson` (mọi nốt cùng đổi), không sửa riêng một nốt,
 * rồi ghi nhật ký `docs/note-discovery.md`.
 * CHỈ dữ liệu: chạy bằng LessonPlayer; tiến độ chung kho `curriculumStore` (lessonId tiền tố "nd-"); tiên quyết chỉ là gợi ý.
 */
import { keyboardFor } from '../../games/gameForLesson';
import type { ChoiceQuestion, Curriculum, CurriculumLesson, Illustration, IntroPage, KeyQuizRound, Piece } from '../types';
import { buildLessons, KEYS, NO_FINGER_CHECK, play, practice, rh, type LessonDef } from './helpers';
import {
  bar44,
  finger,
  FINGER_NAME,
  HAND_KEYS,
  HAND_POSITION,
  MINI,
  miniKey,
  nearestWhites,
  pictureQuestion,
  pitchOf,
  staffNote,
  SUPPLEMENT_NOTES,
  whiteStep,
  blackGroup,
  type SupplementGame,
  type SupplementNote,
} from './supplement';

export const DISCOVERY_PREFIX = 'nd-';
export const isDiscoveryLesson = (lessonId: string): boolean => lessonId.startsWith(DISCOVERY_PREFIX);

/** Phím trắng Đô giữa (C4) → Đô cao (C5): tầm đọc khuông của lộ trình. */
export const DISCOVERY_RANGE = [60, 62, 64, 65, 67, 69, 71, 72];
/** Nhóm 2 / nhóm 3 phím đen nằm trọn trong bàn phím nhỏ `MINI` (A3–B4) — nhóm bị cắt ở mép thì bé không đếm được. */
const GROUP_2 = [61, 63];
const GROUP_3 = [66, 68, 70];
/** Bàn phím nhỏ cho câu đố có cả Đô cao (B3–D5). */
const WIDE_MINI = { from: 59, to: 74 };

const NOTE_OF_PC = new Map(SUPPLEMENT_NOTES.map((n) => [n.midi % 12, n]));
const REGISTER: Record<number, string> = { 3: 'thấp', 4: 'giữa', 5: 'cao' };

/** Tên gọi trong bài: "Đô giữa", "Mi thấp", "Đô cao" (quãng 4 = giữa). Chỉ phím trắng C3–B5. */
export function noteName(midi: number): string {
  const note = NOTE_OF_PC.get(midi % 12);
  const register = REGISTER[Math.floor(midi / 12) - 1];
  if (!note || !register) throw new Error(`Không có tên cho MIDI ${midi}`);
  return `${note.name} ${register}`;
}

/** Trong tầm Đô giữa → Đô cao chỉ Đô có hai nốt: nốt khác gọi tên trơn ("Sol"), Đô thì "Đô giữa" / "Đô cao". */
const staffName = (midi: number) => (midi % 12 === 0 ? noteName(midi) : NOTE_OF_PC.get(midi % 12)!.name);

const miniKeys = (highlight: number[], range = MINI): Illustration => ({ type: 'keyboard', ...range, highlight, noLabels: true });

/** Câu đố: nhìn một nốt trên khuông (không ghi tên) rồi chọn phím. */
const staffPrompt = (midi: number): Illustration => ({ type: 'staff', piece: bar44(`${pitchOf(midi)}/w`), hideNames: true, caption: 'Nhìn nốt trên khuông', zoom: 2 });

/**
 * Các nốt đi lên thành ô nhịp 4/4 đủ phách (khuông "bậc thang"): nốt đen, nốt cuối ngân cho đủ ô —
 * như một câu nhạc ngắn kết ở nốt dài.
 */
export function ladder(midis: readonly number[]): Piece {
  const bars: string[] = [];
  for (let i = 0; i < midis.length; i += 4) {
    const chunk = midis.slice(i, i + 4).map(pitchOf);
    if (chunk.length < 4) chunk[chunk.length - 1] += ['/w', '/hd', '/h'][chunk.length - 1];
    bars.push(chunk.join(' '));
  }
  return bar44(bars.join(' | '));
}

const R = {
  black: { prompt: 'Bấm một phím đen bất kỳ', target: { type: 'black' } },
  white: { prompt: 'Bấm một phím trắng bất kỳ', target: { type: 'white' } },
  group2: { prompt: 'Bấm một phím trong nhóm 2 phím đen', target: { type: 'black-group', size: 2 } },
  group3: { prompt: 'Bấm một phím trong nhóm 3 phím đen', target: { type: 'black-group', size: 3 } },
} satisfies Record<string, KeyQuizRound>;

/** Câu đố ôn nhóm phím đen (buổi bàn phím; buổi Đô — chưa có nốt nào để ôn). Đáp án nhiễu: cùng số phím nhưng là phím trắng. */
const groupQuestions = (pos: number): ChoiceQuestion[] => [
  pictureQuestion('Hình nào tô nhóm 2 phím đen?', miniKeys(GROUP_2), [miniKeys(GROUP_3), miniKeys([60, 62])], pos),
  pictureQuestion('Hình nào tô nhóm 3 phím đen?', miniKeys(GROUP_3), [miniKeys(GROUP_2), miniKeys([65, 67, 69])], pos + 1),
];

// ── Buổi 1: bàn phím ──

/** Cặp nốt của bài đố nghe: quãng rộng (dễ) → hẹp dần, xen kẽ đi lên / đi xuống. */
export const LISTEN_PAIRS: readonly (readonly [number, number])[] = [
  [48, 72],
  [76, 52],
  [67, 55],
  [60, 72],
  [64, 69],
  [72, 67],
];

function keyboardLesson(): LessonDef {
  const pages: IntroPage[] = [
    {
      title: 'Phím trắng và phím đen',
      // Không nói phím đen "cao hơn": buổi này dạy "cao hơn" là nói về TIẾNG đàn.
      body: 'Đàn piano có phím trắng và phím đen. Phím đen nhô lên, lùi vào trong và xếp thành từng nhóm nhỏ. Bấm Nghe: trắng, đen, trắng, đen…',
      kids: 'Đàn có phím trắng và phím đen. Phím đen đứng thành từng nhóm nhỏ!',
      illustration: { type: 'keyboard', ...KEYS, highlight: 'black', listen: [60, 61, 62, 63, 64] },
    },
    {
      title: 'Nhóm 2 phím đen',
      body: 'Có những nhóm 2 phím đen đứng sát nhau. Nhóm này lặp lại đều khắp bàn phím.',
      kids: 'Hai phím đen đứng cạnh nhau — như hai anh em sinh đôi.',
      illustration: { type: 'keyboard', ...KEYS, highlight: 'black-group-2', listen: GROUP_2 },
    },
    {
      title: 'Nhóm 3 phím đen',
      body: 'Xen giữa là các nhóm 3 phím đen. Cả bàn phím cứ thế lặp lại: nhóm 2 – nhóm 3 – nhóm 2 – nhóm 3…',
      kids: 'Ba phím đen là ba chị em. Cứ hai rồi ba, hai rồi ba!',
      illustration: { type: 'keyboard', ...KEYS, highlight: 'black-group-3', listen: GROUP_3 },
    },
    {
      title: 'Bên trái trầm, bên phải bổng',
      body: 'Phím càng về bên trái tiếng càng trầm (thấp), càng về bên phải tiếng càng bổng (cao). Bấm Nghe: trái → giữa → phải.',
      kids: 'Bên trái tiếng ồm ồm như chú gấu, bên phải líu lo như chú chim!',
      illustration: { type: 'keyboard', ...KEYS, highlight: [48, 65, 83], listen: [48, 65, 83] },
    },
    {
      title: 'Cao hơn hay thấp hơn?',
      body: 'Nghe hai tiếng đàn liền nhau rồi so sánh: tiếng thứ hai cao hơn (bổng hơn) hay thấp hơn (trầm hơn) tiếng thứ nhất? Lát nữa mình chơi đố nghe như vậy.',
      kids: 'Nghe hai tiếng đàn: tiếng sau cao hơn hay thấp hơn? Đoán thử nào!',
      illustration: { type: 'keyboard', ...KEYS, highlight: [55, 72], listen: [55, 72] },
    },
  ];

  return {
    lessonId: 'nd-keyboard',
    weekId: 'nd-w1',
    number: 1,
    title: 'Khám phá bàn phím',
    description: 'Phím trắng, phím đen, nhóm 2 và nhóm 3 phím đen — tấm bản đồ để tìm mọi nốt. Bên trái tiếng trầm, bên phải tiếng bổng.',
    learningObjectives: ['Phân biệt phím trắng và phím đen', 'Tìm nhóm 2 và nhóm 3 phím đen', 'Biết bên trái tiếng trầm (thấp), bên phải tiếng bổng (cao)'],
    estimatedDuration: 8,
    ageVariants: { kids: { description: 'Hôm nay mình đi khám phá cây đàn: phím trắng, phím đen, tiếng trầm và tiếng bổng!' } },
    activities: [{ kind: 'intro', id: 'intro', title: 'Bàn phím piano', pages }],
    exercises: [
      {
        kind: 'choice-quiz',
        id: 'picture-quiz',
        title: 'Câu đố: chọn hình đúng',
        instructions: 'Chạm vào hình đúng. Sai thì chọn lại nhé.',
        retry: true,
        questions: [
          pictureQuestion('Phím đang sáng nào là phím đen?', miniKeys([66]), [miniKeys([64]), miniKeys([69])], 1),
          pictureQuestion('Phím đang sáng nào là phím trắng?', miniKeys([65]), [miniKeys([63]), miniKeys([70])], 2),
          ...groupQuestions(0),
          pictureQuestion('Phím đen đang sáng nào nằm trong nhóm 2 phím đen?', miniKeys([61]), [miniKeys([66]), miniKeys([70])], 1),
          pictureQuestion('Phím đen đang sáng nào nằm trong nhóm 3 phím đen?', miniKeys([68]), [miniKeys([61]), miniKeys([63])], 0),
        ],
        pass: { minCorrect: 5 },
      },
      {
        kind: 'choice-quiz',
        id: 'listen-quiz',
        title: 'Đố nghe: cao hơn hay thấp hơn?',
        instructions: 'Bấm Nghe, nghe hai tiếng đàn rồi chọn. Sai thì chọn lại nhé.',
        retry: true,
        questions: LISTEN_PAIRS.map(([a, b]) => ({
          prompt: 'Tiếng thứ hai cao hơn hay thấp hơn tiếng thứ nhất?',
          // Không tô phím: nhìn vị trí phím là biết đáp án.
          illustration: { type: 'keyboard', ...KEYS, listen: [a, b], caption: 'Bấm Nghe: hai tiếng đàn' },
          options: ['Cao hơn', 'Thấp hơn'],
          answer: b > a ? 0 : 1,
        })),
        pass: { minCorrect: 5 },
      },
      {
        kind: 'key-quiz',
        id: 'keys',
        title: 'Luyện phím: phím đen, phím trắng, nhóm phím đen',
        instructions: 'Đánh trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình. Sai thì thử lại.',
        keyboard: KEYS,
        retry: true,
        rounds: [R.black, R.white, R.group2, R.group3, R.group2, R.group3],
        pass: { minCorrect: 5 },
      },
    ],
    assessment: { passScore: 70, checkpoint: false },
  };
}

// ── Buổi 2–8: mỗi buổi một nốt mới + ôn các nốt đã học ──

/**
 * Khuôn buổi nốt: `learned` = các nốt đã học ở buổi trước (thứ tự Đô → Si), nên nốt mới luôn là phím trắng ngay bên phải
 * nốt vừa học. Ôn cách quãng: mỗi nốt được hỏi lại ở cả 3 buổi kế tiếp — cách 1 buổi (câu đố phím + luyện phím), cách 2 buổi
 * (câu đố khuông), cách 3 buổi (luyện phím, bất kỳ quãng tám) — rồi tới các buổi đọc khuông, giai điệu, ôn tập.
 */
function noteLesson(note: SupplementNote, index: number): LessonDef {
  const learned = SUPPLEMENT_NOTES.slice(0, index);
  const { name, midi, letter } = note;
  const pc = midi % 12;
  const pitch = pitchOf(midi);
  const octaves = [midi - 12, midi, midi + 12];
  const groupSize = pc <= 4 ? 2 : 3;
  const hand = HAND_POSITION[note.finger.position];
  const n = note.finger.n;
  const fname = FINGER_NAME[n];
  /** Nốt vừa học (ngay bên trái nốt mới), nốt cách 2 buổi và cách 3 buổi (buổi đầu chưa đủ nốt thì lùi về nốt gần hơn). */
  const prev: SupplementNote | undefined = learned[learned.length - 1];
  const older: SupplementNote | undefined = learned[learned.length - 2] ?? prev;
  const distant: SupplementNote | undefined = learned[learned.length - 3] ?? older;
  const family = [...learned, note];
  const familyNames = family.map((x) => x.name).join(' – ');

  const pages: IntroPage[] = [
    {
      title: `Đây là nốt ${name}`,
      body: `Phía trên là nốt ${name} trên khuông nhạc, phía dưới là các phím ${name} trên đàn. Bấm Nghe để nghe tiếng ${name}.`,
      kids: `Đây là bạn ${name}! Trên khuông nhạc và trên phím đàn. Bấm Nghe nào!`,
      illustration: { type: 'staff', piece: bar44(`${pitch}/w`), listen: true, caption: `Nốt ${name} trên khuông nhạc` },
      moreIllustrations: [{ type: 'keyboard', ...KEYS, highlight: octaves, listen: [midi], caption: `Phím ${name} trên đàn` }],
    },
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
      // Phóng to: bé cần thấy rõ nốt nằm ở đâu so với dòng kẻ. Khung phóng to không còn chỗ ghi dưới nốt → tên ở chú thích.
      illustration: { type: 'staff', piece: bar44(`${pitch} ${pitch} ${pitch} ${pitch}`), listen: true, hideNames: true, zoom: 2, caption: `Nốt ${name} giữa` },
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
    // Nốt đầu tiên (Đô) chưa có nốt nào để so → không có trang này.
    ...(prev
      ? [
          {
            title: `${name} và các nốt đã học`,
            body: `Các nốt đã học xếp từ thấp lên cao: ${familyNames}. ${name} đứng ngay sau ${prev.name}: trên đàn sang phải một phím trắng, trên khuông lên một bậc.`,
            kids: `${familyNames}. Bạn ${name} đứng ngay sau bạn ${prev.name}!`,
            illustration: { type: 'staff', piece: ladder(family.map((x) => x.midi)), listen: true, caption: 'Từ thấp lên cao' },
            moreIllustrations: [{ type: 'keyboard', ...HAND_KEYS, highlight: family.map((x) => x.midi), listen: family.map((x) => x.midi), caption: 'Các phím đã học' }],
          } satisfies IntroPage,
        ]
      : []),
  ];

  const otherFingers = [1, 2, 3, 4, 5].filter((f) => f !== n);
  /** Nốt cạnh `older` để làm đáp án nhiễu, khác nốt mới (nốt mới đã là một đáp án nhiễu). */
  const olderNear = older && [whiteStep(older.midi, 1), whiteStep(older.midi, -1)].find((m) => m !== midi)!;
  const pictureQuestions: ChoiceQuestion[] = [
    pictureQuestion(`Phím nào là ${name}?`, miniKey(midi), nearestWhites(midi, 2, MINI.from, MINI.to).map(miniKey), index + 1),
    pictureQuestion(`Đâu là nốt ${name} giữa trên khuông?`, staffNote(pitch), [whiteStep(midi, 2), whiteStep(midi, -2)].map((m) => staffNote(pitchOf(m))), index),
    pictureQuestion(`Khuông nào có nốt ${name} giữa?`, staffNote(pitch), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => staffNote(pitchOf(m))), index + 2),
    pictureQuestion(`Ngón nào đánh nốt ${name} giữa?`, finger(n), [otherFingers[0], otherFingers[2]].map(finger), index + 2),
    // Ôn: phân biệt nốt cũ với nốt mới ngay cạnh nó.
    ...(prev && older && olderNear !== undefined
      ? [
          pictureQuestion(`Phím nào là ${prev.name}?`, miniKey(prev.midi), [midi, whiteStep(prev.midi, -1)].map(miniKey), index),
          pictureQuestion(`Khuông nào có nốt ${older.name} giữa?`, staffNote(pitchOf(older.midi)), [midi, olderNear].map((m) => staffNote(pitchOf(m))), index + 1),
        ]
      : groupQuestions(index)),
  ];

  const reviewA: KeyQuizRound = prev ? { prompt: `Đánh ${prev.name} giữa`, target: { type: 'midi', midi: prev.midi } } : R.group2;
  const reviewB: KeyQuizRound = distant ? { prompt: `Đánh một nốt ${distant.name} bất kỳ`, target: { type: 'pitch-class', pc: distant.midi % 12 } } : R.group3;

  return {
    lessonId: `${DISCOVERY_PREFIX}${letter.toLowerCase()}`,
    weekId: pc <= 4 ? 'nd-w1' : 'nd-w2',
    number: index + 2,
    title: `Nốt ${name}`,
    description: prev
      ? `Làm quen nốt ${name}: tìm trên bàn phím, nhận ra trên khuông nhạc, biết ngón đánh — rồi phân biệt với các nốt đã học (${learned.map((x) => x.name).join(', ')}).`
      : `Làm quen nốt ${name} — nốt đầu tiên: tìm nhờ nhóm 2 phím đen, nhận ra trên khuông nhạc, biết ngón đánh.`,
    learningObjectives: [
      `Tìm nốt ${name} nhờ nhóm ${groupSize} phím đen`,
      `Nhận ra ${name} giữa trên khuông nhạc`,
      `Đánh ${name} giữa bằng ngón ${n} tay phải`,
      `Tìm nốt ${name} ở các quãng tám khác`,
      ...(prev ? [`Phân biệt ${name} với ${learned.map((x) => x.name).join(', ')}`] : []),
    ],
    estimatedDuration: 8,
    ageVariants: { kids: { description: `Hôm nay mình làm quen bạn ${name}! ${note.landmark.kids}` } },
    activities: [{ kind: 'intro', id: 'intro', title: `Nốt ${name}`, pages }],
    exercises: [
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
        title: prev ? `Luyện phím: nốt ${name} và các nốt đã học` : `Luyện phím: tìm nốt ${name}`,
        instructions: 'Đánh trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình. Sai thì thử lại.',
        keyboard: KEYS,
        retry: true,
        // Nốt mới xen nốt cũ: mỗi lần quay lại nốt mới là một lần nhớ lại sau khi bị "chen ngang".
        rounds: [
          { prompt: `Đánh ${name} giữa`, target: { type: 'midi', midi } },
          reviewA,
          { prompt: `Đánh ${name} thấp`, target: { type: 'midi', midi: midi - 12 } },
          reviewB,
          { prompt: `Đánh ${name} cao`, target: { type: 'midi', midi: midi + 12 } },
          { prompt: `Đánh ${name} giữa lần nữa`, target: { type: 'midi', midi } },
        ],
        pass: { minCorrect: 5 },
      },
    ],
    assessment: { passScore: 70, checkpoint: false },
  };
}

function noteGames(note: SupplementNote, index: number): SupplementGame[] {
  const learned = SUPPLEMENT_NOTES.slice(0, index);
  const { name, midi } = note;
  const own: KeyQuizRound[] = [
    { prompt: `Tìm ${name} giữa`, target: { type: 'midi', midi } },
    { prompt: `Tìm ${name} thấp`, target: { type: 'midi', midi: midi - 12 } },
    { prompt: `Tìm ${name} cao`, target: { type: 'midi', midi: midi + 12 } },
    { prompt: `Tìm một nốt ${name} bất kỳ`, target: { type: 'pitch-class', pc: midi % 12 } },
  ];
  const review: KeyQuizRound[] = learned
    .slice(-3)
    .reverse()
    .map((x) => ({ prompt: `Tìm ${x.name} giữa`, target: { type: 'midi', midi: x.midi } }));
  // Xen kẽ: nốt mới, nốt cũ, nốt mới…
  const rounds = own.flatMap((r, i) => (review[i] ? [r, review[i]] : [r]));
  return [
    { type: 'balloon-hunt', letters: [note.letter] },
    { type: 'lesson', spec: { kind: 'key-hunt', keyboard: KEYS, rounds } },
    { type: 'lesson', spec: { kind: 'staff-shoot', keyboard: { from: 48, to: 71 }, clef: 'treble', notes: [...learned, note].map((x) => x.midi) } },
  ];
}

// ── Buổi 9: đọc khuông Đô giữa → Đô cao ──

function staffLesson(): LessonDef {
  const nameToStaff = (midi: number, pos: number) =>
    pictureQuestion(`Khuông nào có nốt ${staffName(midi)}?`, staffNote(pitchOf(midi)), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => staffNote(pitchOf(m))), pos);
  const staffToKey = (midi: number, pos: number): ChoiceQuestion => ({
    ...pictureQuestion('Nốt này là phím nào?', miniKeys([midi], WIDE_MINI), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => miniKeys([m], WIDE_MINI)), pos),
    illustration: staffPrompt(midi),
  });
  const pages: IntroPage[] = [
    {
      title: 'Khuông nhạc và khoá Sol',
      body: 'Khuông nhạc có 5 dòng kẻ, đếm từ dưới lên: dòng 1 tới dòng 5; giữa hai dòng là khe. Khoá Sol cuộn tròn quanh dòng 2 — nốt trên dòng 2 là Sol.',
      kids: 'Khuông nhạc có năm dòng kẻ. Khoá Sol ôm dòng thứ hai — nhà của bạn Sol!',
      illustration: { type: 'staff', piece: bar44('G4/w'), listen: true, hideNames: true, zoom: 2, caption: 'Nốt Sol trên dòng 2' },
    },
    {
      title: 'Nốt trên dòng',
      body: 'Đô giữa nằm trên dòng kẻ phụ dưới khuông; Mi, Sol, Si nằm trên dòng 1, 2, 3 — dòng kẻ chạy ngang qua giữa nốt.',
      kids: 'Đô, Mi, Sol, Si: dòng kẻ chạy ngang qua bụng!',
      illustration: { type: 'staff', piece: bar44('C4 E4 G4 B4'), listen: true, hideNames: true, zoom: 2, caption: 'Đô – Mi – Sol – Si' },
    },
    {
      title: 'Nốt trong khe',
      body: 'Rê treo sát dưới dòng 1; Pha, La, Đô cao nằm trong khe 1, 2, 3 — gọn giữa hai dòng kẻ.',
      kids: 'Bạn Rê treo sát dưới dòng kẻ. Pha, La, Đô cao nằm gọn trong khe, giữa hai dòng kẻ.',
      illustration: { type: 'staff', piece: bar44('D4 F4 A4 C5'), listen: true, hideNames: true, zoom: 2, caption: 'Rê – Pha – La – Đô cao' },
    },
    {
      title: 'Đô cao',
      body: 'Đô cao (C5) nằm ở khe 3. Từ Đô giữa đếm lên 8 phím trắng (tính cả hai đầu) lại gặp Đô — cao hơn đúng một quãng tám.',
      kids: 'Đô cao cùng tên với Đô giữa nhưng tiếng cao hơn!',
      illustration: { type: 'staff', piece: bar44('C4/h C5/h'), listen: true, caption: 'Đô giữa và Đô cao' },
      moreIllustrations: [{ type: 'keyboard', ...KEYS, highlight: [60, 72], listen: [60, 72], caption: 'Trên đàn' }],
    },
    {
      title: 'Bậc thang 8 nốt',
      body: 'Đi lên từng bậc: dòng → khe → dòng → khe… Trên đàn, mỗi bậc là một phím trắng sang phải.',
      kids: 'Leo thang nào: dòng, khe, dòng, khe — mỗi bậc một phím trắng!',
      illustration: { type: 'staff', piece: ladder(DISCOVERY_RANGE), listen: true, caption: 'Đô giữa → Đô cao' },
      moreIllustrations: [{ type: 'keyboard', ...HAND_KEYS, highlight: DISCOVERY_RANGE, listen: DISCOVERY_RANGE, caption: 'Trên đàn' }],
    },
  ];
  return {
    lessonId: 'nd-staff',
    weekId: 'nd-w3',
    number: 9,
    title: 'Đọc khuông: Đô giữa → Đô cao',
    description: 'Nốt nằm trên dòng, nốt nằm trong khe: đọc 8 nốt từ Đô giữa tới Đô cao trên khuông khoá Sol rồi đánh đúng phím.',
    learningObjectives: ['Biết nốt nằm trên dòng và nốt nằm trong khe', 'Đọc 8 nốt từ Đô giữa (C4) tới Đô cao (C5)', 'Nhìn nốt trên khuông, đánh đúng phím'],
    estimatedDuration: 10,
    ageVariants: { kids: { description: 'Hôm nay mình leo bậc thang trên khuông nhạc: từ Đô giữa lên Đô cao!' } },
    activities: [{ kind: 'intro', id: 'intro', title: 'Khuông nhạc', pages }],
    exercises: [
      {
        kind: 'choice-quiz',
        id: 'picture-quiz',
        title: 'Câu đố: chọn hình đúng',
        instructions: 'Chạm vào hình đúng. Sai thì chọn lại nhé.',
        retry: true,
        questions: [nameToStaff(67, 1), staffToKey(64, 2), nameToStaff(72, 0), staffToKey(69, 1), nameToStaff(62, 2), staffToKey(72, 0)],
        pass: { minCorrect: 5 },
      },
      {
        kind: 'note-reading',
        id: 'read-play',
        title: 'Nhìn nốt – đánh nốt',
        instructions: 'Nhìn nốt trên khuông rồi đánh nốt đó trên đàn.',
        clef: 'treble',
        answer: 'play',
        sequence: ['E4', 'C5', 'G4', 'D4', 'B4', 'F4', 'C4', 'A4'],
        pass: { minAccuracy: 0.75 },
      },
    ],
    assessment: { passScore: 70, checkpoint: false },
  };
}

// ── Buổi 10: giai điệu (Wait Mode) ──

const SOURCE_BUNS = 'Đồng dao Anh "Hot Cross Buns" (thế kỷ 18) — phạm vi công cộng';
const SOURCE_MARY = 'Lowell Mason (1830s) — phạm vi công cộng';
const FIVE = rh('C4:1 D4:2 E4:3 F4:4 | G4/w:5 | G4:5 F4:4 E4:3 D4:2 | C4/w:1', 60, 'Năm nốt thế Đô');
/** Như bài "Bánh nóng giòn" của Thư viện (sách cho bé: nhịp 2/4, chỉ Mi – Rê – Đô). */
const BUNS: Piece = { ...rh('E4:3 D4:2 | C4/h:1 | E4:3 D4:2 | C4/h:1 | C4:1 C4:1 | D4:2 D4:2 | E4:3 D4:2 | C4/h:1', 60, 'Bánh nóng giòn'), timeSignature: [2, 4], source: SOURCE_BUNS };
const MARY: Piece = {
  ...rh('E4:3 D4:2 C4:1 D4:2 | E4:3 E4:3 E4/h:3 | D4:2 D4:2 D4/h:2 | E4:3 G4:5 G4/h:5 | E4:3 D4:2 C4:1 D4:2 | E4:3 E4:3 E4:3 E4:3 | D4:2 D4:2 E4:3 D4:2 | C4/w:1', 60, 'Mary có một chú cừu'),
  source: SOURCE_MARY,
};
/** Thế Sol (ngón 1 trên Sol giữa): La ngón 2, Si ngón 3, Đô cao ngón 4 — như trang ngón tay của buổi La, Si. */
const HIGH_C = rh('G4:1 A4:2 B4:3 C5:4 | C5/h:4 B4/h:3 | A4:2 B4:3 A4:2 G4:1 | G4/w:1', 60, 'Leo lên Đô cao');

function melodyLesson(): LessonDef {
  const pages: IntroPage[] = [
    {
      title: 'Chơi theo khuông nhạc',
      body: 'Đọc nốt từ trái sang phải. App chờ bạn đánh đúng nốt đang sáng rồi mới sang nốt sau — không cần vội. Số ghi phía trên nốt là số ngón tay.',
      kids: 'Đọc nốt từ trái sang phải. Đánh đúng thì nốt sau mới sáng — không cần vội!',
      illustration: { type: 'staff', piece: FIVE, listen: true },
    },
    {
      title: 'Thế Đô và thế Sol',
      body: 'Ba bài đầu đặt tay phải ở thế Đô (ngón 1 trên Đô giữa). Bài cuối chuyển sang thế Sol (ngón 1 trên Sol giữa) để với tới La, Si, Đô cao.',
      kids: 'Bài đầu ngón cái ở bạn Đô, bài cuối ngón cái chuyển sang bạn Sol!',
      illustration: { type: 'keyboard', ...HAND_KEYS, highlight: [60], fingers: HAND_POSITION.C.fingers, listen: [60, 62, 64, 65, 67], caption: 'Thế Đô' },
      moreIllustrations: [{ type: 'keyboard', ...HAND_KEYS, highlight: [67], fingers: HAND_POSITION.G.fingers, listen: [67, 69, 71, 72, 74], caption: 'Thế Sol' }],
    },
    {
      title: 'Bánh nóng giòn',
      body: 'Bài hát chỉ có ba nốt Mi – Rê – Đô, ngón 3 – 2 – 1. Bấm Nghe mẫu trước khi chơi.',
      kids: 'Chỉ ba nốt Mi, Rê, Đô thôi! Nghe mẫu trước nhé.',
      illustration: { type: 'staff', piece: BUNS, listen: true },
    },
  ];
  return {
    lessonId: 'nd-melody',
    weekId: 'nd-w3',
    number: 10,
    title: 'Giai điệu đầu tiên',
    description: 'Đọc khuông và chơi giai điệu ngắn bằng các nốt đã học. App chờ bé đánh đúng từng nốt (Wait Mode), không tính nhịp.',
    learningObjectives: ['Đọc và chơi giai điệu ngắn theo khuông nhạc', 'Đánh đúng thứ tự nốt — app chờ đánh đúng mới sang nốt sau', 'Dùng đúng ngón ở thế Đô và thế Sol'],
    estimatedDuration: 12,
    ageVariants: { kids: { description: 'Hôm nay bé chơi những bài hát đầu tiên bằng các nốt đã học!' } },
    notes: [NO_FINGER_CHECK],
    activities: [{ kind: 'intro', id: 'intro', title: 'Giai điệu', pages }],
    exercises: [
      practice(play('warmup', 'Khởi động: năm nốt thế Đô', 'wait', FIVE)),
      play('buns', 'Bánh nóng giòn', 'wait', BUNS),
      play('mary', 'Mary có một chú cừu', 'wait', MARY),
      play('high-c', 'Thế Sol: lên Đô cao', 'wait', HIGH_C),
    ],
    assessment: { passScore: 70, checkpoint: false },
  };
}

// ── Buổi 11: ôn tập tổng hợp (không gợi ý) ──

/** Đủ cả 8 nốt: nốt ở vị trí chẵn hỏi phím, vị trí lẻ hỏi khuông (thứ tự câu xáo mỗi lần làm). */
const REVIEW_ORDER = [67, 72, 64, 69, 62, 65, 71, 60];
const REVIEW_KEYS = [67, 72, 52, 69, 74, 65, 59, 60];

function reviewLesson(): LessonDef {
  const pages: IntroPage[] = [
    {
      title: 'Bản đồ các nốt',
      body: 'Nhìn lại bản đồ: quanh nhóm 2 phím đen có Đô – Rê – Mi, quanh nhóm 3 phím đen có Pha – Sol – La – Si. Bài ôn trộn lẫn mọi nốt và không có gợi ý tên.',
      kids: 'Nhóm hai phím đen: Đô, Rê, Mi. Nhóm ba phím đen: Pha, Sol, La, Si!',
      illustration: { type: 'keyboard', ...KEYS, labels: true, highlight: DISCOVERY_RANGE.slice(0, 7), listen: DISCOVERY_RANGE.slice(0, 7) },
    },
    {
      title: 'Các nốt trên khuông',
      body: 'Trên khuông: Đô giữa ở dòng kẻ phụ, rồi cứ lên một bậc là nốt kế tiếp: Rê, Mi, Pha, Sol, La, Si, Đô cao.',
      kids: 'Dòng, khe, dòng, khe… Đô, Rê, Mi, Pha, Sol, La, Si, Đô!',
      illustration: { type: 'staff', piece: ladder(DISCOVERY_RANGE), listen: true },
    },
  ];
  const question = (midi: number, i: number): ChoiceQuestion =>
    i % 2 === 0
      ? pictureQuestion(`Phím nào là ${staffName(midi)}?`, miniKeys([midi], WIDE_MINI), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => miniKeys([m], WIDE_MINI)), i)
      : pictureQuestion(`Khuông nào có nốt ${staffName(midi)}?`, staffNote(pitchOf(midi)), [whiteStep(midi, 1), whiteStep(midi, -1)].map((m) => staffNote(pitchOf(m))), i);
  const keyRounds: KeyQuizRound[] = REVIEW_KEYS.map((midi) => ({ prompt: `Đánh ${noteName(midi)}`, target: { type: 'midi', midi } }));
  return {
    lessonId: 'nd-review',
    weekId: 'nd-w3',
    number: 11,
    title: 'Ôn tập tổng hợp',
    description: 'Trộn lẫn mọi nốt đã học trên bàn phím và trên khuông nhạc — không có gợi ý tên nốt. Đạt bài này là bé đã đọc được 8 nốt đầu tiên!',
    learningObjectives: ['Tìm mọi nốt Đô → Si ở các quãng tám', 'Đọc 8 nốt từ Đô giữa tới Đô cao không cần gợi ý', 'Phân biệt các nốt cạnh nhau'],
    estimatedDuration: 10,
    ageVariants: { kids: { description: 'Thử thách cuối: bé tự tìm mọi nốt đã học, không có gợi ý!' } },
    activities: [{ kind: 'intro', id: 'intro', title: 'Ôn tập', pages }],
    exercises: [
      {
        kind: 'choice-quiz',
        id: 'picture-quiz',
        title: 'Câu đố: chọn hình đúng',
        instructions: 'Chạm vào hình đúng. Sai thì chọn lại nhé.',
        retry: true,
        shuffle: true,
        questions: REVIEW_ORDER.map(question),
        pass: { minCorrect: 6 },
      },
      {
        kind: 'key-quiz',
        id: 'keys',
        title: 'Luyện phím: mọi nốt đã học',
        instructions: 'Đánh trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình. Sai thì thử lại.',
        keyboard: KEYS,
        retry: true,
        rounds: keyRounds,
        pass: { minCorrect: 6 },
      },
      {
        kind: 'note-reading',
        id: 'read-play',
        title: 'Nhìn nốt – đánh nốt',
        instructions: 'Nhìn nốt trên khuông rồi đánh nốt đó trên đàn.',
        clef: 'treble',
        answer: 'play',
        sequence: ['A4', 'D4', 'C5', 'F4', 'B4', 'E4', 'G4', 'C4'],
        pass: { minAccuracy: 0.75 },
      },
    ],
    assessment: { passScore: 70, checkpoint: true },
  };
}

// ── Giáo trình ──

const defs: LessonDef[] = [keyboardLesson(), ...SUPPLEMENT_NOTES.map(noteLesson), staffLesson(), melodyLesson(), reviewLesson()].map((d, i, all) => ({
  ...d,
  // Thứ tự gợi ý: buổi trước (không khoá cứng — xem `unlock.ts`).
  prerequisites: i > 0 ? [all[i - 1].lessonId] : [],
}));

export const DISCOVERY_LESSONS: CurriculumLesson[] = buildLessons('nd-notes', defs);

const idsOf = (weekId: string) => DISCOVERY_LESSONS.filter((l) => l.weekId === weekId).map((l) => l.lessonId);

export const DISCOVERY: Curriculum = {
  curriculumId: 'vietpiano-discovery',
  title: 'Khám phá nốt nhạc',
  contentVersion: 1,
  levels: [
    {
      levelId: 'nd-notes',
      number: 1,
      title: 'Khám phá nốt nhạc',
      description: 'Mỗi buổi một nốt mới, rồi chơi cùng các nốt đã học: xem hình, nghe tiếng, giải câu đố, tìm phím, chơi trò chơi.',
      availability: 'available',
      weeks: [
        { weekId: 'nd-w1', number: 1, title: 'Bàn phím và nhóm 2 phím đen', description: 'Phím trắng, phím đen, trầm – bổng; Đô, Rê, Mi.', lessonIds: idsOf('nd-w1') },
        { weekId: 'nd-w2', number: 2, title: 'Nhóm 3 phím đen', description: 'Pha, Sol, La, Si.', lessonIds: idsOf('nd-w2') },
        { weekId: 'nd-w3', number: 3, title: 'Khuông nhạc và giai điệu', description: 'Đọc khuông Đô giữa → Đô cao, chơi giai điệu, ôn tập.', lessonIds: idsOf('nd-w3') },
      ],
      lessons: DISCOVERY_LESSONS,
    },
  ],
};

/** Nốt (thẻ hình nốt) của các buổi nốt — màn danh sách buổi. */
export const DISCOVERY_NOTE: Record<string, { letter: SupplementNote['letter']; name: string; midi: number }> = Object.fromEntries(
  SUPPLEMENT_NOTES.map((n) => [`${DISCOVERY_PREFIX}${n.letter.toLowerCase()}`, { letter: n.letter, name: n.name, midi: n.midi }]),
);

const C4_G4 = [60, 62, 64, 65, 67];

/** Trò chơi cuối buổi — bé tự chọn, không tính điểm buổi. Trò của buổi nốt chỉ dùng nốt mới + nốt đã học. */
export const DISCOVERY_GAMES: Record<string, SupplementGame[]> = {
  'nd-keyboard': [
    { type: 'lesson', spec: { kind: 'key-hunt', keyboard: KEYS, rounds: [R.group2, R.group3, R.black, R.white, R.group2, R.group3] } },
    // Nghe nốt rồi tìm phím, app nhắc "cao hơn / thấp hơn" → luyện trái trầm, phải bổng.
    { type: 'lesson', spec: { kind: 'ear-finder', keyboard: keyboardFor(C4_G4), notes: C4_G4, reference: 60 } },
  ],
  ...Object.fromEntries(SUPPLEMENT_NOTES.map((n, i) => [`${DISCOVERY_PREFIX}${n.letter.toLowerCase()}`, noteGames(n, i)])),
  'nd-staff': [
    { type: 'lesson', spec: { kind: 'staff-shoot', keyboard: keyboardFor(DISCOVERY_RANGE), clef: 'treble', notes: DISCOVERY_RANGE } },
    { type: 'lesson', spec: { kind: 'note-sprint', keyboard: keyboardFor(DISCOVERY_RANGE), clef: 'treble', notes: DISCOVERY_RANGE } },
  ],
  'nd-melody': [
    { type: 'lesson', spec: { kind: 'echo-melody', keyboard: keyboardFor(C4_G4), notes: C4_G4 } },
    { type: 'lesson', spec: { kind: 'note-catch', keyboard: keyboardFor(DISCOVERY_RANGE), notes: DISCOVERY_RANGE } },
  ],
  'nd-review': [
    { type: 'lesson', spec: { kind: 'staff-shoot', keyboard: keyboardFor(DISCOVERY_RANGE), clef: 'treble', notes: DISCOVERY_RANGE } },
    { type: 'lesson', spec: { kind: 'note-sprint', keyboard: keyboardFor(DISCOVERY_RANGE), clef: 'treble', notes: DISCOVERY_RANGE } },
    { type: 'lesson', spec: { kind: 'key-hunt', keyboard: KEYS, rounds: REVIEW_KEYS.map((midi) => ({ prompt: `Tìm ${noteName(midi)}`, target: { type: 'midi', midi } })) } },
  ],
};
