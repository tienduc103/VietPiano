/**
 * Bản nhạc cho trò Săn nốt (Note Hunter).
 *
 * Một nguồn dữ liệu duy nhất: mỗi bài là một `Lesson` (ký hiệu gọn "C4 D4/h R") → `buildSong` suy ra
 * dòng thời gian nốt (`lessonTimeline`) dùng chung cho trình phát, khuông nhạc (ScoreRenderer vẽ chính `lesson`)
 * và logic game — không có bản dữ liệu thứ hai để lệch nhau.
 *
 * Bản đầu chỉ có giai điệu một bè (`voice` = 0); các trường `voice` / `startBeat` để mở rộng sang hợp âm,
 * hai tay, nhiều bè (nhiều nốt cùng `startBeat`).
 */
import { lessonTimeline } from '../curriculum/piece';
import { LESSONS } from '../lessons/library';
import { parseNotes } from '../lessons/notation';
import { measureLength, lessonTempo, type Clef, type Lesson } from '../lessons/types';
import type { KeySignature } from '../music/keySignature';
import { isBlackKey } from '../music/notes';

export interface HunterNote {
  /** Định danh ổn định trong bài: "<songId>#<chỉ số>". */
  id: string;
  /** Chỉ số trong `lesson.notes` (cũng là chỉ số nốt trên khuông nhạc). */
  index: number;
  /** Tên nốt khoa học ("C4", "F#4"); "R" với dấu lặng. */
  pitch: string;
  /** MIDI (C4 = 60) — so khớp theo số này để không nhầm quãng 8; null với dấu lặng. */
  midiNumber: number | null;
  startBeat: number;
  durationBeats: number;
  /** Ô nhịp (từ 0, gồm cả ô lấy đà). */
  measureIndex: number;
  /** Bè; bản đầu luôn 0. */
  voice: number;
  /** Lực gõ khi app tự phát (1–127). */
  velocity: number;
}

export interface HunterSong {
  songId: string;
  title: string;
  composer: string;
  difficulty: 1 | 2 | 3;
  /** Nhịp độ gợi ý (nốt đen/phút). */
  tempo: number;
  timeSignature: Lesson['timeSignature'];
  keySignature?: KeySignature;
  clef: Clef;
  source?: string;
  notes: HunterNote[];
  /** Tổng độ dài (nốt đen). */
  totalBeats: number;
  measureCount: number;
  /** Bài dạng Lesson để vẽ khuông nhạc bằng ScoreRenderer (cùng thứ tự nốt với `notes`). */
  lesson: Lesson;
}

export function buildSong(lesson: Lesson, composer: string): HunterSong {
  if (lesson.accompaniment?.length || lesson.hand === 'both' || lesson.clef === 'grand') {
    throw new Error(`Bài "${lesson.id}" không phải giai điệu một bè`);
  }
  const timeline = lessonTimeline(lesson);
  const notes: HunterNote[] = timeline.map((n) => ({
    id: `${lesson.id}#${n.index}`,
    index: n.index,
    pitch: n.pitch,
    midiNumber: n.midiNote,
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    measureIndex: n.measureIndex,
    voice: 0,
    velocity: n.velocity,
  }));
  const last = notes[notes.length - 1];
  return {
    songId: lesson.id,
    title: lesson.title,
    composer,
    difficulty: lesson.difficulty,
    tempo: lessonTempo(lesson),
    timeSignature: lesson.timeSignature,
    ...(lesson.keySignature ? { keySignature: lesson.keySignature } : {}),
    clef: lesson.clef as Clef,
    ...(lesson.source ? { source: lesson.source } : {}),
    notes,
    totalBeats: last ? last.startBeat + last.durationBeats : 0,
    measureCount: last ? last.measureIndex + 1 : 0,
    lesson,
  };
}

type SongDef = Omit<Lesson, 'notes' | 'category' | 'hand' | 'clef' | 'description'> & { notation: string; composer: string; description: string };

/** Ba bài riêng của trò chơi: có dấu lặng, nhiều trường độ, một bài nhịp 3/4 có hoá biểu. */
const HUNTER_DEFS: SongDef[] = [
  {
    id: 'hunter-do-mi-sol',
    title: 'Đô – Mi – Sol dạo chơi',
    description: 'Nhiều Đô, Mi, Sol — hợp để săn các nốt của hợp âm Đô trưởng.',
    composer: 'VietPiano',
    source: 'Giai điệu tự biên soạn cho VietPiano',
    timeSignature: [4, 4],
    difficulty: 1,
    tempo: 80,
    notation:
      'C4 E4 G4 R | E4/h C4/h | G4 E4 C4 E4 | G4/w | C4 D4 E4 F4 | G4/h R/h | ' +
      'E4 G4 C5 G4 | E4/h C4/h | D4 F4 A4 F4 | E4 G4 C5/h | G4/8 F4/8 E4/8 D4/8 C4 R | C4/w',
  },
  {
    id: 'hunter-lightly-row',
    title: 'Lightly Row (Hänschen klein)',
    description: 'Dân ca Đức — các bước liền nhau quanh thế tay Đô.',
    composer: 'Dân ca Đức',
    source: 'Dân ca Đức thế kỷ 19 — phạm vi công cộng',
    timeSignature: [4, 4],
    difficulty: 1,
    tempo: 90,
    notation:
      'G4 E4 E4/h | F4 D4 D4/h | C4 D4 E4 F4 | G4 G4 G4/h | G4 E4 E4/h | F4 D4 D4/h | C4 E4 G4 G4 | C4/h R/h | ' +
      'D4 D4 D4 D4 | D4 E4 F4/h | E4 E4 E4 E4 | E4 F4 G4/h | G4 E4 E4/h | F4 D4 D4/h | C4 E4 G4 G4 | C4/hd R',
  },
  {
    id: 'hunter-little-waltz',
    title: 'Điệu valse nhỏ (Sol trưởng)',
    description: 'Nhịp 3/4, hoá biểu một dấu thăng — Fa luôn là Fa thăng.',
    composer: 'VietPiano',
    source: 'Giai điệu tự biên soạn cho VietPiano',
    timeSignature: [3, 4],
    keySignature: 'G',
    difficulty: 2,
    tempo: 96,
    notation:
      'G4 B4 D5 | C5/h B4 | A4 F#4 A4 | G4/h R | B4 D5 B4 | A4/h G4 | F#4 A4 F#4 | G4/hd | ' +
      'E4 G4 B4 | A4/h F#4 | D4 F#4 A4 | G4/h R',
  },
];

const HUNTER_LESSONS: Lesson[] = HUNTER_DEFS.map(({ notation, composer: _composer, ...rest }) => ({
  ...rest,
  category: 'song',
  clef: 'treble',
  hand: 'right',
  notes: parseNotes(notation),
}));

/** Bài trong thư viện chung dùng được cho trò: bài hát khoá Sol, một bè, không phần đệm. */
export function isHunterCompatible(lesson: Lesson): boolean {
  return lesson.category === 'song' && lesson.clef === 'treble' && lesson.hand === 'right' && !lesson.accompaniment?.length;
}

/** Tác giả lấy từ ghi chú nguồn của thư viện ("L. v. Beethoven (1824) — phạm vi công cộng" → "L. v. Beethoven"). */
function composerOf(lesson: Lesson): string {
  const head = lesson.source?.split('—')[0]?.trim();
  return head ? head.replace(/\s*\(.*\)\s*$/, '') : 'Không rõ';
}

let cached: HunterSong[] | null = null;
/** Thư viện của trò: 3 bài riêng trước, rồi các bài hát phù hợp trong thư viện chung. */
export function hunterSongs(): HunterSong[] {
  cached ??= [
    ...HUNTER_LESSONS.map((l, i) => buildSong(l, HUNTER_DEFS[i].composer)),
    ...LESSONS.filter(isHunterCompatible).map((l) => buildSong(l, composerOf(l))),
  ];
  return cached;
}

export function findSong(songId: string): HunterSong | undefined {
  return hunterSongs().find((s) => s.songId === songId);
}

/** Ô nhịp đầy đủ (nốt đen). */
export function songMeasureBeats(song: Pick<HunterSong, 'timeSignature'>): number {
  return measureLength(song.timeSignature);
}

/** Các MIDI xuất hiện trong bài (tăng dần). */
export function songMidis(song: Pick<HunterSong, 'notes'>): number[] {
  return [...new Set(song.notes.flatMap((n) => (n.midiNumber === null ? [] : [n.midiNumber])))].sort((a, b) => a - b);
}

/** Chỉ số các nốt mục tiêu của bài (mọi lần xuất hiện của mọi nốt đã chọn), theo thứ tự thời gian. */
export function targetIndices(song: Pick<HunterSong, 'notes'>, targets: Iterable<number>): number[] {
  const set = new Set(targets);
  return song.notes.filter((n) => n.midiNumber !== null && set.has(n.midiNumber)).map((n) => n.index);
}

/** Tên nốt như bài viết (giữ cách ghi thăng/giáng của bài), nốt không có trong bài → undefined. */
export function spelledPitch(song: Pick<HunterSong, 'notes'>, midi: number): string | undefined {
  return song.notes.find((n) => n.midiNumber === midi)?.pitch;
}

// ── Chọn nốt mục tiêu ───────────────────────────────────────────────

export interface TargetRange {
  id: string;
  label: string;
  from: number;
  to: number;
}

/** Khoảng nốt chọn được, mở rộng dần theo cấp độ. */
export const TARGET_RANGES: readonly TargetRange[] = [
  { id: 'c4-c5', label: 'Cấp 1 · Đô4 – Đô5', from: 60, to: 72 },
  { id: 'g3-g5', label: 'Cấp 2 · Sol3 – Sol5', from: 55, to: 79 },
  { id: 'c3-c6', label: 'Cấp 3 · Đô3 – Đô6', from: 48, to: 84 },
];

export interface TargetGroup {
  id: string;
  label: string;
  /** Nốt của nhóm trong khoảng đang chọn. */
  midis: (range: TargetRange, song: HunterSong) => number[];
}

const inRange = (r: TargetRange) => (m: number) => m >= r.from && m <= r.to;

export const TARGET_GROUPS: readonly TargetGroup[] = [
  { id: 'c-major-triad', label: 'Đô – Mi – Sol', midis: (r) => [60, 64, 67].filter(inRange(r)) },
  { id: 'c-position', label: 'Năm ngón Đô (Đô4 – Sol4)', midis: (r) => [60, 62, 64, 65, 67].filter(inRange(r)) },
  { id: 'white', label: 'Mọi phím trắng', midis: (r) => rangeMidis(r).filter((m) => !isBlackKey(m)) },
  { id: 'in-song', label: 'Mọi nốt có trong bài', midis: (r, song) => songMidis(song).filter(inRange(r)) },
];

export function rangeMidis(r: TargetRange): number[] {
  return Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i);
}
