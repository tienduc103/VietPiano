/**
 * Danh mục cho mục Trò chơi: thông tin từng trò (kỹ năng luyện, mô tả) + chỉ mục trò của mọi buổi giáo trình
 * (suy bằng `gamesForLesson`, giống trò sau buổi) + chú thích nội dung của từng trò ở từng buổi.
 */
import { CURRICULUM } from '../curriculum/content/curriculum';
import type { CurriculumLesson, Curriculum, Level } from '../curriculum/types';
import { text } from '../curriculum/types';
import { orderedLessons } from '../curriculum/unlock';
import { pitchToLabel, type NoteLabelStyle } from '../music/notes';
import { gameNoteName, gamesForLesson, type GameKind, type GameSpec, type LessonGameSpec } from './gameForLesson';
import { intervalName } from './intervals';

export interface GameInfo {
  /** Kỹ năng trò chơi luyện. */
  skill: string;
  description: string;
  /** Trò có ở các buổi giáo trình (nội dung lấy từ buổi) hay chơi tự do (mức chơi soạn sẵn). */
  source: 'lesson' | 'arcade';
}

export const GAME_INFO: Record<GameKind, GameInfo> = {
  'note-catch': { skill: 'Tìm phím theo tên nốt', description: 'Nốt rơi theo làn phía trên phím — đánh đúng trước khi chạm đáy.', source: 'lesson' },
  'key-hunt': { skill: 'Nhận biết bàn phím', description: 'Làm theo yêu cầu tìm phím (Đô, nhóm phím đen…) trước khi hết giờ.', source: 'lesson' },
  'rhythm-train': { skill: 'Tiết tấu', description: 'Gõ đúng lúc toa tàu chạm vạch đèn; toa "nghỉ" là dấu lặng. Không xét cao độ.', source: 'lesson' },
  'staff-shoot': { skill: 'Đọc nốt trên khuông', description: 'Bóng bay mang nốt vẽ trên khuông, không có tên — đọc rồi bắn.', source: 'lesson' },
  'echo-melody': { skill: 'Luyện tai · nhớ giai điệu', description: 'Nghe đoạn nhạc ngắn rồi đánh lại; đúng thì đoạn sau dài thêm.', source: 'lesson' },
  'finger-quiz': { skill: 'Thế tay · số ngón', description: 'Hiện số ngón — đánh phím dưới ngón đó trong thế tay của buổi.', source: 'lesson' },
  'note-sprint': { skill: 'Tốc độ đọc nốt', description: 'Đọc càng nhiều nốt trên khuông càng tốt trong 60 giây; đánh sai bị trừ giây.', source: 'arcade' },
  'ear-finder': { skill: 'Luyện tai · cao độ', description: 'Nghe một nốt rồi tìm phím; sai thì được gợi ý cao hơn / thấp hơn.', source: 'arcade' },
  'interval-detective': { skill: 'Quãng · lý thuyết', description: 'Từ nốt gốc, đánh nốt cách nó một quãng cho trước (lên hoặc xuống).', source: 'arcade' },
  'steady-beat': { skill: 'Giữ nhịp đều', description: 'Gõ theo metronome, rồi metronome tắt — tự giữ nhịp thật đều. Không xét cao độ.', source: 'arcade' },
};

/** Thứ tự hiển thị: trò của buổi học trước, trò mới sau. */
export const GAME_ORDER: readonly GameKind[] = [
  'note-catch',
  'staff-shoot',
  'key-hunt',
  'rhythm-train',
  'echo-melody',
  'finger-quiz',
  'note-sprint',
  'ear-finder',
  'interval-detective',
  'steady-beat',
];

export interface LessonGames {
  level: Level;
  lesson: CurriculumLesson;
  specs: LessonGameSpec[];
}

/** Trò của mọi buổi (cấp đã có nội dung), theo thứ tự học. */
export function lessonGameIndex(curriculum: Curriculum = CURRICULUM): LessonGames[] {
  const out: LessonGames[] = [];
  for (const level of curriculum.levels) {
    if (level.availability !== 'available') continue;
    const lessons = orderedLessons(level);
    lessons.forEach((lesson, i) => out.push({ level, lesson, specs: gamesForLesson(lesson, lessons.slice(0, i)) }));
  }
  return out;
}

let cached: LessonGames[] | null = null;
/** `lessonGameIndex()` của giáo trình chính, tính một lần. */
export function curriculumGameIndex(): LessonGames[] {
  return (cached ??= lessonGameIndex());
}

/** Các buổi có trò `kind`. */
export function lessonsWithGame(index: readonly LessonGames[], kind: GameKind): LessonGames[] {
  return index.filter((e) => e.specs.some((s) => s.kind === kind));
}

/** "Cấp 2 · Buổi 5 — Tên buổi". */
export function lessonLabel(level: Level, lesson: CurriculumLesson): string {
  return `Cấp ${level.number} · Buổi ${lesson.number} — ${text(lesson.title)}`;
}

/** "Đô4 → Sol4 · 5 nốt" (một nốt: chỉ tên nốt). */
function noteRange(spec: { names?: Record<number, string> }, notes: readonly number[], style: NoteLabelStyle): string {
  const name = (m: number) => pitchToLabel(gameNoteName(spec, m), style);
  if (notes.length === 0) return '';
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  return lo === hi ? name(lo) : `${name(lo)} → ${name(hi)} · ${notes.length} nốt`;
}

const CLEF_NAME = { treble: 'Khuông Sol', bass: 'Khuông Fa' } as const;

/** Chú thích nội dung của trò (nốt / tiết tấu / thế tay…), dùng ở danh sách trò theo buổi. */
export function specSummary(spec: GameSpec, style: NoteLabelStyle = 'solfege'): string {
  switch (spec.kind) {
    case 'note-catch':
    case 'echo-melody':
    case 'ear-finder':
      return noteRange(spec, spec.notes, style);
    case 'staff-shoot':
    case 'note-sprint':
      return [CLEF_NAME[spec.clef], spec.kind === 'staff-shoot' && spec.keySignature ? `hoá biểu ${spec.keySignature}` : '', noteRange(spec, spec.notes, style)].filter(Boolean).join(' · ');
    case 'key-hunt':
      return `${spec.rounds.length} yêu cầu: ${[...new Set(spec.rounds.map((r) => text(r.prompt)))].slice(0, 2).join(' / ')}${spec.rounds.length > 2 ? '…' : ''}`;
    case 'rhythm-train': {
      const [n, d] = spec.piece.timeSignature ?? [4, 4];
      return `Nhịp ${n}/${d} · ${spec.piece.bpm} BPM`;
    }
    case 'finger-quiz':
      return `Thế tay ${spec.hand === 'right' ? 'phải' : 'trái'} · ${Object.keys(spec.fingers).length} ngón`;
    case 'interval-detective':
      return `${spec.intervals.map(intervalName).join(', ')} · ${spec.directions.length === 2 ? 'lên & xuống' : spec.directions[0] === 'up' ? 'đi lên' : 'đi xuống'}`;
    case 'steady-beat':
      return `${spec.bpm} BPM · tự giữ ${spec.silentBeats} phách`;
  }
}
