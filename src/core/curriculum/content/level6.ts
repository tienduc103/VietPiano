/**
 * Cấp độ 6 — "Biểu diễn": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Nội dung: sắc thái mạnh – nhẹ (p, mp, mf, f; to dần / nhỏ dần), câu nhạc, hình thức A – B và A – B – A, nhịp độ
 * (Andante, Allegro), bài cổ điển / dân ca thuộc phạm vi công cộng (bản giản lược) và buổi hoà nhạc tốt nghiệp.
 * Dấu sắc thái (`Piece.dynamics`, theo ô nhịp) vẽ dưới khuông Sol; Biểu diễn có thêm tiêu chí "Mạnh – nhẹ":
 * so độ to TƯƠNG ĐỐI giữa hai đoạn liền kề (đàn MIDI: lực gõ; micro: độ to nghe được; bàn phím ảo: không đo).
 * Bài hai tay (`withLh`): app chỉ chấm giai điệu tay phải như cấp 5.
 * Giai điệu tự soạn, trừ các bài ghi rõ nguồn phạm vi công cộng (`pd`).
 */
import type { DynamicMark } from '../../music/dynamics';
import type { LessonSection } from '../../lessons/types';
import type { ChoiceQuestion, CurriculumLesson, Piece, Week } from '../types';
import { buildLessons, in34, inKey, lh, NO_FINGER_CHECK, ONLY_MELODY_SCORED, play, practice, rh, staffPage, withLh, type LessonDef } from './helpers';

const LEVEL = 'level-6';
const KIDS_SLOWER = { kids: { tempoPercent: 85 } };
const DYNAMICS_SCORED =
  'Mạnh – nhẹ: app so độ to của mỗi đoạn với đoạn liền trước (không đo độ to tuyệt đối). Đàn MIDI dùng lực gõ; micro dùng độ to nghe được — đặt iPad cố định, đừng xê dịch khi đang chơi. Bàn phím ảo không có lực gõ nên tiêu chí này "không đo".';
const NOTES = [DYNAMICS_SCORED, NO_FINGER_CHECK];
const NOTES_HANDS = [DYNAMICS_SCORED, ONLY_MELODY_SCORED, NO_FINGER_CHECK];

/** Gắn dấu sắc thái theo ô nhịp (+ chữ đánh dấu đoạn). */
const dyn = (piece: Piece, dynamics: Partial<Record<number, DynamicMark>>, sections?: LessonSection[]): Piece => ({ ...piece, dynamics, ...(sections ? { sections } : {}) });
/** Bản nhạc thuộc phạm vi công cộng (ghi nguồn). */
const pd = (piece: Piece, source: string): Piece => ({ ...piece, source });
const AB = (b: number): LessonSection[] => [
  { measure: 1, label: 'A' },
  { measure: b, label: 'B' },
];

const Q = {
  piano: { prompt: 'Ký hiệu "p" (piano) nghĩa là gì?', options: ['Nhẹ', 'Mạnh', 'Nhanh'], answer: 0 },
  forte: { prompt: 'Ký hiệu "f" (forte) nghĩa là gì?', options: ['Mạnh', 'Nhẹ', 'Chậm'], answer: 0 },
  howLoud: { prompt: 'Muốn đánh mạnh (f) mà tiếng vẫn đẹp, nên làm gì?', options: ['Thả sức nặng cánh tay xuống phím', 'Gồng cứng ngón tay rồi đập phím', 'Đánh thật nhanh'], answer: 0 },
  mezzo: { prompt: '"mf" (mezzo forte) nghĩa là gì?', options: ['Hơi mạnh', 'Rất nhẹ', 'Rất mạnh'], answer: 0 },
  order: { prompt: 'Sắp xếp từ nhẹ nhất đến mạnh nhất:', options: ['p – mp – mf – f', 'f – mf – mp – p', 'mf – p – f – mp'], answer: 0 },
  relative: { prompt: 'App chấm "Mạnh – nhẹ" bằng cách nào?', options: ['So độ to đoạn này với đoạn liền trước', 'Đo số decibel tuyệt đối', 'Đếm số nốt đúng'], answer: 0 },
  echo: { prompt: 'Chơi "tiếng vọng" là thế nào?', options: ['Câu nhạc mạnh, rồi nhắc lại thật nhẹ', 'Chơi hai lần thật mạnh', 'Chơi ngược từ cuối lên'], answer: 0 },
  phrase: { prompt: 'Câu nhạc là gì?', options: ['Một ý nhạc trọn vẹn, như một câu nói', 'Một nốt nhạc', 'Một dòng kẻ của khuông'], answer: 0 },
  breath: { prompt: 'Cuối mỗi câu nhạc nên làm gì?', options: ['Nhẹ tay lại, "thở" rồi vào câu sau', 'Đánh mạnh nhất', 'Dừng hẳn bài'], answer: 0 },
  formAB: { prompt: 'Bài có hình thức A – B nghĩa là gì?', options: ['Có hai đoạn nhạc khác nhau', 'Chỉ có một đoạn lặp mãi', 'Chơi bằng hai đàn'], answer: 0 },
  formABA: { prompt: 'Hình thức A – B – A: đoạn cuối là gì?', options: ['Đoạn A trở lại', 'Một đoạn mới hoàn toàn', 'Đoạn B chơi chậm'], answer: 0 },
  andante: { prompt: 'Andante nghĩa là gì?', options: ['Thong thả, như đi bộ', 'Rất nhanh', 'Dừng lại'], answer: 0 },
  allegro: { prompt: 'Allegro nghĩa là gì?', options: ['Nhanh, vui tươi', 'Rất chậm', 'Thật nhẹ'], answer: 0 },
  cresc: { prompt: '"cresc." (crescendo) nghĩa là gì?', options: ['To dần', 'Nhỏ dần', 'Giữ nguyên'], answer: 0 },
  dim: { prompt: '"dim." (diminuendo) nghĩa là gì?', options: ['Nhỏ dần', 'To dần', 'Nhanh dần'], answer: 0 },
  keepGoing: { prompt: 'Đang biểu diễn mà lỡ đánh sai một nốt thì nên…', options: ['Chơi tiếp, giữ đúng nhịp', 'Dừng lại, chơi lại từ đầu', 'Bỏ dở bài'], answer: 0 },
  shift: { prompt: 'Bài "Dưới ánh trăng": đoạn B xuống tới Sol3, tay phải làm gì?', options: ['Dời thế tay: ngón 1 đặt ở Sol3', 'Giữ nguyên thế Đô', 'Chuyển sang tay trái'], answer: 0 },
  bow: { prompt: 'Kết thúc buổi biểu diễn, người chơi thường làm gì?', options: ['Đứng dậy cúi chào', 'Chơi tiếp bài khác ngay', 'Tắt đàn rồi đi'], answer: 0 },
} satisfies Record<string, ChoiceQuestion>;

// Hợp âm tay trái thế gần (như cấp 5).
const C = 'C3+E3+G3';
const F = 'C3+F3+A3';
const G = 'B2+D3+G3';
const CF = `${C}/w:5+3+1`;
const FF = `${F}/w:5+2+1`;
const GF = `${G}/w:5+3+1`;

// ── Tuần 1 — Mạnh và nhẹ ──────────────────────────────────────────────
const LOUD_SOFT = dyn(rh('C4:1 D4:2 E4:3 F4:4 | G4/w:5 | G4:5 F4:4 E4:3 D4:2 | C4/w:1'), { 1: 'f', 3: 'p' });
/** "Tiếng vọng" — tự soạn: mỗi câu chơi mạnh rồi nhắc lại nhẹ (8 ô nhịp). */
const ECHO = dyn(
  rh('C4:1 E4:3 G4/h:5 | F4:4 D4:2 E4/h:3 | C4:1 E4:3 G4/h:5 | F4:4 D4:2 E4/h:3 | G4:5 F4:4 E4:3 D4:2 | C4:1 D4:2 E4/h:3 | G4:5 F4:4 E4:3 D4:2 | C4/w:1', 60, 'Tiếng vọng'),
  { 1: 'f', 3: 'p', 5: 'f', 7: 'p' },
);
const MEZZO = dyn(
  rh('E4:3 F4:4 G4/h:5 | E4:3 D4:2 C4/h:1 | D4:2 E4:3 F4:4 G4:5 | E4/w:3 | G4:5 F4:4 E4:3 D4:2 | E4:3 F4:4 G4/h:5 | F4:4 E4:3 D4:2 E4:3 | C4/w:1'),
  { 1: 'mp', 3: 'mf', 5: 'f', 7: 'p' },
);
/** "Sóng biển" — tự soạn: sóng lăn tăn (p), dâng lên (mf, f), rồi lặng (p); tay trái hợp âm (8 ô nhịp). */
const WAVES = dyn(
  withLh(
    'E4:3 G4:5 F4:4 D4:2 | E4/h:3 C4/h:1 | D4:2 F4:4 E4:3 G4:5 | F4/w:4 | G4:5 E4:3 F4:4 D4:2 | E4:3 G4:5 F4/h:4 | E4:3 D4:2 E4:3 D4:2 | C4/w:1',
    `${CF} | ${C}/w | ${GF} | ${FF} | ${C}/w | ${C}/h:5+3+1 ${F}/h:5+2+1 | ${G}/w | ${C}/w`,
    60,
    'Sóng biển',
  ),
  { 1: 'p', 3: 'mf', 5: 'f', 7: 'p' },
);
const TEST1 = dyn(
  withLh('G4:5 E4:3 C4:1 E4:3 | D4/h:2 G4/h:5 | F4:4 E4:3 D4:2 F4:4 | E4/w:3 | G4:5 F4:4 E4:3 D4:2 | E4/h:3 C4/h:1 | D4:2 E4:3 F4:4 D4:2 | C4/w:1', `${CF} | ${GF} | ${G}/w | ${C}/w | ${C}/w | ${C}/w | ${G}/w | ${C}/w`),
  { 1: 'f', 5: 'p' },
);

// ── Tuần 2 — Câu nhạc và hình thức ───────────────────────────────────
/** Câu hỏi (ô 1–4, dừng ở Rê) – câu trả lời (ô 5–8, về Đô) — tự soạn. */
const QUESTION_ANSWER = dyn(
  withLh(
    'C4:1 D4:2 E4:3 F4:4 | G4:5 E4:3 D4/h:2 | E4:3 F4:4 G4:5 E4:3 | D4/w:2 | C4:1 D4:2 E4:3 F4:4 | G4:5 E4:3 D4/h:2 | E4:3 D4:2 E4:3 D4:2 | C4/w:1',
    `${CF} | ${C}/h:5+3+1 ${G}/h:5+3+1 | ${C}/w | ${GF} | ${C}/w | ${C}/h ${G}/h | ${G}/w | ${C}/w`,
  ),
  { 1: 'mf', 5: 'p' },
);
const GI = 'G2+B2+D3';
const GIV = 'G2+C3+E3';
const GV = 'F#2+A2+D3';
/** "Ngày và đêm" — tự soạn, giọng Sol trưởng, hình thức A (mạnh) – B (nhẹ) (8 ô nhịp). */
const DAY_NIGHT = dyn(
  inKey(
    withLh(
      'G4:1 B4:3 D5/h:5 | C5:4 B4:3 A4/h:2 | G4:1 A4:2 B4:3 C5:4 | D5/w:5 | D5:5 C5:4 B4:3 A4:2 | B4/h:3 G4/h:1 | A4:2 C5:4 B4:3 A4:2 | G4/w:1',
      `${GI}/w:5+3+1 | ${GIV}/h:5+2+1 ${GV}/h:5+3+1 | ${GI}/w | ${GV}/w | ${GV}/w | ${GI}/w | ${GIV}/h ${GV}/h | ${GI}/w`,
      60,
      'Ngày và đêm',
    ),
    'G',
  ),
  { 1: 'f', 5: 'p' },
  AB(5),
);
const MARKET_A = 'C4:1 E4:3 D4:2 F4:4 | E4:3 G4:5 E4/h:3 | F4:4 E4:3 D4:2 E4:3 | C4/w:1';
const MARKET_A_LH = `${C}/w | ${C}/w | ${F}/h ${G}/h | ${C}/w`;
/** "Đi chợ phiên" — tự soạn, hình thức A – B – A (12 ô nhịp). */
const MARKET = dyn(
  withLh(
    `${MARKET_A} | G4/h:5 F4/h:4 | E4/h:3 D4/h:2 | E4:3 F4:4 G4:5 E4:3 | D4/w:2 | ${MARKET_A}`,
    `${CF} | ${C}/w | ${F}/h:5+2+1 ${G}/h:5+3+1 | ${C}/w | ${C}/h ${F}/h | ${C}/h ${G}/h | ${C}/h ${F}/h | ${G}/w | ${MARKET_A_LH}`,
    60,
    'Đi chợ phiên',
  ),
  { 1: 'mf', 5: 'p', 9: 'f' },
  [...AB(5), { measure: 9, label: 'A' }],
);
const AU_CLAIR_A = 'C4:1 C4 C4 D4:2 | E4/h:3 D4/h:2 | C4:1 E4:3 D4:2 D4 | C4/w:1';
const AU_CLAIR_A_LH = 'C3/w:1 | C3/h:1 G2/h:5 | G2/w:5 | C3/w:1';
/** "Au clair de la lune" (dân ca Pháp) — đoạn B dời thế tay xuống Sol3; tay trái nốt trầm (16 ô nhịp). */
const AU_CLAIR = pd(
  dyn(
    withLh(
      `${AU_CLAIR_A} | ${AU_CLAIR_A} | D4:5 D4 D4 D4 | A3/h:2 A3/h | D4:5 C4:4 B3:3 A3:2 | G3/w:1 | ${AU_CLAIR_A}`,
      `${AU_CLAIR_A_LH} | ${AU_CLAIR_A_LH} | G2/w:5 | D3/w:1 | D3/w:1 | G2/w:5 | ${AU_CLAIR_A_LH}`,
      66,
      'Dưới ánh trăng (Au clair de la lune)',
    ),
    { 1: 'mf', 5: 'p', 9: 'f', 13: 'p' },
    [
      { measure: 1, label: 'A' },
      { measure: 5, label: 'A' },
      { measure: 9, label: 'B' },
      { measure: 13, label: 'A' },
    ],
  ),
  'Dân ca Pháp thế kỷ 18 — phạm vi công cộng; phần đệm soạn cho giáo trình VietPiano',
);
const TEST2 = dyn(
  withLh('E4:3 G4:5 F4:4 D4:2 | C4/w:1 | D4:2 E4:3 F4:4 G4:5 | D4/w:2 | E4:3 G4:5 F4:4 D4:2 | C4/w:1', `${C}/h:5+3+1 ${G}/h:5+3+1 | ${CF} | ${GF} | ${G}/w | ${C}/h ${G}/h | ${C}/w`),
  { 1: 'f', 3: 'p', 5: 'f' },
  [
    { measure: 1, label: 'A' },
    { measure: 3, label: 'B' },
    { measure: 5, label: 'A' },
  ],
);

// ── Tuần 3 — Bài cổ điển và nhịp độ ──────────────────────────────────
/** "Khúc hoan ca" (Beethoven, Giao hưởng số 9) — giản lược: ô 4 và 8 dùng nốt trắng (8 ô nhịp). */
const ODE = (bpm: number) =>
  pd(
    dyn(
      withLh(
        'E4:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | E4/h:3 D4/h:2 | E4:3 E4 F4:4 G4:5 | G4 F4:4 E4:3 D4:2 | C4:1 C4 D4:2 E4:3 | D4/h:2 C4/h:1',
        `${CF} | ${GF} | ${C}/w | ${G}/w | ${C}/w | ${G}/w | ${C}/w | ${G}/h:5+3+1 ${C}/h:5+3+1`,
        bpm,
        'Khúc hoan ca',
      ),
      { 1: 'p', 5: 'f' },
    ),
    'L. v. Beethoven (1824) — phạm vi công cộng; bản giản lược + phần đệm soạn cho giáo trình VietPiano',
  );
/** "Kìa con bướm vàng" (giai điệu Frère Jacques) — mỗi câu chơi mạnh rồi nhắc lại nhẹ như tiếng vọng. */
const BUTTERFLY = pd(
  dyn(
    rh(
      'C4:1 D4:2 E4:3 C4:1 | C4:1 D4:2 E4:3 C4:1 | E4:3 F4:4 G4/h:5 | E4:3 F4:4 G4:5 R | G4/8:4 A4/8:5 G4/8:4 F4/8:3 E4:2 C4:1 | ' +
        'G4/8:4 A4/8:5 G4/8:4 F4/8:3 E4:2 C4:1 | C4:2 G3:1 C4/h:2 | C4:2 G3:1 C4/h:2',
      60,
      'Kìa con bướm vàng',
    ),
    { 1: 'f', 2: 'p', 3: 'f', 4: 'p', 5: 'f', 6: 'p', 7: 'f', 8: 'p' },
  ),
  'Dân ca Pháp (Frère Jacques) — phạm vi công cộng',
);
/** "Minuet Sol trưởng" (Petzold) — 8 ô nhịp đầu, tay trái giản lược; mạnh rồi nhẹ (kiểu "bậc thang" thời Baroque). */
const MINUET = pd(
  dyn(
    in34(
      inKey(
        withLh(
          'D5:5 G4/8:1 A4/8:2 B4/8:3 C5/8:4 | D5:5 G4:1 G4 | E5:5 C5/8:1 D5/8:2 E5/8:3 F#5/8:4 | G5:5 G4:1 G4 | ' +
            'C5:4 D5/8:5 C5/8:4 B4/8:3 A4/8:2 | B4:3 C5/8:4 B4/8:3 A4/8:2 G4/8:1 | F#4:2 G4/8:1 A4/8:2 B4/8:3 G4/8:1 | A4/hd:2',
          'G3+B3/h:5+3 A3:4 | B3/hd:3 | C4/hd:2 | B3/hd:3 | A3/hd:4 | G3/hd:5 | D4:1 B3:3 G3:5 | D3/hd:5',
          60,
          'Minuet Sol trưởng',
        ),
        'G',
      ),
    ),
    { 1: 'f', 5: 'p' },
  ),
  'Christian Petzold (khoảng 1725) — phạm vi công cộng; tay trái giản lược cho giáo trình VietPiano',
);
const STEPS_MEL = 'C4:1 E4:3 G4:5 E4:3 | F4:4 D4:2 E4/h:3 | D4:2 F4:4 E4:3 G4:5 | F4:4 E4:3 D4/h:2 | C4:1 E4:3 G4:5 E4:3 | F4:4 D4:2 E4/h:3 | D4:2 F4:4 E4:3 D4:2 | C4/w:1';
const STEPS_LH = `${CF} | ${G}/h:5+3+1 ${C}/h:5+3+1 | ${GF} | ${F}/h:5+2+1 ${G}/h:5+3+1 | ${C}/w | ${G}/h ${C}/h | ${G}/w | ${C}/w`;
/** "Bước chân" — tự soạn, chơi ở hai nhịp độ: Andante rồi Allegretto (8 ô nhịp). */
const STEPS = (bpm: number) => dyn(withLh(STEPS_MEL, STEPS_LH, bpm, 'Bước chân'), { 1: 'p', 5: 'f' });

// ── Tuần 4 — Buổi hoà nhạc ────────────────────────────────────────────
/** To dần: p → mp → mf → f, mỗi mức hai ô nhịp (tự soạn). */
const CRESC = dyn(
  rh('C4:1 D4:2 E4:3 D4:2 | C4/h:1 E4/h:3 | D4:2 E4:3 F4:4 E4:3 | D4/h:2 F4/h:4 | E4:3 F4:4 G4:5 F4:4 | E4/h:3 G4/h:5 | F4:4 G4:5 F4:4 E4:3 | G4/w:5', 60, 'To dần'),
  { 1: 'p', 3: 'mp', 5: 'mf', 7: 'f' },
);
/** Nhỏ dần: f → mf → mp → p (tự soạn). */
const DIM = dyn(
  rh('G4:5 F4:4 E4:3 F4:4 | G4/h:5 E4/h:3 | F4:4 E4:3 D4:2 E4:3 | F4/h:4 D4/h:2 | E4:3 D4:2 C4:1 D4:2 | E4/h:3 C4/h:1 | D4:2 E4:3 D4:2 C4:1 | C4/w:1', 60, 'Nhỏ dần'),
  { 1: 'f', 3: 'mf', 5: 'mp', 7: 'p' },
);
const cv = 'C3:5 E3+G3:3+1 E3+G3';
const fv = 'C3:5 F3+A3:2+1 F3+A3';
const gv = 'B2:5 D3+G3:3+1 D3+G3';
/** "Hoàng hôn" — tự soạn, valse 3/4, hình thức A – B (16 ô nhịp). */
const SUNSET = dyn(
  in34(
    withLh(
      'E4/h:3 F4:4 | G4/hd:5 | F4/h:4 E4:3 | D4/hd:2 | E4/h:3 D4:2 | C4/h:1 E4:3 | D4:2 E4:3 F4:4 | E4/hd:3 | ' +
        'G4/h:5 F4:4 | E4/h:3 F4:4 | G4:5 F4:4 E4:3 | D4/hd:2 | E4/h:3 F4:4 | D4/h:2 E4:3 | D4:2 E4:3 D4:2 | C4/hd:1',
      `${cv} | ${cv} | ${fv} | ${gv} | ${cv} | ${cv} | ${gv} | ${cv} | ${cv} | ${cv} | ${cv} | ${gv} | ${cv} | ${gv} | ${gv} | C3/hd:5`,
      60,
      'Hoàng hôn',
    ),
  ),
  { 1: 'p', 5: 'mf', 9: 'f', 13: 'p' },
  AB(9),
);
/** "Khúc tốt nghiệp" — tự soạn, hai tay, hình thức A – B, đủ bốn mức sắc thái (16 ô nhịp). */
const GRADUATION_6 = dyn(
  withLh(
    'E4:3 D4:2 C4:1 E4:3 | G4/h:5 E4/h:3 | F4:4 E4:3 D4:2 F4:4 | E4/w:3 | E4:3 F4:4 G4:5 E4:3 | F4:4 D4:2 E4/h:3 | D4:2 E4:3 F4:4 E4:3 | D4/w:2 | ' +
      'G4:5 F4:4 E4:3 F4:4 | G4/h:5 D4/h:2 | E4:3 F4:4 G4:5 F4:4 | E4/w:3 | E4:3 D4:2 C4:1 E4:3 | G4/h:5 E4/h:3 | D4:2 E4:3 F4:4 D4:2 | C4/w:1',
    `${CF} | ${C}/w | ${GF} | ${C}/w | ${C}/w | ${G}/h:5+3+1 ${C}/h:5+3+1 | ${G}/w | ${G}/w | ` +
      `${C}/w | ${C}/h ${G}/h | ${C}/w | ${C}/w | ${C}/w | ${C}/w | ${G}/w | ${C}/w`,
    60,
    'Khúc tốt nghiệp',
  ),
  { 1: 'mf', 5: 'p', 9: 'f', 13: 'mp' },
  AB(9),
);

const PERFORM_WEIGHT = { weight: 2 };

/** Buổi một bài: luyện Wait Mode (không chấm, chưa cần sắc thái) → biểu diễn có sắc thái. */
function rehearse(piece: Piece, perform = 'Biểu diễn có sắc thái') {
  return [practice(play('wait', 'Khởi động: chắc nốt (Wait Mode)', 'wait', piece)), play('perform', perform, 'performance', piece, PERFORM_WEIGHT)];
}

const defs: LessonDef[] = [
  // ── Tuần 1 — Mạnh và nhẹ ───────────────────────────────────────────
  {
    lessonId: 'l6-01-forte-piano',
    weekId: 'l6-w1',
    number: 1,
    title: 'Mạnh (f) và nhẹ (p)',
    description: 'Hai ký hiệu sắc thái đầu tiên: f (forte) mạnh, p (piano) nhẹ. Cùng một giai điệu nhưng "kể" khác hẳn.',
    learningObjectives: ['Đọc ký hiệu f và p dưới khuông', 'Đánh mạnh bằng sức nặng cánh tay, đánh nhẹ bằng đầu ngón', 'Đổi sắc thái đúng chỗ'],
    estimatedDuration: 15,
    prerequisites: ['l5-20-final'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Sắc thái',
        pages: [
          {
            title: 'Biểu diễn là kể chuyện',
            body: 'Đánh đúng nốt, đúng nhịp mới là một nửa. Nửa còn lại là sắc thái: chỗ nào mạnh, chỗ nào nhẹ. Ký hiệu "f" (forte) = mạnh, "p" (piano) = nhẹ, viết nghiêng dưới khuông nhạc.',
            kids: 'f là tiếng sư tử gầm, p là tiếng mèo con kêu!',
          },
          {
            title: 'App chấm mạnh – nhẹ thế nào?',
            body: 'Từ cấp này, Biểu diễn có thêm tiêu chí "Mạnh – nhẹ": app so đoạn f với đoạn p ngay trước hoặc sau nó — đoạn f phải to hơn rõ ràng. App không đo độ to tuyệt đối nên đặt iPad cố định một chỗ. Bàn phím ảo không có lực gõ: tiêu chí này "không đo".',
          },
          staffPage('Nghe mẫu', 'Hai ô đầu mạnh (f), hai ô sau nhẹ (p).', LOUD_SOFT),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: f và p', questions: [Q.piano, Q.forte, Q.howLoud], pass: { minAccuracy: 0.66 } },
      ...rehearse(LOUD_SOFT),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-02-echo',
    weekId: 'l6-w1',
    number: 2,
    title: 'Tiếng vọng',
    description: 'Mỗi câu nhạc chơi mạnh, rồi nhắc lại thật nhẹ như tiếng vọng trong núi. Bài "Tiếng vọng" (tự soạn).',
    learningObjectives: ['Đổi f → p ngay đầu ô nhịp', 'Giữ đúng nhịp khi đổi sắc thái', 'Nghe được sự khác nhau giữa hai lần chơi'],
    estimatedDuration: 15,
    prerequisites: ['l6-01-forte-piano'],
    notes: NOTES,
    activities: [{ kind: 'intro', id: 'intro', title: 'Tiếng vọng', pages: [staffPage('Nghe mẫu', 'Câu mạnh — tiếng vọng nhẹ — câu mạnh — tiếng vọng nhẹ.', ECHO, 'Hét to rồi thì thầm lại nhé!')] }],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: tiếng vọng', questions: [Q.echo], pass: { minAccuracy: 1 } }, ...rehearse(ECHO)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-03-mezzo',
    weekId: 'l6-w1',
    number: 3,
    title: 'Hơi nhẹ (mp), hơi mạnh (mf)',
    description: 'Giữa p và f còn mp (mezzo piano — hơi nhẹ) và mf (mezzo forte — hơi mạnh). Bốn mức: p < mp < mf < f.',
    learningObjectives: ['Biết bốn mức p, mp, mf, f', 'Đổi sắc thái từng bậc', 'Giữ tiếng đều trong một đoạn'],
    estimatedDuration: 15,
    prerequisites: ['l6-02-echo'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Bốn mức sắc thái',
        pages: [
          { title: 'p – mp – mf – f', body: '"mezzo" nghĩa là "vừa". mp hơi nhẹ, mf hơi mạnh — mf là mức "bình thường" hay gặp nhất.' },
          staffPage('Nghe mẫu', 'mp → mf → f → p: nghe tiếng to dần từng bậc rồi lặng xuống.', MEZZO),
        ],
      },
    ],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: bốn mức', questions: [Q.mezzo, Q.order], pass: { minAccuracy: 0.5 } }, ...rehearse(MEZZO)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-04-waves',
    weekId: 'l6-w1',
    number: 4,
    title: 'Bài nhạc: Sóng biển',
    description: 'Bài "Sóng biển" (tự soạn) hai tay: sóng lăn tăn (p), dâng lên (mf, f) rồi lặng (p).',
    learningObjectives: ['Sắc thái khi chơi hai tay', 'Tay trái theo sắc thái của tay phải', 'Biểu diễn trọn bài'],
    estimatedDuration: 20,
    prerequisites: ['l6-03-mezzo'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Sóng biển', pages: [staffPage('Nghe mẫu', 'Tay trái cũng mạnh nhẹ theo tay phải, nhưng luôn nhẹ hơn tay phải một chút.', WAVES)] }],
    exercises: rehearse(WAVES, 'Biểu diễn hai tay có sắc thái'),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-05-week1-test',
    weekId: 'l6-w1',
    number: 5,
    title: 'Kiểm tra tuần 1',
    description: 'Câu hỏi về sắc thái và biểu diễn hai tay có f, p. Cần 80/100 điểm.',
    learningObjectives: ['Ký hiệu p, mp, mf, f', 'Đổi sắc thái đúng chỗ', 'Biểu diễn đúng nốt, đúng nhịp, rõ mạnh nhẹ'],
    estimatedDuration: 15,
    prerequisites: ['l6-04-waves'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.piano, Q.forte, Q.order, Q.relative], pass: { minAccuracy: 0.75 } },
      play('wait', 'Phần 2: chắc nốt (Wait Mode)', 'wait', TEST1, { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn có sắc thái', 'performance', TEST1, PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Câu nhạc và hình thức ─────────────────────────────────
  {
    lessonId: 'l6-06-phrase',
    weekId: 'l6-w2',
    number: 6,
    title: 'Câu nhạc: hỏi và đáp',
    description: 'Giai điệu chia thành câu nhạc như câu nói. Câu "hỏi" dừng lơ lửng ở Rê, câu "đáp" về nhà ở Đô.',
    learningObjectives: ['Nhận ra câu nhạc 4 ô nhịp', 'Nhẹ tay ở cuối câu, "thở" trước câu sau', 'Chơi câu đáp nhẹ hơn câu hỏi'],
    estimatedDuration: 15,
    prerequisites: ['l6-05-week1-test'],
    notes: NOTES_HANDS,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Câu nhạc',
        pages: [
          { title: 'Hỏi – đáp', body: 'Ô 1–4 là câu hỏi (kết ở Rê, nghe chưa xong). Ô 5–8 là câu trả lời (kết ở Đô, nghe trọn vẹn). Cuối mỗi câu, nhẹ tay lại như hạ giọng cuối câu nói.' },
          staffPage('Nghe mẫu', 'Câu hỏi mf, câu đáp p.', QUESTION_ANSWER),
        ],
      },
    ],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: câu nhạc', questions: [Q.phrase, Q.breath], pass: { minAccuracy: 0.5 } }, ...rehearse(QUESTION_ANSWER)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-07-form-ab',
    weekId: 'l6-w2',
    number: 7,
    title: 'Hình thức A – B',
    description: 'Bài "Ngày và đêm" (tự soạn, Sol trưởng) có hai đoạn khác nhau: A rực rỡ (f), B dịu dàng (p). Chữ A, B ghi trong khung đầu đoạn.',
    learningObjectives: ['Đọc chữ đánh dấu đoạn A, B', 'Mỗi đoạn một "tính cách"', 'Hai tay giọng Sol trưởng'],
    estimatedDuration: 20,
    prerequisites: ['l6-06-phrase'],
    notes: NOTES_HANDS,
    activities: [{ kind: 'intro', id: 'intro', title: 'Đoạn A và B', pages: [staffPage('Nghe mẫu', 'Đoạn A ban ngày (f), đoạn B ban đêm (p).', DAY_NIGHT, 'Đoạn A mặt trời, đoạn B mặt trăng!')] }],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hình thức A – B', questions: [Q.formAB], pass: { minAccuracy: 1 } }, ...rehearse(DAY_NIGHT)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-08-form-aba',
    weekId: 'l6-w2',
    number: 8,
    title: 'Hình thức A – B – A',
    description: 'Bài "Đi chợ phiên" (tự soạn): A – B – A, đoạn A trở lại ở cuối và chơi mạnh hơn lần đầu.',
    learningObjectives: ['Nhận ra đoạn A trở lại', 'Đổi sắc thái theo từng đoạn', 'Chơi trọn 12 ô nhịp không dừng'],
    estimatedDuration: 20,
    prerequisites: ['l6-07-form-ab'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'A – B – A', pages: [staffPage('Nghe mẫu', 'A (mf) — B (p) — A (f).', MARKET)] }],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: A – B – A', questions: [Q.formABA], pass: { minAccuracy: 1 } }, ...rehearse(MARKET)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-09-au-clair',
    weekId: 'l6-w2',
    number: 9,
    title: 'Bài nhạc: Dưới ánh trăng',
    description: '"Au clair de la lune" (dân ca Pháp, phạm vi công cộng) 16 ô nhịp A – A – B – A; đoạn B dời thế tay xuống Sol3.',
    learningObjectives: ['Dời thế tay phải giữa bài', 'Sắc thái theo từng đoạn', 'Biểu diễn bài 16 ô nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l6-08-form-aba'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Dưới ánh trăng',
        pages: [
          staffPage(
            'Dưới Đô giữa trên khuông Sol',
            'Đi xuống từ Đô giữa (C4, một dòng kẻ phụ): Si (B3) treo ngay dưới dòng kẻ phụ đó, La (A3) nằm trên dòng kẻ phụ thứ hai, Sol (G3) treo dưới dòng kẻ phụ thứ hai.',
            rh('C4 B3 A3 G3 | A3 B3 C4/h'),
            'Đô đội một mũ, La đội hai mũ — Si và Sol treo ngay bên dưới mũ!',
          ),
          { title: 'Dời thế tay', body: 'Đoạn B (ô 9): ngón 5 ở Rê4, ngón 1 xuống Sol3. Hết đoạn B, đưa ngón 1 về Đô4 cho đoạn A cuối.', illustration: { type: 'keyboard', from: 53, to: 67, highlight: [55, 57, 59, 60, 62], fingers: { 55: 1, 57: 2, 59: 3, 60: 4, 62: 5 } } },
          staffPage('Nghe mẫu', 'A (mf) – A (p) – B (f) – A (p).', AU_CLAIR),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: dời thế tay', questions: [Q.shift], pass: { minAccuracy: 1 } },
      practice({
        kind: 'note-reading',
        id: 'read',
        title: 'Luyện đọc nốt dưới Đô giữa',
        clef: 'treble',
        answer: 'name',
        sequence: ['B3', 'A3', 'G3', 'C4', 'A3', 'G3', 'B3', 'D4'],
        choices: ['G3', 'A3', 'B3', 'C4', 'D4'],
        pass: {},
      }),
      ...rehearse(AU_CLAIR),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-10-week2-test',
    weekId: 'l6-w2',
    number: 10,
    title: 'Kiểm tra tuần 2',
    description: 'Câu hỏi về câu nhạc, hình thức và biểu diễn bài A – B – A ngắn. Cần 80/100 điểm.',
    learningObjectives: ['Câu nhạc, hình thức A – B, A – B – A', 'Sắc thái theo đoạn', 'Biểu diễn hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l6-09-au-clair'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.phrase, Q.breath, Q.formAB, Q.formABA], pass: { minAccuracy: 0.75 } },
      play('wait', 'Phần 2: chắc nốt (Wait Mode)', 'wait', TEST2, { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn có sắc thái', 'performance', TEST2, PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Bài cổ điển và nhịp độ ────────────────────────────────
  {
    lessonId: 'l6-11-ode-to-joy',
    weekId: 'l6-w3',
    number: 11,
    title: 'Bài nhạc: Khúc hoan ca',
    description: 'Chủ đề "Ode to Joy" (Beethoven, phạm vi công cộng) hai tay, bản giản lược: câu đầu p, câu sau f.',
    learningObjectives: ['Chơi bài cổ điển nổi tiếng hai tay', 'Nốt lặp lại đều tiếng', 'Đổi p → f ở câu thứ hai'],
    estimatedDuration: 20,
    prerequisites: ['l6-10-week2-test'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Khúc hoan ca', pages: [staffPage('Nghe mẫu', 'Ludwig van Beethoven viết giai điệu này năm 1824 cho Giao hưởng số 9.', ODE(66))] }],
    exercises: rehearse(ODE(66), 'Biểu diễn hai tay có sắc thái'),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-12-butterfly',
    weekId: 'l6-w3',
    number: 12,
    title: 'Bài nhạc: Kìa con bướm vàng',
    description: 'Giai điệu "Frère Jacques" (phạm vi công cộng): mỗi câu lặp hai lần — lần đầu mạnh, lần sau nhẹ như tiếng vọng. Ô 4 có dấu lặng để lấy hơi (và để micro nghe rõ tiếng Sol gõ lại).',
    learningObjectives: ['Đổi sắc thái mỗi ô nhịp', 'Móc đơn đều tay', 'Ngón 1 xuống Sol3 rồi về Đô4'],
    estimatedDuration: 20,
    prerequisites: ['l6-11-ode-to-joy'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Kìa con bướm vàng', pages: [staffPage('Nghe mẫu', 'Ô lẻ f, ô chẵn p.', BUTTERFLY, 'Con bướm bay gần (to), rồi bay xa (nhỏ)!')] }],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: tiếng vọng', questions: [Q.echo], pass: { minAccuracy: 1 } }, ...rehearse(BUTTERFLY)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-13-minuet',
    weekId: 'l6-w3',
    number: 13,
    title: 'Bài nhạc: Minuet Sol trưởng',
    description: 'Minuet của Christian Petzold (phạm vi công cộng), 8 ô nhịp đầu, nhịp 3/4 hai tay. Kiểu Baroque: câu đầu f, câu sau p.',
    learningObjectives: ['Móc đơn liền tiếng nhịp 3/4', 'Hai tay giọng Sol trưởng', 'Sắc thái "bậc thang" f – p'],
    estimatedDuration: 25,
    prerequisites: ['l6-12-butterfly'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Minuet',
        pages: [
          staffPage('Tay trái lên Rê4', 'Ô 7 tay trái có Rê4 (D4): trên khuông Fa, Đô giữa nằm trên một dòng kẻ phụ phía trên khuông, Rê4 nằm ngay trên dòng kẻ phụ đó.', lh('B3 C4 D4/h')),
          staffPage('Nghe mẫu', 'Minuet là điệu nhảy nhịp 3/4 thời Baroque. Tay trái giản lược một nốt mỗi ô.', MINUET),
        ],
      },
    ],
    exercises: [
      practice(play('rh', 'Khởi động: tay phải riêng', 'wait', { ...MINUET, accompaniment: undefined, clef: 'treble' })),
      ...rehearse(MINUET, 'Biểu diễn hai tay có sắc thái'),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-14-tempo',
    weekId: 'l6-w3',
    number: 14,
    title: 'Nhịp độ: Andante và Allegretto',
    description: 'Từ chỉ nhịp độ tiếng Ý: Andante (thong thả), Allegro (nhanh). Bài "Bước chân" (tự soạn) chơi ở hai nhịp độ.',
    learningObjectives: ['Biết Andante, Allegro', 'Giữ sắc thái khi chơi nhanh hơn', 'Không vội ở chỗ đổi hợp âm'],
    estimatedDuration: 20,
    prerequisites: ['l6-13-minuet'],
    notes: NOTES_HANDS,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Nhịp độ',
        pages: [
          { title: 'Từ tiếng Ý', body: 'Andante ≈ 60–76 phách/phút (đi bộ), Moderato vừa phải, Allegretto hơi nhanh, Allegro nhanh vui. Chơi nhanh hơn nhưng vẫn rõ p và f.' },
          staffPage('Nghe mẫu (Andante)', 'Lần đầu thong thả, lần sau nhanh hơn.', STEPS(60)),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: nhịp độ', questions: [Q.andante, Q.allegro], pass: { minAccuracy: 0.5 } },
      practice(play('wait', 'Khởi động: chắc nốt (Wait Mode)', 'wait', STEPS(60))),
      play('perform', 'Biểu diễn Andante (60)', 'performance', STEPS(60)),
      play('perform-fast', 'Biểu diễn Allegretto (80)', 'performance', STEPS(80), PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-15-week3-test',
    weekId: 'l6-w3',
    number: 15,
    title: 'Kiểm tra tuần 3',
    description: 'Câu hỏi về nhịp độ, sắc thái và biểu diễn "Khúc hoan ca" hai tay ở nhịp độ nhanh hơn. Cần 80/100 điểm.',
    learningObjectives: ['Andante, Allegro, sắc thái', 'Biểu diễn bài cổ điển hai tay', 'Giữ nhịp ở tốc độ mới'],
    estimatedDuration: 15,
    prerequisites: ['l6-14-tempo'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.andante, Q.allegro, Q.mezzo, Q.keepGoing], pass: { minAccuracy: 0.75 } },
      play('wait', 'Phần 2: chắc nốt (Wait Mode)', 'wait', ODE(76), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn (76 phách/phút)', 'performance', ODE(76), PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Buổi hoà nhạc ─────────────────────────────────────────
  {
    lessonId: 'l6-16-cresc-dim',
    weekId: 'l6-w4',
    number: 16,
    title: 'To dần, nhỏ dần',
    description: 'cresc. (crescendo) = to dần, dim. (diminuendo) = nhỏ dần. Tập bằng các bậc p → mp → mf → f và ngược lại.',
    learningObjectives: ['Biết cresc. và dim.', 'Tăng / giảm sắc thái từng bậc đều đặn', 'Không nhanh lên khi to dần'],
    estimatedDuration: 20,
    prerequisites: ['l6-15-week3-test'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'To dần – nhỏ dần',
        pages: [
          { title: 'Bậc thang sắc thái', body: 'Trên bản in, to dần vẽ bằng dấu "<" dài (hoặc chữ cresc.), nhỏ dần là ">" (dim.). Ở đây mỗi bậc hai ô nhịp để luyện cho rõ.', kids: 'Như đi lên cầu thang rồi đi xuống!' },
          staffPage('Nghe mẫu: to dần', 'p → mp → mf → f.', CRESC),
          staffPage('Nghe mẫu: nhỏ dần', 'f → mf → mp → p.', DIM),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: cresc. và dim.', questions: [Q.cresc, Q.dim], pass: { minAccuracy: 0.5 } },
      play('cresc', 'Biểu diễn: to dần', 'performance', CRESC),
      play('dim', 'Biểu diễn: nhỏ dần', 'performance', DIM),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-17-sunset',
    weekId: 'l6-w4',
    number: 17,
    title: 'Bài nhạc: Hoàng hôn',
    description: 'Bài "Hoàng hôn" (tự soạn) valse 3/4, 16 ô nhịp hình thức A – B, tay trái đệm valse, sắc thái p – mf – f – p.',
    learningObjectives: ['Biểu diễn bài 16 ô nhịp hai tay', 'Đệm valse nhẹ dưới giai điệu', 'Cao trào ở đầu đoạn B'],
    estimatedDuration: 25,
    prerequisites: ['l6-16-cresc-dim'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Hoàng hôn', pages: [staffPage('Nghe mẫu', 'Đoạn A mặt trời lặn dần, đoạn B rực lên rồi tắt.', SUNSET)] }],
    exercises: rehearse(SUNSET, 'Biểu diễn hai tay có sắc thái'),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-18-program',
    weekId: 'l6-w4',
    number: 18,
    title: 'Chuẩn bị chương trình',
    description: 'Ôn hai bài cho buổi hoà nhạc: "Dưới ánh trăng" và "Khúc hoan ca". Lỡ sai thì chơi tiếp, giữ nhịp.',
    learningObjectives: ['Chơi liền hai bài', 'Sai vẫn chơi tiếp, không dừng', 'Giữ sắc thái suốt bài'],
    estimatedDuration: 25,
    prerequisites: ['l6-17-sunset'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Chương trình biểu diễn',
        pages: [{ title: 'Không dừng giữa bài', body: 'Người nghe ít khi nhận ra một nốt sai, nhưng luôn nhận ra khi bạn dừng lại. Sai thì cứ đi tiếp theo nhịp — đó là kỹ năng quan trọng nhất khi biểu diễn.', kids: 'Lỡ sai cũng cứ chơi tiếp như không có gì nhé!' }],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: khi biểu diễn', questions: [Q.keepGoing], pass: { minAccuracy: 1 } },
      play('perform-au-clair', 'Bài 1: Dưới ánh trăng', 'performance', AU_CLAIR, PERFORM_WEIGHT),
      play('perform-ode', 'Bài 2: Khúc hoan ca', 'performance', ODE(66), PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-19-rehearsal',
    weekId: 'l6-w4',
    number: 19,
    title: 'Tổng duyệt',
    description: 'Tổng duyệt hai bài khó nhất: "Minuet Sol trưởng" và "Hoàng hôn" — như đang ở trên sân khấu.',
    learningObjectives: ['Biểu diễn liền hai bài nhịp 3/4', 'Tập trung từ đầu đến cuối', 'Sắc thái rõ ràng'],
    estimatedDuration: 25,
    prerequisites: ['l6-18-program'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      play('perform-minuet', 'Bài 1: Minuet Sol trưởng', 'performance', MINUET, PERFORM_WEIGHT),
      play('perform-sunset', 'Bài 2: Hoàng hôn', 'performance', SUNSET, PERFORM_WEIGHT),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l6-20-final',
    weekId: 'l6-w4',
    number: 20,
    title: 'Buổi hoà nhạc tốt nghiệp',
    description: 'Kiểm tra cuối giáo trình: lý thuyết biểu diễn và "Khúc tốt nghiệp" (tự soạn) 16 ô nhịp hai tay, đủ bốn mức sắc thái. Cần 80/100 điểm.',
    learningObjectives: ['Tổng hợp sắc thái, câu nhạc, hình thức', 'Biểu diễn bài 16 ô nhịp hai tay', 'Hoàn thành giáo trình VietPiano'],
    estimatedDuration: 25,
    prerequisites: ['l6-19-rehearsal'],
    notes: NOTES_HANDS,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Khúc tốt nghiệp', pages: [staffPage('Nghe mẫu', 'A: mf – p; B: f – mp. Hít thở, ngồi ngay ngắn rồi bắt đầu.', GRADUATION_6)] }],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.order, Q.formABA, Q.cresc, Q.keepGoing, Q.bow], pass: { minAccuracy: 0.8 } },
      play('wait', 'Phần 2: chắc nốt (Wait Mode)', 'wait', GRADUATION_6, { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn tốt nghiệp', 'performance', GRADUATION_6, { weight: 3 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL6_WEEKS: Week[] = [
  {
    weekId: 'l6-w1',
    number: 1,
    title: 'Tuần 1 — Mạnh và nhẹ',
    description: 'Sắc thái f, p, mp, mf; tiếng vọng; bài "Sóng biển".',
    lessonIds: ['l6-01-forte-piano', 'l6-02-echo', 'l6-03-mezzo', 'l6-04-waves', 'l6-05-week1-test'],
    extraPractice: [{ lessonId: 'song-twinkle', tip: 'Chơi hai câu đầu mf, câu giữa p, câu cuối mf.' }],
  },
  {
    weekId: 'l6-w2',
    number: 2,
    title: 'Tuần 2 — Câu nhạc và hình thức',
    description: 'Câu hỏi – câu đáp, hình thức A – B và A – B – A; bài "Dưới ánh trăng".',
    lessonIds: ['l6-06-phrase', 'l6-07-form-ab', 'l6-08-form-aba', 'l6-09-au-clair', 'l6-10-week2-test'],
    extraPractice: [{ lessonId: 'song-au-clair', tip: 'Bản tay phải trong Thư viện: tự đặt sắc thái cho từng đoạn A – A – B – A.' }],
  },
  {
    weekId: 'l6-w3',
    number: 3,
    title: 'Tuần 3 — Bài cổ điển và nhịp độ',
    description: '"Khúc hoan ca", "Kìa con bướm vàng", "Minuet Sol trưởng"; Andante và Allegretto.',
    lessonIds: ['l6-11-ode-to-joy', 'l6-12-butterfly', 'l6-13-minuet', 'l6-14-tempo', 'l6-15-week3-test'],
    extraPractice: [{ lessonId: 'song-minuet-g', tip: 'Thử sức cả 16 ô nhịp tay phải của Minuet.' }],
  },
  {
    weekId: 'l6-w4',
    number: 4,
    title: 'Tuần 4 — Buổi hoà nhạc',
    description: 'To dần, nhỏ dần; bài "Hoàng hôn"; chuẩn bị chương trình, tổng duyệt và buổi hoà nhạc tốt nghiệp.',
    lessonIds: ['l6-16-cresc-dim', 'l6-17-sunset', 'l6-18-program', 'l6-19-rehearsal', 'l6-20-final'],
    extraPractice: [{ lessonId: 'bh-ode-to-joy', tip: 'Ôn "Ode to Joy" hai tay chơi lần lượt trong Thư viện.' }],
  },
];

export const LEVEL6_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
