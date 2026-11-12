/**
 * Sinh câu hỏi "Đố bé nốt gì?": mỗi câu có ĐÚNG MỘT ô khớp yêu cầu, mọi ô là hình nốt khác nhau.
 *
 * - Cao độ: mọi ô cùng trường độ, mỗi ô một TÊN nốt khác nhau (hai quãng tám không bao giờ có hai ô "Đô").
 * - Trường độ: mọi ô cùng cao độ, mỗi ô một trường độ.
 * - Kết hợp: mỗi ô một cặp (tên, trường độ) khác nhau; có ô cùng tên khác trường độ và ô cùng trường độ khác tên
 *   (hai kiểu nhầm hay gặp nhất) khi đủ ô.
 * Đáp án nhiễu: ưu tiên nốt / trường độ bé đang học, thiếu thì lấy nốt gần trên khuông / trường độ liền kề.
 * Câu chọn theo trọng số (`weight`, từ thống kê lỗi) → nốt bé hay sai được hỏi lại nhiều hơn.
 */
import { effectiveChoices, type NoteQuizSettings, type QuizMode } from './config';
import { clefPitches, diatonic, letterOf, LETTERS, QUIZ_CLEFS, QUIZ_DURATIONS, type Letter, type QuizClef, type QuizDuration } from './staff';

export type Random = () => number;

export interface QuizOption {
  midi: number;
  letter: Letter;
  duration: QuizDuration;
}

export interface QuizQuestion {
  mode: QuizMode;
  clef: QuizClef;
  /** Tên nốt cô hỏi (Cao độ / Kết hợp). */
  letter: Letter | null;
  /** Trường độ cô hỏi (Trường độ / Kết hợp). */
  duration: QuizDuration | null;
  options: QuizOption[];
  /** Chỉ số ô đúng. */
  answer: number;
}

/** Ô có khớp yêu cầu của câu không. */
export function matches(q: Pick<QuizQuestion, 'letter' | 'duration'>, o: QuizOption): boolean {
  return (q.letter === null || o.letter === q.letter) && (q.duration === null || o.duration === q.duration);
}

/** Khoá thống kê của phần được hỏi: "p:treble:C" (tên nốt theo khoá), "d:w" (trường độ). */
export function itemKeys(q: Pick<QuizQuestion, 'clef' | 'letter' | 'duration'>): string[] {
  const out: string[] = [];
  if (q.letter) out.push(pitchKey(q.clef, q.letter));
  if (q.duration) out.push(durationKey(q.duration));
  return out;
}
export const pitchKey = (clef: QuizClef, letter: Letter) => `p:${clef}:${letter}`;
export const durationKey = (d: QuizDuration) => `d:${d}`;

function shuffle<T>(list: readonly T[], rnd: Random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickOne = <T>(list: readonly T[], rnd: Random): T => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];

function weighted<T>(list: readonly T[], weightOf: (x: T) => number, rnd: Random): T {
  const w = list.map((x) => Math.max(0.01, weightOf(x)));
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= w[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

/** Nốt có tên `letter` trong dải, gần `near` nhất (không có `near` → ngẫu nhiên). */
function pitchFor(letter: Letter, pitches: readonly number[], rnd: Random, near?: number): number {
  const own = pitches.filter((m) => letterOf(m) === letter);
  if (near === undefined) return pickOne(own, rnd);
  return [...own].sort((a, b) => Math.abs(diatonic(a) - diatonic(near)) - Math.abs(diatonic(b) - diatonic(near)))[0];
}

/** Tên nốt làm đáp án nhiễu: nốt đang học trước (ngẫu nhiên), rồi nốt khác gần trên khuông. */
function distractorLetters(target: Letter, targetMidi: number, selected: readonly Letter[], pitches: readonly number[], rnd: Random): Letter[] {
  const others = LETTERS.filter((l) => l !== target);
  const learning = shuffle(
    others.filter((l) => selected.includes(l)),
    rnd,
  );
  const dist = (l: Letter) => Math.abs(diatonic(pitchFor(l, pitches, rnd, targetMidi)) - diatonic(targetMidi));
  const rest = shuffle(
    others.filter((l) => !selected.includes(l)),
    rnd,
  ).sort((a, b) => dist(a) - dist(b));
  return [...learning, ...rest];
}

/** Trường độ làm đáp án nhiễu: trường độ đang học trước, rồi trường độ liền kề. */
function distractorDurations(target: QuizDuration, selected: readonly QuizDuration[], rnd: Random): QuizDuration[] {
  const others = QUIZ_DURATIONS.filter((d) => d !== target);
  const idx = (d: QuizDuration) => QUIZ_DURATIONS.indexOf(d);
  const learning = shuffle(
    others.filter((d) => selected.includes(d)),
    rnd,
  );
  const rest = shuffle(
    others.filter((d) => !selected.includes(d)),
    rnd,
  ).sort((a, b) => Math.abs(idx(a) - idx(target)) - Math.abs(idx(b) - idx(target)));
  return [...learning, ...rest];
}

export interface QuestionOptions {
  /** Trọng số theo khoá thống kê (`itemKeys`); mặc định 1. */
  weight?: (key: string) => number;
  /** Câu vừa hỏi — tránh hỏi lại y hệt khi còn lựa chọn khác. */
  previous?: QuizQuestion | null;
}

const sameAsk = (a: QuizQuestion, b: QuizQuestion | null | undefined) => !!b && a.clef === b.clef && a.letter === b.letter && a.duration === b.duration;

export function makeQuestion(settings: NoteQuizSettings, rnd: Random, opts: QuestionOptions = {}): QuizQuestion {
  // Còn cách hỏi khác thì không hỏi lặp lại câu vừa rồi.
  let q = buildQuestion(settings, rnd, opts.weight ?? (() => 1));
  for (let i = 0; i < 6 && sameAsk(q, opts.previous); i++) q = buildQuestion(settings, rnd, opts.weight ?? (() => 1));
  return q;
}

function buildQuestion(s: NoteQuizSettings, rnd: Random, weight: (key: string) => number): QuizQuestion {
  const mode = s.mode;
  const clef: QuizClef = s.clef === 'mixed' ? pickOne(QUIZ_CLEFS, rnd) : s.clef;
  const pitches = clefPitches(clef, s.octaves);
  const n = effectiveChoices(s);
  const options: QuizOption[] = [];
  let letter: Letter | null = null;
  let duration: QuizDuration | null = null;

  if (mode === 'pitch') {
    letter = weighted(s.letters, (l) => weight(pitchKey(clef, l)), rnd);
    const midi = pitchFor(letter, pitches, rnd);
    const shared = pickOne(s.durations, rnd);
    options.push({ midi, letter, duration: shared });
    for (const l of distractorLetters(letter, midi, s.letters, pitches, rnd).slice(0, n - 1)) {
      options.push({ midi: pitchFor(l, pitches, rnd, midi), letter: l, duration: shared });
    }
  } else if (mode === 'duration') {
    duration = weighted(s.durations, (d) => weight(durationKey(d)), rnd);
    const midi = pitchFor(pickOne(s.letters, rnd), pitches, rnd);
    options.push({ midi, letter: letterOf(midi), duration });
    for (const d of distractorDurations(duration, s.durations, rnd).slice(0, n - 1)) options.push({ midi, letter: letterOf(midi), duration: d });
  } else {
    // Kết hợp: chọn theo trọng số của cả tên lẫn trường độ.
    const pairs = s.letters.flatMap((l) => s.durations.map((d) => [l, d] as const));
    const [tl, td] = weighted(pairs, ([l, d]) => (weight(pitchKey(clef, l)) + weight(durationKey(d))) / 2, rnd);
    letter = tl;
    duration = td;
    const midi = pitchFor(tl, pitches, rnd);
    options.push({ midi, letter: tl, duration: td });
    const letters = distractorLetters(tl, midi, s.letters, pitches, rnd);
    const durations = distractorDurations(td, s.durations, rnd);
    const used = new Set([`${tl}${td}`]);
    const add = (l: Letter, d: QuizDuration) => {
      if (options.length >= n || used.has(`${l}${d}`)) return;
      used.add(`${l}${d}`);
      options.push({ midi: l === tl ? midi : pitchFor(l, pitches, rnd, midi), letter: l, duration: d });
    };
    // Hai kiểu nhầm hay gặp: cùng tên khác trường độ, cùng trường độ khác tên (2 ô thì ngẫu nhiên một kiểu).
    const kinds = shuffle([() => add(tl, durations[0]), () => add(letters[0], td)], rnd);
    kinds.forEach((k) => k());
    // Còn thiếu: cặp khác cả hai trước (giống ví dụ "Mi Đen"), rồi tới các cặp còn lại.
    const differ = shuffle(
      letters.slice(0, 4).flatMap((l) => durations.slice(0, 3).map((d) => [l, d] as const)),
      rnd,
    );
    for (const [l, d] of differ) add(l, d);
    for (const d of durations) add(tl, d);
    for (const l of letters) add(l, td);
    for (const l of letters) for (const d of durations) add(l, d);
  }

  const shuffled = shuffle(options, rnd);
  const target = options[0];
  return { mode, clef, letter, duration, options: shuffled, answer: shuffled.indexOf(target) };
}

/** Câu hỏi của một lượt (tránh hai câu liền nhau hỏi y hệt). */
export function makeRound(settings: NoteQuizSettings, rnd: Random, weight?: (key: string) => number): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (let i = 0; i < settings.questions; i++) out.push(makeQuestion(settings, rnd, { weight, previous: out[i - 1] ?? null }));
  return out;
}

/** Bộ sinh số ngẫu nhiên có hạt giống (test, chơi lại cùng đề). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Câu tương tự sau khi cô phải chỉ đáp án: cùng khoá + cùng yêu cầu (tên / trường độ), đáp án nhiễu và vị trí ô sinh lại.
 * Không sinh được câu khác hơn → đảo lại thứ tự ô của câu cũ.
 */
export function similarQuestion(q: QuizQuestion, settings: NoteQuizSettings, rnd: Random): QuizQuestion {
  const s: NoteQuizSettings = {
    ...settings,
    clef: q.clef,
    letters: q.letter ? [q.letter] : settings.letters,
    durations: q.duration ? [q.duration] : settings.durations,
  };
  for (let i = 0; i < 8; i++) {
    const c = buildQuestion({ ...s, letters: q.letter ? [...new Set([q.letter, ...settings.letters])] : s.letters, durations: q.duration ? [...new Set([q.duration, ...settings.durations])] : s.durations }, rnd, (k) => (k === pitchKey(q.clef, q.letter!) || k === durationKey(q.duration!) ? 1e6 : 1));
    if (c.letter === q.letter && c.duration === q.duration && c.answer !== q.answer) return c;
  }
  const options = shuffle(q.options, rnd);
  return { ...q, options, answer: options.indexOf(q.options[q.answer]) };
}
