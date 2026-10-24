/**
 * Chuyển đổi giữa tần số (Hz), MIDI note number và tên nốt khoa học (C4, F#3...).
 * Quy ước: MIDI 60 = C4 (Đô giữa), MIDI 69 = A4 = 440 Hz (mặc định).
 */

export const DEFAULT_A4 = 440;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SOLFEGE_NAMES = ['Đô', 'Đô#', 'Rê', 'Rê#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const;
const LETTER_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Phạm vi đàn piano 88 phím: A0 (21) → C8 (108). */
export const PIANO_MIN_MIDI = 21;
export const PIANO_MAX_MIDI = 108;

export type NoteLabelStyle = 'letter' | 'solfege';

export function midiToFrequency(midi: number, a4 = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI dạng số thực (vd 60.13), dùng để tính sai lệch cents. */
export function frequencyToMidiFloat(frequency: number, a4 = DEFAULT_A4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export interface NearestNote {
  midi: number;
  /** Sai lệch so với nốt gần nhất, trong khoảng [-50, 50]. Dương = cao hơn (sharp). */
  cents: number;
}

export function frequencyToNearestNote(frequency: number, a4 = DEFAULT_A4): NearestNote | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const exact = frequencyToMidiFloat(frequency, a4);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 1000) / 10 };
}

export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function midiToName(midi: number): string {
  return `${SHARP_NAMES[midiToPitchClass(midi)]}${midiToOctave(midi)}`;
}

export function midiToLabel(midi: number, style: NoteLabelStyle): string {
  if (style === 'letter') return midiToName(midi);
  return `${SOLFEGE_NAMES[midiToPitchClass(midi)]}${midiToOctave(midi)}`;
}

const LETTER_TO_SOLFEGE: Record<string, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/**
 * Tên nốt theo đúng cách viết trong bài ("Bb4" → "B♭4" / "Si♭4"), không quy về dấu thăng như `midiToLabel`
 * — nốt giáng trên khuông phải có tên giáng.
 */
export function pitchToLabel(pitch: string, style: NoteLabelStyle): string {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch);
  if (!m) throw new Error(`Tên nốt không hợp lệ: "${pitch}"`);
  const accidental = m[2] === 'b' ? '♭' : m[2];
  return `${style === 'letter' ? m[1] : LETTER_TO_SOLFEGE[m[1]]}${accidental}${m[3]}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midiToPitchClass(midi));
}

/** Phân tích tên nốt như "C4", "F#3", "Bb2". Trả về null nếu không hợp lệ. */
export function nameToMidi(name: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return null;
  const base = LETTER_TO_SEMITONE[m[1].toUpperCase()];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + base + accidental;
}

export function requireMidi(name: string): number {
  const midi = nameToMidi(name);
  if (midi === null) throw new Error(`Tên nốt không hợp lệ: "${name}"`);
  return midi;
}

/** Khoảng cách theo cents giữa hai tần số. */
export function centsBetween(f1: number, f2: number): number {
  return 1200 * Math.log2(f2 / f1);
}
