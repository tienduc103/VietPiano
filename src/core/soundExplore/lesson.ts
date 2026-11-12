/**
 * Định nghĩa bài "Khám phá âm thanh — Cao độ và Trường độ" (mô hình `LessonDefinition`) + toàn bộ câu cô giáo nói.
 *
 * Mọi câu là chuỗi CỐ ĐỊNH (không ghép tên / số) → `npm run voice` thu sẵn mp3 cho từng câu (`soundExploreVoiceLines`).
 * Sửa câu ở đây rồi chạy lại `npm run voice`.
 */
import type { VoiceCue } from '../voice/types';
import { KID_MESSAGES } from './assessment';
import { DEFAULT_SETTINGS, type SoundExploreSettings } from './config';
import type { ActivityId, SkillId } from './progress';
import type { GardenTask, HighLow, ShortLong, UpDown } from './tasks';

export interface ActivityDefinition {
  id: ActivityId;
  /** Chữ cho phụ huynh; bé nhận biết bằng biểu tượng + giọng nói. */
  title: string;
  icon: string;
  objective: string;
  skills: SkillId[];
}

export interface LessonDefinition {
  lessonId: string;
  title: string;
  targetAge: { min: number; max: number };
  /** Thuộc giáo trình "Làm quen từng nốt" (giai đoạn nhập môn, trước bài đọc khuông). */
  curriculumId: string;
  activities: ActivityDefinition[];
  learningObjectives: string[];
  defaultSettings: SoundExploreSettings;
  version: number;
}

export const SOUND_EXPLORE_LESSON: LessonDefinition = {
  lessonId: 'sound-explore',
  title: 'Khám phá âm thanh — Cao độ và Trường độ',
  targetAge: { min: 4, max: 6 },
  curriculumId: 'vietpiano-supplement',
  activities: [
    { id: 'intro', title: 'Làm quen với âm thanh', icon: '👂', objective: 'Nghe tiếng cao / thấp, ngắn / dài — mỗi lần một khái niệm', skills: [] },
    { id: 'rocket', title: 'Tên lửa cao độ', icon: '🚀', objective: 'Nhận biết cao / thấp, hướng đi lên / xuống; đánh phím điều khiển tên lửa', skills: ['pitchRecognition', 'pitchDirection'] },
    { id: 'duration', title: 'Thỏ và Ốc sên', icon: '🐰', objective: 'Nhận biết và tự tạo âm ngắn / dài', skills: ['durationRecognition', 'durationExecution'] },
    { id: 'garden', title: 'Khu vườn âm nhạc', icon: '🌷', objective: 'Kết hợp cao độ và trường độ', skills: ['pitchExecution', 'durationExecution'] },
    { id: 'free', title: 'Biểu diễn tự do', icon: '🎨', objective: 'Tự do khám phá, không chấm điểm; ghi lại và nghe lại', skills: [] },
    { id: 'adventure', title: 'Phiêu lưu âm nhạc', icon: '🗺️', objective: '5–7 nhiệm vụ ngắn trộn nghe, đánh, giữ phím, giai điệu', skills: ['pitchRecognition', 'pitchDirection', 'durationRecognition', 'durationExecution', 'pitchExecution'] },
  ],
  learningObjectives: [
    'Phân biệt âm cao và âm thấp (không nhầm với to / nhỏ)',
    'Nhận ra giai điệu đi lên, đi xuống',
    'Phân biệt âm ngắn và âm dài',
    'Tự đánh âm cao / thấp và giữ phím ngắn / dài theo yêu cầu',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  version: 1,
};

export const ACTIVITY_TITLE = Object.fromEntries(SOUND_EXPLORE_LESSON.activities.map((a) => [a.id, a.title])) as Record<ActivityId, string>;
export const ACTIVITY_ICON = Object.fromEntries(SOUND_EXPLORE_LESSON.activities.map((a) => [a.id, a.icon])) as Record<ActivityId, string>;

// ─── Câu cô giáo nói ────────────────────────────────────────────────────────────────

export const SAY = {
  home: 'Con chọn một trò chơi nhé!',
  introPitch: 'Con nghe nhé! Có tiếng đàn bay lên cao, có tiếng đàn đi xuống thấp.',
  introHigh: 'Đây là tiếng cao.',
  introLow: 'Đây là tiếng thấp.',
  introDuration: 'Đây là âm thanh ngắn: Tinh! Đây là âm thanh dài: Tiiiiinh!',
  introDone: 'Con giỏi lắm! Mình cùng chơi trò tên lửa nhé!',

  listenRegister: 'Con nghe tiếng đàn. Tiếng này cao hay thấp?',
  listenCompare: 'Con nghe hai tiếng đàn. Tiếng sau đi lên cao hay đi xuống thấp?',
  listenRun: 'Con nghe ba tiếng đàn. Các tiếng đi lên hay đi xuống?',
  correctHigh: 'Đúng rồi! Tiếng cao, tên lửa bay lên!',
  correctLow: 'Đúng rồi! Tiếng thấp, tên lửa đáp xuống!',
  correctUp: 'Đúng rồi! Tiếng đàn đi lên!',
  correctDown: 'Đúng rồi! Tiếng đàn đi xuống!',
  listenAgain: 'Mình nghe lại một lần nữa nhé!',

  rocketPlay: 'Con đánh một phím bất kỳ. Phím bên phải cao, tên lửa bay lên. Phím bên trái thấp, tên lửa đi xuống.',
  pathUp: 'Con hãy đánh các phím đi lên cao dần, từ trái sang phải, để tên lửa bay lên nhé!',
  pathDown: 'Con hãy đánh các phím đi xuống thấp dần, từ phải sang trái, để tên lửa hạ cánh nhé!',
  pathWrongUp: 'Tên lửa muốn bay lên cao hơn nữa! Con thử phím bên phải nhé.',
  pathWrongDown: 'Tên lửa muốn xuống thấp hơn nữa! Con thử phím bên trái nhé.',
  pathSame: 'Phím này cao bằng phím vừa rồi. Con thử phím khác nhé.',
  pathDone: 'Tuyệt vời! Tên lửa đã tới nơi!',

  listenShort: 'Con nghe hai tiếng đàn. Tiếng nào ngắn như chú thỏ nhảy?',
  listenLong: 'Con nghe hai tiếng đàn. Tiếng nào dài như ốc sên bò?',
  correctShort: 'Đúng rồi! Tiếng ngắn, thỏ nhảy tưng!',
  correctLong: 'Đúng rồi! Tiếng dài, ốc sên bò thật xa!',
  durationPlay: 'Con nhấn một phím. Nhấn thật nhanh thì thỏ nhảy. Giữ thật lâu thì ốc sên bò.',
  holdShort: 'Con hãy nhấn thật nhanh, ngắn như chú thỏ nhé!',
  holdLong: 'Con hãy giữ phím thật lâu, dài như ốc sên nhé!',
  gotShort: 'Tinh! Một tiếng ngắn, thỏ nhảy rồi!',
  gotLong: 'Một tiếng dài, ốc sên bò xa quá!',
  unclear: 'Tiếng này chưa ngắn hẳn, cũng chưa dài hẳn. Con thử lại nhé!',
  needLonger: 'Con thử giữ phím lâu hơn một chút nhé!',
  needShorter: 'Con thử nhấn nhanh rồi buông tay ngay nhé!',
  micNoDuration: 'Micro chưa đo được tiếng dài hay ngắn. Con bấm phím trên màn hình nhé.',

  gardenHighLong: 'Con hãy chơi một tiếng cao và dài nhé!',
  gardenHighShort: 'Con hãy chơi một tiếng cao và ngắn nhé!',
  gardenLowLong: 'Con hãy chơi một tiếng thấp và dài nhé!',
  gardenLowShort: 'Con hãy chơi một tiếng thấp và ngắn nhé!',
  bloom: 'Hoa nở rồi! Con giỏi quá!',
  highOk: 'Tiếng cao đúng rồi!',
  lowOk: 'Tiếng thấp đúng rồi!',
  longOk: 'Giữ phím dài đúng rồi!',
  shortOk: 'Nhấn ngắn đúng rồi!',
  needHigher: 'Con chuyển sang phím cao hơn, ở bên phải nhé.',
  needLower: 'Con chuyển sang phím thấp hơn, ở bên trái nhé.',
  retryBoth: 'Mình nghe ví dụ lại nhé, rồi con thử lần nữa!',

  playHigh: 'Con hãy đánh một tiếng thật cao nhé!',
  playLow: 'Con hãy đánh một tiếng thật thấp nhé!',
  notHighYet: 'Tiếng này chưa cao lắm. Con thử phím bên phải nhé!',
  notLowYet: 'Tiếng này chưa thấp lắm. Con thử phím bên trái nhé!',
  melodyUp2: 'Con hãy đánh hai phím, phím sau cao hơn phím trước nhé!',
  melodyDown2: 'Con hãy đánh hai phím, phím sau thấp hơn phím trước nhé!',
  melodyUp3: 'Con hãy đánh ba phím đi lên cao dần nhé!',
  melodyDown3: 'Con hãy đánh ba phím đi xuống thấp dần nhé!',

  freeStart: 'Con đánh gì cũng được! Nhân vật sẽ bay theo tiếng đàn của con.',
  recordStart: 'Đang ghi lại. Con chơi đi nào!',
  playback: 'Mình cùng nghe lại nhé!',

  adventureStart: 'Mình cùng đi phiêu lưu âm nhạc nhé!',
  missionDone: 'Xong một nhiệm vụ! Con được một ngôi sao!',
  adventureDone: 'Chuyến phiêu lưu hoàn thành! Con nhận được một hình dán!',
  summary: 'Đây là những ngôi sao con đã nhận được hôm nay!',
} as const;

export type SayKey = keyof typeof SAY;

export function gardenSay(t: Pick<GardenTask, 'register' | 'duration'>): SayKey {
  return t.register === 'high' ? (t.duration === 'long' ? 'gardenHighLong' : 'gardenHighShort') : t.duration === 'long' ? 'gardenLowLong' : 'gardenLowShort';
}

export function melodySay(direction: UpDown, length: number): SayKey {
  return length <= 2 ? (direction === 'up' ? 'melodyUp2' : 'melodyDown2') : direction === 'up' ? 'melodyUp3' : 'melodyDown3';
}

export const correctPitchSay = (a: HighLow | UpDown): SayKey => ({ high: 'correctHigh', low: 'correctLow', up: 'correctUp', down: 'correctDown' } as const)[a];
export const correctDurationSay = (a: ShortLong): SayKey => (a === 'short' ? 'correctShort' : 'correctLong');

/** Lời dặn / nhận xét → VoiceCue. Lời khen dùng trigger `note_correct` (theo cài đặt "Động viên"). */
export function cueFor(key: SayKey, kind: 'instruction' | 'praise' = 'instruction'): VoiceCue {
  return { id: `se-${key}`, trigger: kind === 'praise' ? 'note_correct' : 'step_start', instructionText: SAY[key] };
}

/** Mọi câu cô giáo có thể nói ở bài này (cho `npm run voice`). */
export function soundExploreVoiceLines(): string[] {
  return [...Object.values(SAY), ...Object.values(KID_MESSAGES)];
}
