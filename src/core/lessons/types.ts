import type { DynamicMark } from '../music/dynamics';
import type { KeySignature } from '../music/keySignature';

export type Clef = 'treble' | 'bass';

/** Trường độ theo ký hiệu VexFlow: w=tròn, h=trắng, q=đen, 8=móc đơn, 16=móc kép; hậu tố d = có chấm. */
export type Duration = 'w' | 'hd' | 'h' | 'qd' | 'q' | '8d' | '8' | '16';

export const DURATION_BEATS: Record<Duration, number> = {
  w: 4,
  hd: 3,
  h: 2,
  qd: 1.5,
  q: 1,
  '8d': 0.75,
  '8': 0.5,
  '16': 0.25,
};

export type LessonCategory = 'notes' | 'scale' | 'right-hand' | 'left-hand' | 'both-hands' | 'kids' | 'song';

export type Hand = 'right' | 'left';
/** Tay chơi cả bài; 'both' = bài hai tay (mỗi nốt ghi tay riêng, vẽ trên khuông đôi). */
export type LessonHand = Hand | 'both';
/** Khoá của bài; 'grand' = khuông đôi (Sol trên cho tay phải, Fa dưới cho tay trái). */
export type LessonClef = Clef | 'grand';

export const HAND_LABEL: Record<LessonHand, string> = { right: 'Tay phải', left: 'Tay trái', both: 'Hai tay' };
export const CLEF_LABEL: Record<LessonClef, string> = { treble: 'Khoá Sol', bass: 'Khoá Fa', grand: 'Khuông đôi' };

/** Số ngón tay: 1 = ngón cái, 2 = trỏ, 3 = giữa, 4 = áp út, 5 = út (cả hai tay). */
export type Finger = 1 | 2 | 3 | 4 | 5;

/**
 * Nốt tay phải đánh CÙNG LÚC với nốt giai điệu (quãng 3, quãng 6, quãng 8… — ký hiệu "E4+C5/h:1+5"),
 * luôn thấp hơn nốt giai điệu (nốt giai điệu là nốt cao nhất của chùm), cùng trường độ.
 * Micro chỉ nhận một nốt mỗi lúc → chỉ chấm nốt giai điệu; đàn MIDI / bàn phím ảo chấm đủ cả chùm.
 */
export interface HarmonyNote {
  pitch: string;
  midi: number;
  finger?: Finger;
  fingerCircled?: boolean;
}

export interface LessonNote {
  /** Tên nốt khoa học, vd "C4", "F#3". Chùm nốt tay phải: nốt cao nhất (giai điệu). */
  pitch: string;
  midi: number;
  duration: Duration;
  /** Ngón tay gợi ý (vẽ trên khuông nhạc). */
  finger?: Finger;
  /** Số ngón vẽ khoanh tròn (③) như bản in — thường đánh dấu ngón 3 trên phím đen. */
  fingerCircled?: boolean;
  /** Nốt hoà âm tay phải đánh cùng nốt giai điệu, thấp → cao (bài khuông đôi có phần đệm). */
  harmony?: HarmonyNote[];
  /** Tay chơi nốt này — chỉ có ở bài hai tay. */
  hand?: Hand;
  /**
   * Dấu lặng (ký hiệu "R", `pitch` = "R", `midi` = -1). Chỉ dùng ở bài tiết tấu của giáo trình
   * (chấm bằng PerformanceTracker); bài thư viện không có dấu lặng vì PracticeEngine chờ từng nốt.
   */
  rest?: boolean;
}

export const REST_PITCH = 'R';

/**
 * Một nốt hoặc hợp âm của phần đệm tay trái, vẽ trên khuông Fa CÙNG LÚC với giai điệu.
 * Micro: app không chấm phần đệm (chỉ nhận một nốt mỗi lúc) — người học đánh kèm, app chấm giai điệu tay phải.
 * Đàn MIDI / bàn phím ảo (chế độ Chờ/Đếm nốt): chấm cả hai tay theo `accompanimentByNote`.
 */
export interface AccompanimentNote {
  /** Các nốt của hợp âm, từ thấp lên cao; rỗng = dấu lặng tay trái. */
  pitches: string[];
  midis: number[];
  duration: Duration;
  /** Ngón tay cho từng nốt (cùng thứ tự `pitches`). */
  fingers: (Finger | undefined)[];
  /** Số ngón nào vẽ khoanh tròn (cùng thứ tự `pitches`). */
  fingersCircled: boolean[];
}

/** Chữ đánh dấu đoạn (A, B…) vẽ trong khung vuông ở đầu ô nhịp. */
export interface LessonSection {
  /** Số ô nhịp như trên bản nhạc (bắt đầu từ 1, ô lấy đà không đánh số). */
  measure: number;
  label: string;
}

/** Ký hiệu hợp âm ("C", "G7/B", "Fm/Ab") vẽ phía trên khuông Sol, ở nốt giai điệu `index`. */
export interface ChordSymbol {
  index: number;
  symbol: string;
}

/** Dấu to dần / nhỏ dần (cresc. / dim.) từ nốt giai điệu `from` tới hết nốt `to`. */
export interface Hairpin {
  from: number;
  to: number;
  type: 'cresc' | 'dim';
}

/**
 * Ký hiệu pedal vang: đạp từ đầu ô `from` tới hết ô `to` (chỉ số ô từ 0, gồm cả ô lấy đà).
 * Đổi pedal giữa ô nhịp (theo hợp âm): `fromBeat` = đạp muộn hơn đầu ô `from` bấy nhiêu phách (nốt đen),
 * `toBeat` = nhả ở phách này của ô `to` (không có = hết ô).
 */
export interface PedalMark {
  from: number;
  to: number;
  fromBeat?: number;
  toBeat?: number;
}

/** Cấp độ bản phối của một bài có nhiều bản (Cơ bản / Trung cấp / Nâng cao). */
export type ArrangementLevel = 1 | 2 | 3;

export const ARRANGEMENT_LEVEL_LABEL: Record<ArrangementLevel, string> = { 1: 'Cơ bản', 2: 'Trung cấp', 3: 'Nâng cao' };

export interface Lesson {
  id: string;
  title: string;
  description: string;
  category: LessonCategory;
  clef: LessonClef;
  /** [số phách mỗi ô nhịp, giá trị phách] — mẫu số 4 hoặc 8. */
  timeSignature: [number, 4 | 8];
  /** Hoá biểu đầu khuông; mặc định Đô trưởng (không dấu hoá). */
  keySignature?: KeySignature;
  /** Nhịp lấy đà: độ dài (tính bằng nốt đen) của ô nhịp đầu chưa đủ phách. */
  pickup?: number;
  difficulty: 1 | 2 | 3;
  hand: LessonHand;
  notes: LessonNote[];
  /** Phần đệm tay trái đánh cùng lúc với `notes` (chỉ ở bài khuông đôi); có phần đệm thì `notes` là giai điệu tay phải. */
  accompaniment?: AccompanimentNote[];
  /** Chữ đánh dấu đoạn (A, B…) như bản in. */
  sections?: LessonSection[];
  /** Dấu sắc thái (p, f…) đặt ở nốt `index` của `notes`, có hiệu lực tới dấu sau. */
  dynamics?: { index: number; mark: DynamicMark }[];
  /** To dần / nhỏ dần giữa hai dấu sắc thái (vẽ hình nêm, nghe mẫu tăng / giảm lực gõ dần). */
  hairpins?: Hairpin[];
  /** Ký hiệu pedal vang (xem `PedalMark`). */
  pedal?: PedalMark[];
  /** Pedal chỉ là gợi ý (bản Cơ bản): vẫn vẽ + nghe mẫu có ngân, nhưng không chấm pedal. */
  pedalOptional?: boolean;
  /** Ký hiệu hợp âm phía trên khuông (bật / tắt ở màn Luyện tập). */
  chordSymbols?: ChordSymbol[];
  /** Bản phối thuộc một bài nhiều cấp độ (`family` = mã bài chung, xem `lessons/arrangements`). */
  arrangement?: { family: string; level: ArrangementLevel };
  /** Khoảng nhịp độ tham khảo (♩/phút). */
  tempoRange?: [number, number];
  /** Bài là một đoạn cắt ra để luyện (ô `from`…`to` theo số in của bài gốc, ô lấy đà = 0). */
  slice?: { from: number; to: number };
  /** Tuyển tập khuông đôi: chỉ hiện ở trang Thư viện bài hát, không hiện trong Thư viện bài ở trang chủ. */
  repertoire?: boolean;
  /** Ghi chú nguồn gốc bản nhạc (bản quyền). */
  source?: string;
  /** Nhịp độ gợi ý cho chế độ chạy theo nhịp (nốt đen/phút); mặc định DEFAULT_TEMPO_BPM. */
  tempo?: number;
  /** Màu chữ đánh dấu tên bài khác biệt trong thư viện (lớp Tailwind hoặc mã màu CSS). */
  titleColor?: string;
}

/** Tay chơi một nốt của bài. */
export function noteHand(lesson: Pick<Lesson, 'hand'>, note: Pick<LessonNote, 'hand'>): Hand {
  return note.hand ?? (lesson.hand === 'left' ? 'left' : 'right');
}

/** Nốt hoà âm tay phải của một nốt (rỗng nếu đánh một nốt). */
export function harmonyMidis(note: Pick<LessonNote, 'harmony'>): number[] {
  return note.harmony?.map((h) => h.midi) ?? [];
}

/** Mọi phím của nốt / chùm nốt tay phải, thấp → cao (nốt giai điệu cuối cùng). */
export function chordMidis(note: Pick<LessonNote, 'harmony' | 'midi'>): number[] {
  return [...harmonyMidis(note), note.midi];
}

/** Bài có nốt hoà âm tay phải (chùm nốt). */
export function hasRightHarmony(lesson: Pick<Lesson, 'notes'>): boolean {
  return lesson.notes.some((n) => (n.harmony?.length ?? 0) > 0);
}

/**
 * Nốt thuộc phần đệm (thấp hơn mọi nốt giai điệu) ở bài có phần đệm → bỏ qua, không chấm sai:
 * đàn MIDI gửi cả nốt hợp âm tay trái, micro có thể nghe ra nốt trầm.
 */
export function isAccompanimentMidi(lesson: Pick<Lesson, 'notes' | 'accompaniment'>, midi: number): boolean {
  if (!lesson.accompaniment?.length) return false;
  return midi < Math.min(...lesson.notes.filter((n) => !n.rest).map((n) => n.midi));
}

/** Tay trái ở một bước (một nốt giai điệu) của bài có phần đệm. */
export interface LeftHandStep {
  /** Nốt cần đánh ở bước này (thấp → cao); rỗng nếu tay trái không đánh nốt mới. */
  pitches: string[];
  midis: number[];
  fingers: (Finger | undefined)[];
  /** Bước không đánh nốt mới: nốt/hợp âm tay trái đang giữ (ngân từ bước trước), rỗng nếu tay trái nghỉ. */
  held: string[];
}

/**
 * Tay trái ứng với từng nốt giai điệu (hướng dẫn hai tay + chấm hai tay): nốt/hợp âm đệm bắt đầu trong
 * khoảng [đầu nốt giai điệu i, đầu nốt i+1) thuộc về nốt i — hợp âm ngân qua nhiều nốt giai điệu chỉ đánh một lần.
 * Đệm bắt đầu lúc giai điệu đang ở dấu lặng → gộp vào nốt giai điệu kế tiếp (Wait Mode không chờ dấu lặng).
 * Bài không có phần đệm → `undefined`.
 */
export function accompanimentByNote(lesson: Pick<Lesson, 'notes' | 'accompaniment'>): LeftHandStep[] | undefined {
  if (!lesson.accompaniment?.length) return undefined;
  const EPS = 1e-9;
  const starts: number[] = [];
  let t = 0;
  for (const n of lesson.notes) {
    starts.push(t);
    t += DURATION_BEATS[n.duration];
  }
  const steps: LeftHandStep[] = lesson.notes.map(() => ({ pitches: [], midis: [], fingers: [], held: [] }));
  const chords: { start: number; end: number; chord: AccompanimentNote }[] = [];
  let at = 0;
  for (const chord of lesson.accompaniment) {
    const end = at + DURATION_BEATS[chord.duration];
    chords.push({ start: at, end, chord });
    // Bước đầu tiên bắt đầu sau hợp âm, không phải dấu lặng (hết bài thì lùi về nốt cuối không phải dấu lặng).
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= at + EPS) i++;
    let k = i;
    while (k < steps.length && lesson.notes[k].rest) k++;
    if (k >= steps.length) for (k = i; k > 0 && lesson.notes[k].rest; k--);
    steps[k].pitches.push(...chord.pitches);
    steps[k].midis.push(...chord.midis);
    steps[k].fingers.push(...chord.fingers);
    at = end;
  }
  steps.forEach((step, i) => {
    if (step.midis.length > 0) return;
    const sounding = chords.find((c) => c.start < starts[i] - EPS && c.end > starts[i] + EPS);
    if (sounding) step.held = [...sounding.chord.pitches];
  });
  return steps;
}

const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤'];

/** Chữ hiển thị số ngón tay: "3" hoặc "③". */
export function fingerText(finger: Finger, circled = false): string {
  return circled ? CIRCLED_DIGITS[finger - 1] : String(finger);
}

/** Chữ đánh dấu đoạn ở ô nhịp thứ `measureIndex` (chỉ số từ 0, gồm cả ô lấy đà). */
export function sectionAt(lesson: Pick<Lesson, 'sections' | 'pickup'>, measureIndex: number): string | undefined {
  const number = lesson.pickup ? measureIndex : measureIndex + 1;
  return lesson.sections?.find((s) => s.measure === number)?.label;
}

/** Nhịp độ chậm, vừa sức người mới học. */
export const DEFAULT_TEMPO_BPM = 72;

export function lessonTempo(lesson: Pick<Lesson, 'tempo'>): number {
  return lesson.tempo ?? DEFAULT_TEMPO_BPM;
}

/** Độ dài một ô nhịp đầy đủ, tính bằng nốt đen (3/8 → 1.5). */
export function measureLength([beats, beatValue]: Lesson['timeSignature']): number {
  return (beats * 4) / beatValue;
}
