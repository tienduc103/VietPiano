/**
 * Cấp độ 5 — "Hai tay cùng lúc": 4 tuần, 20 buổi. Chỉ là DỮ LIỆU (không có logic).
 * Nội dung: tay phải giai điệu + tay trái ĐÁNH CÙNG LÚC — nốt trầm giữ, quãng 5, hợp âm Đô / Fa / Sol (thế gần),
 * đệm nhịp (nốt đen, valse trầm – hợp âm – hợp âm, hợp âm rải), hai tay giọng Sol trưởng / Fa trưởng.
 * Micro chỉ nhận một nốt mỗi lúc → app CHỈ chấm giai điệu tay phải; phần đệm (`withLh`) vẽ trên khuông Fa, phát
 * cùng khi "Nghe mẫu", và nốt tay trái (thấp hơn giai điệu) bị bỏ qua — `validate.ts` kiểm tra điều kiện này.
 * Mọi giai điệu là bài tập tự soạn cho giáo trình VietPiano.
 * Hợp âm tay trái (thế gần quanh C3): Đô C3+E3+G3, Fa C3+F3+A3, Sol B2+D3+G3; Sol trưởng G2+B2+D3 / G2+C3+E3 / F♯2+A2+D3;
 * Fa trưởng F2+A2+C3 / F2+B♭2+D3 / E2+G2+C3.
 */
import type { ChoiceQuestion, CurriculumLesson, Week } from '../types';
import { buildLessons, in34, inKey, NO_FINGER_CHECK, ONLY_MELODY_SCORED, play, practice, rh, staffPage, withLh, type LessonDef } from './helpers';

const LEVEL = 'level-5';
const KIDS_SLOWER = { kids: { tempoPercent: 85 } };
const NOTES = [ONLY_MELODY_SCORED, NO_FINGER_CHECK];

const Q = {
  together: { prompt: 'Khi hai tay đánh cùng lúc, app chấm tay nào?', options: ['Giai điệu tay phải', 'Tay trái', 'Cả hai tay'], answer: 0 },
  bassSoft: { prompt: 'Tay trái đệm nên đánh thế nào?', options: ['Nhẹ hơn tay phải', 'Mạnh hơn tay phải', 'Thật nhanh'], answer: 0 },
  fifth: { prompt: 'Tay trái đánh Đô và Sol cùng lúc (quãng 5) bằng ngón nào?', options: ['Ngón 5 và ngón 1', 'Ngón 1 và ngón 2', 'Ngón 3 và ngón 4'], answer: 0 },
  cChord: { prompt: 'Hợp âm Đô trưởng gồm những nốt nào?', options: ['Đô – Mi – Sol', 'Đô – Rê – Mi', 'Đô – Fa – La'], answer: 0 },
  fChord: { prompt: 'Hợp âm Fa trưởng (thế gần Đô) tay trái bấm những nốt nào?', options: ['Đô – Fa – La', 'Đô – Mi – Sol', 'Si – Rê – Sol'], answer: 0 },
  gChord: { prompt: 'Hợp âm Sol trưởng (thế gần Đô) tay trái bấm những nốt nào?', options: ['Si – Rê – Sol', 'Đô – Mi – Sol', 'Đô – Fa – La'], answer: 0 },
  chordShift: { prompt: 'Đổi hợp âm Đô → Sol (thế gần): ngón nào đứng yên?', options: ['Ngón 1 trên Sol', 'Ngón 5 trên Đô', 'Không ngón nào'], answer: 0 },
  bassBeat: { prompt: 'Tay trái đánh nốt đen, tay phải giữ nốt trắng: hai tay đánh cùng lúc ở phách nào?', options: ['Phách 1 và phách 3', 'Mọi phách', 'Không bao giờ'], answer: 0 },
  waltzBass: { prompt: 'Đệm valse nhịp 3/4 tay trái thường là gì?', options: ['Trầm – hợp âm – hợp âm', 'Hợp âm – hợp âm – hợp âm – hợp âm', 'Chỉ một nốt tròn'], answer: 0 },
  broken: { prompt: 'Hợp âm rải là gì?', options: ['Đánh lần lượt từng nốt của hợp âm', 'Đánh cả hợp âm thật mạnh', 'Chỉ đánh nốt cao nhất'], answer: 0 },
  gTonic: { prompt: 'Giọng Sol trưởng: hợp âm chủ (bậc I) là hợp âm nào?', options: ['Sol – Si – Rê', 'Đô – Mi – Sol', 'Fa – La – Đô'], answer: 0 },
  fTonic: { prompt: 'Giọng Fa trưởng: hợp âm chủ (bậc I) là hợp âm nào?', options: ['Fa – La – Đô', 'Sol – Si – Rê', 'Đô – Mi – Sol'], answer: 0 },
} satisfies Record<string, ChoiceQuestion>;

// ── Tuần 1 — Nốt trầm tay trái ───────────────────────────────────────
const MEL1 = 'C4:1 D4:2 E4:3 F4:4 | G4/h:5 E4/h:3 | F4:4 E4:3 D4:2 E4:3 | C4/w:1';
const ACC1 = 'C3/w:5 | E3/w:3 | G3/w:1 | C3/w:5';
const MEL2 = 'E4:3 F4:4 G4/h:5 | F4:4 E4:3 D4/h:2 | E4:3 D4:2 C4:1 E4:3 | D4:2 E4:3 C4/h:1';
const ACC2 = 'C3/h:5 E3/h:3 | G3/h:1 F3/h:2 | E3/h:3 C3/h:5 | G3/h:1 C3/h:5';
const MEL3 = 'G4:5 E4:3 F4:4 D4:2 | E4/h:3 C4/h:1 | D4:2 E4:3 F4:4 D4:2 | C4/w:1';
const ACC3 = 'C3+G3/w:5+1 | C3+G3/w | D3+G3/w:4+1 | C3+G3/w:5+1';
/** "Ngày nắng" — tự soạn, tay phải thế Đô, tay trái nốt trầm và quãng 5 (8 ô nhịp). */
const SUNNY = 'C4:1 E4:3 G4/h:5 | F4:4 D4:2 E4/h:3 | D4:2 F4:4 E4:3 C4:1 | D4/w:2 | E4:3 G4:5 F4:4 D4:2 | E4/h:3 C4/h:1 | D4:2 E4:3 F4:4 D4:2 | C4/w:1';
const SUNNY_LH = 'C3+G3/w:5+1 | C3/h:5 G3/h:1 | C3+G3/w:5+1 | G2+D3/w:5+2 | C3+G3/w:5+1 | C3/h:5 G3/h:1 | G2+D3/w:5+2 | C3+G3/w:5+1';
const MEL5 = 'E4:3 D4:2 C4:1 E4:3 | G4/h:5 F4/h:4 | E4:3 F4:4 D4:2 E4:3 | C4/w:1';
const ACC5 = 'C3/w:5 | C3+G3/w:5+1 | G2+D3/w:5+2 | C3/w:5';

// ── Tuần 2 — Hợp âm đệm ───────────────────────────────────────────────
const C = 'C3+E3+G3';
const F = 'C3+F3+A3';
const G = 'B2+D3+G3';
const MEL6 = 'E4:3 G4:5 E4:3 C4:1 | D4:2 E4:3 C4/h:1 | G4:5 F4:4 E4:3 D4:2 | C4/w:1';
const ACC6 = `${C}/w:5+3+1 | ${C}/w | ${C}/w | ${C}/w`;
const MEL7 = 'E4:3 F4:4 G4/h:5 | F4:4 G4:5 F4/h:4 | E4:3 D4:2 E4:3 G4:5 | C4/w:1';
const ACC7 = `${C}/w:5+3+1 | ${F}/w:5+2+1 | ${C}/w:5+3+1 | ${C}/w`;
const MEL8 = 'C4:1 E4:3 D4:2 G4:5 | F4:4 E4:3 D4/h:2 | E4:3 F4:4 G4:5 E4:3 | D4:2 G4:5 C4/h:1';
const ACC8 = `${C}/w:5+3+1 | ${G}/w:5+3+1 | ${C}/w:5+3+1 | ${G}/h:5+3+1 ${C}/h:5+3+1`;
/** "Bài ca buổi sáng" — tự soạn, tay trái hợp âm Đô – Fa – Sol (8 ô nhịp). */
const MORNING_SONG =
  'C4:1 D4:2 E4:3 C4:1 | F4:4 E4:3 D4/h:2 | E4:3 F4:4 G4:5 E4:3 | F4:4 D4:2 G4/h:5 | ' +
  'F4:4 E4:3 D4:2 E4:3 | F4:4 G4:5 E4/h:3 | D4:2 E4:3 F4:4 D4:2 | C4/w:1';
const MORNING_SONG_LH = `${C}/w:5+3+1 | ${F}/h:5+2+1 ${C}/h:5+3+1 | ${C}/w:5+3+1 | ${F}/h:5+2+1 ${G}/h:5+3+1 | ${F}/w:5+2+1 | ${C}/w:5+3+1 | ${G}/w:5+3+1 | ${C}/w:5+3+1`;
const MEL10 = 'G4:5 E4:3 F4:4 D4:2 | E4/h:3 C4/h:1 | F4:4 E4:3 D4:2 F4:4 | E4:3 D4:2 C4/h:1';
const ACC10 = `${C}/w:5+3+1 | ${C}/h:5+3+1 ${F}/h:5+2+1 | ${F}/h:5+2+1 ${G}/h:5+3+1 | ${G}/h:5+3+1 ${C}/h:5+3+1`;

// ── Tuần 3 — Đệm nhịp ─────────────────────────────────────────────────
const MEL11 = 'E4/h:3 G4/h:5 | F4/h:4 D4/h:2 | E4/h:3 C4/h:1 | D4/h:2 C4/h:1';
const ACC11 = 'C3:5 G3:1 E3:3 G3:1 | D3:4 G3:1 F3:2 G3:1 | C3:5 G3:1 E3:3 G3:1 | D3:4 G3:1 C3/h:5';
const MEL12 = 'E4/hd:3 | G4/h:5 F4:4 | E4/hd:3 | D4/hd:2 | F4/hd:4 | E4/h:3 D4:2 | E4/h:3 D4:2 | C4/hd:1';
const ACC12 = 'C3:5 E3+G3:3+1 E3+G3 | C3 E3+G3 E3+G3 | C3 E3+G3 E3+G3 | B2:5 D3+G3:3+1 D3+G3 | C3:5 F3+A3:2+1 F3+A3 | C3:5 E3+G3:3+1 E3+G3 | B2:5 D3+G3:3+1 D3+G3 | C3/hd:5';
const MEL13 = 'G4/h:5 E4/h:3 | F4/h:4 D4/h:2 | E4/h:3 F4/h:4 | C4/w:1';
const ACC13 = 'C3:5 E3:3 G3:1 E3:3 | B2:5 D3:3 G3:1 D3:3 | C3:5 E3:3 G3:1 E3:3 | C3/w:5';
/** "Valse bên hồ" — tự soạn, 3/4, tay trái trầm – hợp âm – hợp âm (8 ô nhịp). */
const LAKESIDE = 'G4/h:5 E4:3 | F4/h:4 D4:2 | E4:3 F4:4 G4:5 | E4/hd:3 | F4/h:4 D4:2 | E4/h:3 C4:1 | D4:2 E4:3 D4:2 | C4/hd:1';
const LAKESIDE_LH =
  'C3:5 E3+G3:3+1 E3+G3 | C3:5 F3+A3:2+1 F3+A3 | C3:5 E3+G3:3+1 E3+G3 | C3 E3+G3 E3+G3 | ' +
  'C3:5 F3+A3:2+1 F3+A3 | C3:5 E3+G3:3+1 E3+G3 | B2:5 D3+G3:3+1 D3+G3 | C3/hd:5';
const MEL15 = 'E4/h:3 F4:4 | G4/hd:5 | F4/h:4 E4:3 | D4/hd:2 | E4/h:3 D4:2 | C4/hd:1';
const ACC15 = 'C3:5 E3+G3:3+1 E3+G3 | C3 E3+G3 E3+G3 | C3:5 F3+A3:2+1 F3+A3 | B2:5 D3+G3:3+1 D3+G3 | C3:5 E3+G3:3+1 E3+G3 | C3/hd:5';

// ── Tuần 4 — Hai giọng và biểu diễn ───────────────────────────────────
/** Hai tay giọng Sol trưởng — tự soạn: tay phải thế Sol, tay trái hợp âm I – IV – V (8 ô nhịp). */
const G_SONG =
  'G4:1 A4:2 B4:3 G4:1 | C5:4 B4:3 A4/h:2 | B4:3 C5:4 D5:5 B4:3 | A4:2 C5:4 B4/h:3 | ' +
  'C5:4 B4:3 A4:2 B4:3 | D5/h:5 B4/h:3 | A4:2 B4:3 C5:4 A4:2 | G4/w:1';
const G_SONG_LH =
  'G2+B2+D3/w:5+3+1 | G2+C3+E3/h:5+2+1 F#2+A2+D3/h:5+3+1 | G2+B2+D3/w:5+3+1 | F#2+A2+D3/h:5+3+1 G2+B2+D3/h:5+3+1 | ' +
  'G2+C3+E3/w:5+2+1 | G2+B2+D3/w:5+3+1 | G2+C3+E3/h:5+2+1 F#2+A2+D3/h:5+3+1 | G2+B2+D3/w:5+3+1';
/** Hai tay giọng Fa trưởng — tự soạn: tay phải thế Fa, tay trái hợp âm I – IV – V (8 ô nhịp). */
const F_SONG =
  'F4:1 G4:2 A4:3 F4:1 | Bb4:4 A4:3 G4/h:2 | A4:3 Bb4:4 C5:5 A4:3 | G4:2 Bb4:4 A4/h:3 | ' +
  'Bb4:4 A4:3 G4:2 A4:3 | C5/h:5 A4/h:3 | G4:2 A4:3 Bb4:4 G4:2 | F4/w:1';
const F_SONG_LH =
  'F2+A2+C3/w:5+3+1 | F2+Bb2+D3/h:5+2+1 E2+G2+C3/h:5+3+1 | F2+A2+C3/w:5+3+1 | E2+G2+C3/h:5+3+1 F2+A2+C3/h:5+3+1 | ' +
  'F2+Bb2+D3/w:5+2+1 | F2+A2+C3/w:5+3+1 | E2+G2+C3/w:5+3+1 | F2+A2+C3/w:5+3+1';
/** "Cánh diều" — tự soạn, tay phải có móc đơn, tay trái hợp âm rải (8 ô nhịp). */
const KITE =
  'C4/8:1 D4/8:2 E4:3 G4/h:5 | F4/8:4 E4/8:3 D4:2 E4/h:3 | G4/8:5 F4/8:4 E4:3 F4:4 D4:2 | E4/w:3 | ' +
  'F4/8:4 E4/8:3 D4:2 F4:4 E4:3 | D4/8:2 E4/8:3 F4:4 E4/h:3 | D4/8:2 C4/8:1 D4:2 E4:3 D4:2 | C4/w:1';
const KITE_LH =
  'C3:5 E3:3 G3:1 E3:3 | B2:5 D3:3 G3:1 D3:3 | C3:5 E3:3 G3:1 E3:3 | C3:5 E3:3 G3:1 E3:3 | ' +
  'C3:5 F3:2 A3:1 F3:2 | C3:5 E3:3 G3:1 E3:3 | B2:5 D3:3 G3:1 D3:3 | C3/w:5';
/** "Tiếng chuông" — tự soạn, 3/4, đệm valse (8 ô nhịp). */
const BELLS = 'E4:3 G4:5 E4:3 | D4/h:2 F4:4 | E4:3 C4:1 E4:3 | G4/hd:5 | F4:4 E4:3 D4:2 | E4/h:3 C4:1 | D4:2 F4:4 D4:2 | C4/hd:1';
const BELLS_LH =
  'C3:5 E3+G3:3+1 E3+G3 | B2:5 D3+G3:3+1 D3+G3 | C3:5 E3+G3:3+1 E3+G3 | C3 E3+G3 E3+G3 | ' +
  'C3:5 F3+A3:2+1 F3+A3 | C3:5 E3+G3:3+1 E3+G3 | B2:5 D3+G3:3+1 D3+G3 | C3/hd:5';
/** "Tốt nghiệp cấp 5" — tự soạn, hợp âm khối và rải (8 ô nhịp). */
const GRADUATION_5 =
  'E4:3 F4:4 G4/h:5 | F4:4 D4:2 E4/h:3 | C4:1 E4:3 G4:5 E4:3 | F4/h:4 D4/h:2 | ' +
  'E4:3 G4:5 F4:4 E4:3 | D4:2 F4:4 E4/h:3 | D4:2 E4:3 F4:4 D4:2 | C4/w:1';
const GRADUATION_5_LH =
  `${C}/w:5+3+1 | ${G}/w:5+3+1 | C3:5 E3:3 G3:1 E3:3 | ${F}/h:5+2+1 ${G}/h:5+3+1 | ` + `${C}/w:5+3+1 | ${G}/w:5+3+1 | ${F}/h:5+2+1 ${G}/h:5+3+1 | ${C}/w:5+3+1`;

const lhChordKeys = (fingers: Record<number, number>) => ({ type: 'keyboard' as const, from: 45, to: 60, highlight: Object.keys(fingers).map(Number), fingers });

/** Buổi có một bài hai tay: luyện riêng tay phải → hai tay (Wait Mode) → biểu diễn. */
function handsTogether(melody: string, lh: string, opts: { bpm?: number; title?: string; three?: boolean; key?: 'G' | 'F'; weight?: number } = {}) {
  const { bpm = 60, title, three, key, weight = 2 } = opts;
  const wrap = (p: ReturnType<typeof rh>) => {
    const k = key ? inKey(p, key) : p;
    return three ? in34(k) : k;
  };
  return [
    practice(play('rh', 'Khởi động: tay phải riêng', 'wait', wrap(rh(melody, bpm, title)))),
    play('wait', 'Hai tay cùng lúc (Wait Mode)', 'wait', wrap(withLh(melody, lh, bpm, title)), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
    play('perform', 'Biểu diễn hai tay', 'performance', wrap(withLh(melody, lh, bpm, title)), { weight }),
  ];
}

const defs: LessonDef[] = [
  // ── Tuần 1 — Nốt trầm tay trái ─────────────────────────────────────
  {
    lessonId: 'l5-01-bass-whole',
    weekId: 'l5-w1',
    number: 1,
    title: 'Nốt trầm giữ cả ô nhịp',
    description: 'Lần đầu hai tay đánh CÙNG LÚC: tay trái đánh một nốt tròn ở phách 1 rồi giữ, tay phải chơi giai điệu.',
    learningObjectives: ['Đánh hai tay cùng lúc ở phách 1', 'Giữ nốt tay trái trong khi tay phải đi tiếp', 'Đánh tay trái nhẹ hơn tay phải'],
    estimatedDuration: 15,
    prerequisites: ['l4-20-final'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Hai tay cùng lúc',
        pages: [
          {
            title: 'App chấm tay nào?',
            body: 'Từ cấp này hai tay đánh cùng lúc. Micro chỉ nghe chắc được một nốt mỗi lúc, nên app chấm GIAI ĐIỆU tay phải; tay trái (khuông Fa) đánh kèm và không bị tính sai. Hãy đánh tay trái nhẹ hơn.',
            kids: 'Tay phải hát, tay trái hát đệm thật khẽ nhé!',
          },
          staffPage('Nghe mẫu', 'Tay trái đánh nốt tròn ở đầu mỗi ô nhịp, giữ suốt bốn phách.', withLh(MEL1, ACC1)),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hai tay', questions: [Q.together, Q.bassSoft], pass: { minAccuracy: 0.5 } },
      ...handsTogether(MEL1, ACC1),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-02-bass-half',
    weekId: 'l5-w1',
    number: 2,
    title: 'Nốt trầm đổi nửa ô nhịp',
    description: 'Tay trái đổi nốt ở phách 1 và phách 3 (nốt trắng). Hai tay cùng xuống phím ở hai phách đó.',
    learningObjectives: ['Đổi nốt tay trái giữa ô nhịp', 'Hai tay cùng đánh ở phách 1 và 3', 'Giữ tay phải liền mạch'],
    estimatedDuration: 15,
    prerequisites: ['l5-01-bass-whole'],
    notes: NOTES,
    activities: [{ kind: 'intro', id: 'intro', title: 'Nốt trắng tay trái', pages: [staffPage('Nghe mẫu', 'Tay trái đổi nốt mỗi hai phách.', withLh(MEL2, ACC2))] }],
    exercises: handsTogether(MEL2, ACC2),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-03-fifths',
    weekId: 'l5-w1',
    number: 3,
    title: 'Quãng 5 tay trái',
    description: 'Tay trái đánh Đô và Sol cùng lúc (ngón 5 và ngón 1) — âm nền vững cho giai điệu.',
    learningObjectives: ['Đánh hai nốt tay trái cùng lúc', 'Quãng 5 Đô – Sol', 'Giữ quãng 5 dưới giai điệu'],
    estimatedDuration: 15,
    prerequisites: ['l5-02-bass-half'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Quãng 5',
        pages: [
          { title: 'Đô – Sol tay trái', body: 'Ngón 5 ở Đô (C3), ngón 1 ở Sol (G3), đánh cùng lúc.', illustration: lhChordKeys({ 48: 5, 55: 1 }) },
          staffPage('Nghe mẫu', 'Quãng 5 tay trái giữ cả ô nhịp.', withLh(MEL3, ACC3)),
        ],
      },
    ],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: quãng 5', questions: [Q.fifth], pass: { minAccuracy: 1 } }, ...handsTogether(MEL3, ACC3)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-04-sunny',
    weekId: 'l5-w1',
    number: 4,
    title: 'Bài nhạc: Ngày nắng',
    description: 'Bài "Ngày nắng" (tự soạn) 8 ô nhịp: tay trái nốt trầm và quãng 5 đánh cùng giai điệu.',
    learningObjectives: ['Chơi trọn bài hai tay cùng lúc', 'Đổi nốt trầm đúng lúc', 'Biểu diễn đúng nhịp'],
    estimatedDuration: 20,
    prerequisites: ['l5-03-fifths'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Ngày nắng', pages: [staffPage('Nghe mẫu', 'Nghe hai tay cùng lúc trước khi chơi.', withLh(SUNNY, SUNNY_LH, 60, 'Ngày nắng'))] }],
    exercises: handsTogether(SUNNY, SUNNY_LH, { title: 'Ngày nắng' }),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-05-week1-test',
    weekId: 'l5-w1',
    number: 5,
    title: 'Kiểm tra tuần 1',
    description: 'Câu hỏi về chơi hai tay và biểu diễn bài có nốt trầm tay trái. Cần 80/100 điểm.',
    learningObjectives: ['Hai tay cùng lúc', 'Nốt trầm, quãng 5', 'Biểu diễn đúng giai điệu và nhịp'],
    estimatedDuration: 15,
    prerequisites: ['l5-04-sunny'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.together, Q.bassSoft, Q.fifth], pass: { minAccuracy: 0.66 } },
      play('wait', 'Phần 2: hai tay (Wait Mode)', 'wait', withLh(MEL5, ACC5), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn', 'performance', withLh(MEL5, ACC5), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 2 — Hợp âm đệm ────────────────────────────────────────────
  {
    lessonId: 'l5-06-c-chord',
    weekId: 'l5-w2',
    number: 6,
    title: 'Hợp âm Đô trưởng',
    description: 'Ba nốt Đô – Mi – Sol đánh cùng lúc là hợp âm Đô trưởng. Tay trái: ngón 5 – 3 – 1 trên C3 – E3 – G3.',
    learningObjectives: ['Biết hợp âm Đô trưởng', 'Đánh ba nốt tay trái cùng lúc, đều tiếng', 'Giữ hợp âm dưới giai điệu'],
    estimatedDuration: 15,
    prerequisites: ['l5-05-week1-test'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Hợp âm Đô',
        pages: [
          { title: 'Đô – Mi – Sol', body: 'Ngón 5 ở Đô (C3), ngón 3 ở Mi, ngón 1 ở Sol — ba ngón chạm phím cùng lúc.', illustration: lhChordKeys({ 48: 5, 52: 3, 55: 1 }), kids: 'Ba ngón nhảy xuống cùng một lúc — bùm!' },
          staffPage('Nghe mẫu', 'Hợp âm Đô giữ cả ô nhịp dưới giai điệu.', withLh(MEL6, ACC6)),
        ],
      },
    ],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm Đô', questions: [Q.cChord], pass: { minAccuracy: 1 } }, ...handsTogether(MEL6, ACC6)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-07-c-f',
    weekId: 'l5-w2',
    number: 7,
    title: 'Đổi hợp âm: Đô – Fa',
    description: 'Hợp âm Fa ở thế gần: Đô – Fa – La (ngón 5 – 2 – 1). Ngón 5 đứng yên trên Đô, hai ngón kia dịch lên.',
    learningObjectives: ['Hợp âm Fa thế gần', 'Đổi Đô → Fa → Đô gọn gàng', 'Giữ giai điệu khi tay trái đổi hợp âm'],
    estimatedDuration: 15,
    prerequisites: ['l5-06-c-chord'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Hợp âm Fa',
        pages: [
          { title: 'Đô – Fa – La', body: 'Ngón 5 vẫn ở Đô (C3), ngón 2 lên Fa, ngón 1 lên La.', illustration: lhChordKeys({ 48: 5, 53: 2, 57: 1 }) },
          staffPage('Nghe mẫu', 'Đô – Fa – Đô – Đô.', withLh(MEL7, ACC7)),
        ],
      },
    ],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm Fa', questions: [Q.fChord], pass: { minAccuracy: 1 } }, ...handsTogether(MEL7, ACC7)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-08-c-g',
    weekId: 'l5-w2',
    number: 8,
    title: 'Đổi hợp âm: Đô – Sol',
    description: 'Hợp âm Sol ở thế gần: Si – Rê – Sol (ngón 5 – 3 – 1). Ngón 1 đứng yên trên Sol, ngón 5 lùi xuống Si.',
    learningObjectives: ['Hợp âm Sol thế gần', 'Đổi Đô ↔ Sol, giữ ngón 1 trên Sol', 'Kết bài bằng Sol → Đô'],
    estimatedDuration: 15,
    prerequisites: ['l5-07-c-f'],
    notes: NOTES,
    activities: [
      {
        kind: 'intro',
        id: 'intro',
        title: 'Hợp âm Sol',
        pages: [
          { title: 'Si – Rê – Sol', body: 'Ngón 5 lùi xuống Si (B2), ngón 3 ở Rê, ngón 1 vẫn ở Sol.', illustration: lhChordKeys({ 47: 5, 50: 3, 55: 1 }) },
          staffPage('Nghe mẫu', 'Đô – Sol – Đô – Sol / Đô.', withLh(MEL8, ACC8)),
        ],
      },
    ],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm Sol', questions: [Q.gChord, Q.chordShift], pass: { minAccuracy: 0.5 } },
      ...handsTogether(MEL8, ACC8),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-09-morning-song',
    weekId: 'l5-w2',
    number: 9,
    title: 'Bài nhạc: Bài ca buổi sáng',
    description: 'Bài "Bài ca buổi sáng" (tự soạn) 8 ô nhịp, tay trái đệm ba hợp âm Đô – Fa – Sol.',
    learningObjectives: ['Chơi trọn bài có ba hợp âm', 'Đổi hợp âm giữa ô nhịp', 'Biểu diễn hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l5-08-c-g'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Bài ca buổi sáng', pages: [staffPage('Nghe mẫu', 'Nghe trước — chú ý ô 2 và ô 4 đổi hợp âm giữa ô.', withLh(MORNING_SONG, MORNING_SONG_LH, 60, 'Bài ca buổi sáng'))] }],
    exercises: handsTogether(MORNING_SONG, MORNING_SONG_LH, { title: 'Bài ca buổi sáng' }),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-10-week2-test',
    weekId: 'l5-w2',
    number: 10,
    title: 'Kiểm tra tuần 2',
    description: 'Câu hỏi về hợp âm Đô, Fa, Sol và biểu diễn bài có đệm hợp âm. Cần 80/100 điểm.',
    learningObjectives: ['Ba hợp âm Đô – Fa – Sol', 'Đổi hợp âm', 'Biểu diễn hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l5-09-morning-song'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.cChord, Q.fChord, Q.gChord, Q.chordShift], pass: { minAccuracy: 0.75 } },
      play('wait', 'Phần 2: hai tay (Wait Mode)', 'wait', withLh(MEL10, ACC10), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn', 'performance', withLh(MEL10, ACC10), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 3 — Đệm nhịp ─────────────────────────────────────────────
  {
    lessonId: 'l5-11-quarter-bass',
    weekId: 'l5-w3',
    number: 11,
    title: 'Tay trái đánh nốt đen',
    description: 'Tay trái đánh đều nốt đen, tay phải giữ nốt trắng: hai tay chạm phím cùng lúc ở phách 1 và 3, tay trái thêm phách 2 và 4.',
    learningObjectives: ['Tay trái đều nốt đen', 'Tay phải giữ nốt trắng không bị cuốn theo', 'Hai tay độc lập'],
    estimatedDuration: 15,
    prerequisites: ['l5-10-week2-test'],
    notes: NOTES,
    activities: [{ kind: 'intro', id: 'intro', title: 'Nốt đen tay trái', pages: [staffPage('Nghe mẫu', 'Tay trái "tích tắc" đều, tay phải hát dài.', withLh(MEL11, ACC11))] }],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hai tay độc lập', questions: [Q.bassBeat], pass: { minAccuracy: 1 } },
      ...handsTogether(MEL11, ACC11),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-12-waltz-bass',
    weekId: 'l5-w3',
    number: 12,
    title: 'Đệm valse: trầm – hợp âm – hợp âm',
    description: 'Nhịp 3/4: tay trái đánh nốt trầm ở phách 1, hai nốt hợp âm ở phách 2 và 3. Tay phải giữ nốt trắng chấm dôi.',
    learningObjectives: ['Đệm valse tay trái', 'Phách 1 trầm, phách 2 – 3 nhẹ', 'Giai điệu 3/4 trên phần đệm'],
    estimatedDuration: 15,
    prerequisites: ['l5-11-quarter-bass'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Đệm valse', pages: [staffPage('Nghe mẫu', '"Bùm – chát – chát": trầm rồi hai lần hợp âm.', in34(withLh(MEL12, ACC12, 66)))] }],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: đệm valse', questions: [Q.waltzBass], pass: { minAccuracy: 1 } },
      ...handsTogether(MEL12, ACC12, { bpm: 66, three: true }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-13-broken',
    weekId: 'l5-w3',
    number: 13,
    title: 'Hợp âm rải',
    description: 'Thay vì đánh cả hợp âm, tay trái đánh lần lượt Đô – Mi – Sol – Mi. Âm thanh mềm và chảy hơn.',
    learningObjectives: ['Rải hợp âm Đô và Sol', 'Tay trái liền mạch dưới nốt trắng tay phải', 'Biểu diễn hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l5-12-waltz-bass'],
    notes: NOTES,
    activities: [{ kind: 'intro', id: 'intro', title: 'Hợp âm rải', pages: [staffPage('Nghe mẫu', 'Đô – Mi – Sol – Mi: từng nốt của hợp âm nối nhau.', withLh(MEL13, ACC13))] }],
    exercises: [{ kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm rải', questions: [Q.broken], pass: { minAccuracy: 1 } }, ...handsTogether(MEL13, ACC13)],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-14-lakeside',
    weekId: 'l5-w3',
    number: 14,
    title: 'Bài nhạc: Valse bên hồ',
    description: 'Bài "Valse bên hồ" (tự soạn) 8 ô nhịp 3/4, tay trái đệm valse với ba hợp âm Đô – Fa – Sol.',
    learningObjectives: ['Chơi trọn bài valse hai tay', 'Đổi hợp âm trong đệm valse', 'Biểu diễn đúng nhịp 3/4'],
    estimatedDuration: 20,
    prerequisites: ['l5-13-broken'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Valse bên hồ', pages: [staffPage('Nghe mẫu', 'Nghe trước — "bùm – chát – chát" dưới giai điệu.', in34(withLh(LAKESIDE, LAKESIDE_LH, 66, 'Valse bên hồ')))] }],
    exercises: handsTogether(LAKESIDE, LAKESIDE_LH, { bpm: 66, title: 'Valse bên hồ', three: true }),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-15-week3-test',
    weekId: 'l5-w3',
    number: 15,
    title: 'Kiểm tra tuần 3',
    description: 'Câu hỏi về đệm nhịp và hợp âm rải, biểu diễn bài valse hai tay. Cần 80/100 điểm.',
    learningObjectives: ['Tay trái nốt đen, đệm valse, hợp âm rải', 'Hai tay độc lập', 'Biểu diễn 3/4 hai tay'],
    estimatedDuration: 15,
    prerequisites: ['l5-14-lakeside'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.bassBeat, Q.waltzBass, Q.broken, Q.bassSoft], pass: { minAccuracy: 0.75 } },
      play('wait', 'Phần 2: hai tay (Wait Mode)', 'wait', in34(withLh(MEL15, ACC15, 66)), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn', 'performance', in34(withLh(MEL15, ACC15, 66)), { weight: 2 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },

  // ── Tuần 4 — Hai giọng và biểu diễn ─────────────────────────────────
  {
    lessonId: 'l5-16-g-major',
    weekId: 'l5-w4',
    number: 16,
    title: 'Hai tay giọng Sol trưởng',
    description: 'Tay phải thế Sol, tay trái hợp âm Sol (G2 – B2 – D3), Đô (G2 – C3 – E3), Rê (F♯2 – A2 – D3). Hoá biểu một dấu thăng.',
    learningObjectives: ['Ba hợp âm của giọng Sol trưởng', 'Ngón 5 tay trái đứng yên trên Sol (trừ hợp âm Rê)', 'Biểu diễn hai tay giọng Sol trưởng'],
    estimatedDuration: 20,
    prerequisites: ['l5-15-week3-test'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Sol trưởng', pages: [staffPage('Nghe mẫu', 'Ba hợp âm Sol – Đô – Rê dưới giai điệu thế Sol.', inKey(withLh(G_SONG, G_SONG_LH, 60, 'Hai tay Sol trưởng'), 'G'))] }],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm Sol trưởng', questions: [Q.gTonic], pass: { minAccuracy: 1 } },
      ...handsTogether(G_SONG, G_SONG_LH, { title: 'Hai tay Sol trưởng', key: 'G' }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-17-f-major',
    weekId: 'l5-w4',
    number: 17,
    title: 'Hai tay giọng Fa trưởng',
    description: 'Tay phải thế Fa, tay trái hợp âm Fa (F2 – A2 – C3), Si giáng (F2 – B♭2 – D3), Đô (E2 – G2 – C3). Hoá biểu một dấu giáng.',
    learningObjectives: ['Ba hợp âm của giọng Fa trưởng', 'Si giáng ở cả hai tay', 'Biểu diễn hai tay giọng Fa trưởng'],
    estimatedDuration: 20,
    prerequisites: ['l5-16-g-major'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Fa trưởng', pages: [staffPage('Nghe mẫu', 'Ba hợp âm Fa – Si giáng – Đô dưới giai điệu thế Fa.', inKey(withLh(F_SONG, F_SONG_LH, 60, 'Hai tay Fa trưởng'), 'F'))] }],
    exercises: [
      { kind: 'choice-quiz', id: 'quiz', title: 'Câu hỏi: hợp âm Fa trưởng', questions: [Q.fTonic], pass: { minAccuracy: 1 } },
      ...handsTogether(F_SONG, F_SONG_LH, { title: 'Hai tay Fa trưởng', key: 'F' }),
    ],
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-18-kite',
    weekId: 'l5-w4',
    number: 18,
    title: 'Bài nhạc: Cánh diều',
    description: 'Bài "Cánh diều" (tự soạn) 8 ô nhịp: tay phải có móc đơn, tay trái rải hợp âm đều nốt đen.',
    learningObjectives: ['Móc đơn tay phải trên nốt đen tay trái', 'Hai tay khác nhịp điệu', 'Biểu diễn trọn bài'],
    estimatedDuration: 20,
    prerequisites: ['l5-17-f-major'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Cánh diều', pages: [staffPage('Nghe mẫu', 'Tay phải bay nhanh như cánh diều, tay trái đều như gió.', withLh(KITE, KITE_LH, 60, 'Cánh diều'))] }],
    exercises: handsTogether(KITE, KITE_LH, { title: 'Cánh diều' }),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-19-bells',
    weekId: 'l5-w4',
    number: 19,
    title: 'Bài nhạc 3/4: Tiếng chuông',
    description: 'Bài "Tiếng chuông" (tự soạn) 8 ô nhịp 3/4, đệm valse với ba hợp âm.',
    learningObjectives: ['Đệm valse liền mạch', 'Giai điệu nốt đen trên phần đệm', 'Biểu diễn 3/4 hai tay'],
    estimatedDuration: 20,
    prerequisites: ['l5-18-kite'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [{ kind: 'intro', id: 'intro', title: 'Tiếng chuông', pages: [staffPage('Nghe mẫu', 'Nghe trước — tay phải như tiếng chuông, tay trái "bùm – chát – chát".', in34(withLh(BELLS, BELLS_LH, 66, 'Tiếng chuông')))] }],
    exercises: handsTogether(BELLS, BELLS_LH, { bpm: 66, title: 'Tiếng chuông', three: true }),
    assessment: { passScore: 80, checkpoint: false },
  },
  {
    lessonId: 'l5-20-final',
    weekId: 'l5-w4',
    number: 20,
    title: 'Kiểm tra cuối cấp 5',
    description: 'Lý thuyết hợp âm và đệm, biểu diễn bài "Tốt nghiệp cấp 5" (tự soạn) hai tay cùng lúc. Cần 80/100 điểm.',
    learningObjectives: ['Ôn toàn bộ kiến thức cấp 5', 'Hợp âm khối và hợp âm rải', 'Biểu diễn hai tay cùng lúc'],
    estimatedDuration: 25,
    prerequisites: ['l5-19-bells'],
    notes: NOTES,
    ageVariants: KIDS_SLOWER,
    activities: [],
    exercises: [
      { kind: 'choice-quiz', id: 'theory', title: 'Phần 1: lý thuyết', questions: [Q.together, Q.cChord, Q.gChord, Q.broken, Q.bassBeat, Q.gTonic], pass: { minAccuracy: 0.8 } },
      play('wait', 'Phần 2: hai tay (Wait Mode)', 'wait', withLh(GRADUATION_5, GRADUATION_5_LH, 60, 'Tốt nghiệp cấp 5'), { pass: { minAccuracy: 0.85, minCompletion: 1 } }),
      play('perform', 'Phần 3: biểu diễn "Tốt nghiệp cấp 5"', 'performance', withLh(GRADUATION_5, GRADUATION_5_LH, 60, 'Tốt nghiệp cấp 5'), { weight: 3 }),
    ],
    assessment: { passScore: 80, checkpoint: true },
  },
];

export const LEVEL5_WEEKS: Week[] = [
  {
    weekId: 'l5-w1',
    number: 1,
    title: 'Tuần 1 — Nốt trầm tay trái',
    description: 'Hai tay cùng lúc: nốt trầm giữ, đổi nửa ô nhịp, quãng 5; bài "Ngày nắng".',
    lessonIds: ['l5-01-bass-whole', 'l5-02-bass-half', 'l5-03-fifths', 'l5-04-sunny', 'l5-05-week1-test'],
    extraPractice: [{ lessonId: 'bh-parallel', tip: 'Ôn hai tay chơi lần lượt trước khi chơi cùng lúc.' }],
  },
  {
    weekId: 'l5-w2',
    number: 2,
    title: 'Tuần 2 — Hợp âm đệm',
    description: 'Hợp âm Đô, Fa, Sol ở thế gần; đổi hợp âm; bài "Bài ca buổi sáng".',
    lessonIds: ['l5-06-c-chord', 'l5-07-c-f', 'l5-08-c-g', 'l5-09-morning-song', 'l5-10-week2-test'],
    extraPractice: [{ lessonId: 'song-romance-2-hands', tip: 'Thử sức: tay trái giữ hợp âm cả ô nhịp ở đoạn A (giọng Rê thứ).' }],
  },
  {
    weekId: 'l5-w3',
    number: 3,
    title: 'Tuần 3 — Đệm nhịp',
    description: 'Tay trái nốt đen, đệm valse, hợp âm rải; bài "Valse bên hồ".',
    lessonIds: ['l5-11-quarter-bass', 'l5-12-waltz-bass', 'l5-13-broken', 'l5-14-lakeside', 'l5-15-week3-test'],
    extraPractice: [
      { lessonId: 'song-prelude-c', tip: 'Hợp âm rải liên tục — nghe từng hợp âm chuyển màu.' },
      { lessonId: 'song-romance-2-hands', tip: 'Đoạn B: tay trái rải hợp âm từng nốt đen.' },
    ],
  },
  {
    weekId: 'l5-w4',
    number: 4,
    title: 'Tuần 4 — Hai giọng và biểu diễn',
    description: 'Hai tay giọng Sol trưởng, Fa trưởng; bài "Cánh diều", "Tiếng chuông" và kiểm tra cuối cấp.',
    lessonIds: ['l5-16-g-major', 'l5-17-f-major', 'l5-18-kite', 'l5-19-bells', 'l5-20-final'],
    extraPractice: [{ lessonId: 'song-minuet-g', tip: 'Minuet giọng Sol trưởng — luyện tay phải trước, rồi thêm tay trái.' }],
  },
];

export const LEVEL5_LESSONS: CurriculumLesson[] = buildLessons(LEVEL, defs);
