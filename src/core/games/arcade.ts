/**
 * Trò chơi tự do ở mục Trò chơi (không gắn với buổi học): mỗi trò có vài mức chơi soạn sẵn.
 * Kỷ lục lưu ở localStorage theo hồ sơ người học, khoá `<kind>:<variantId>`; trò gắn với buổi học vẫn lưu
 * ở `LessonRecord.games` như trò sau buổi.
 */
import type { GameRecord } from '../curriculum/progress';
import { keyboardFor, type ArcadeGameSpec } from './gameForLesson';

export type ArcadeKind = ArcadeGameSpec['kind'];
export const ARCADE_KINDS: readonly ArcadeKind[] = ['note-sprint', 'ear-finder', 'interval-detective', 'steady-beat'];

export interface ArcadeVariant {
  id: string;
  label: string;
  /** Chú thích nội dung mức chơi. */
  description: string;
  spec: ArcadeGameSpec;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const whites = (from: number, to: number) => range(from, to).filter((m) => ![1, 3, 6, 8, 10].includes(m % 12));

const sprint = (clef: 'treble' | 'bass', notes: number[]): ArcadeVariant['spec'] => ({ kind: 'note-sprint', keyboard: keyboardFor(notes), clef, notes });
const ear = (notes: number[]): ArcadeVariant['spec'] => ({ kind: 'ear-finder', keyboard: keyboardFor(notes), notes, reference: 60 });

export const ARCADE_VARIANTS: Record<ArcadeKind, readonly ArcadeVariant[]> = {
  'note-sprint': [
    { id: 'treble-5', label: 'Khuông Sol · 5 nốt', description: 'Đô4 → Sol4, thế tay Đô', spec: sprint('treble', whites(60, 67)) },
    { id: 'treble-white', label: 'Khuông Sol · rộng', description: 'Đô4 → La5, cả dòng kẻ phụ trên', spec: sprint('treble', whites(60, 81)) },
    { id: 'bass-white', label: 'Khuông Fa', description: 'Fa2 → Đô4, cả Đô giữa', spec: sprint('bass', whites(41, 60)) },
  ],
  'ear-finder': [
    { id: 'c-five', label: '5 nốt Đô – Sol', description: 'Đô4 → Sol4, phím trắng', spec: ear(whites(60, 67)) },
    { id: 'c-octave', label: 'Quãng 8 Đô', description: 'Đô4 → Đô5, phím trắng', spec: ear(whites(60, 72)) },
    { id: 'chromatic', label: 'Cả phím đen', description: 'Đô4 → Si4, đủ 12 nửa cung', spec: ear(range(60, 71)) },
  ],
  'interval-detective': [
    { id: 'steps-up', label: 'Quãng 2 – 3 đi lên', description: 'Quãng 2, quãng 3 (trưởng, thứ) từ nốt gốc lên', spec: { kind: 'interval-detective', keyboard: { from: 60, to: 83 }, intervals: [1, 2, 3, 4], directions: ['up'] } },
    { id: 'to-fifth', label: 'Tới quãng 5, lên & xuống', description: 'Quãng 2 → quãng 5 đúng, cả hai hướng', spec: { kind: 'interval-detective', keyboard: { from: 48, to: 83 }, intervals: [2, 3, 4, 5, 7], directions: ['up', 'down'] } },
    { id: 'all', label: 'Mọi quãng', description: 'Quãng 2 thứ → quãng 8 đúng, cả hai hướng', spec: { kind: 'interval-detective', keyboard: { from: 48, to: 83 }, intervals: range(1, 12), directions: ['up', 'down'] } },
  ],
  'steady-beat': [
    { id: 'bpm-60', label: 'Chậm · 60 BPM', description: '8 phách có metronome, tự giữ 12 phách', spec: { kind: 'steady-beat', bpm: 60, silentBeats: 12 } },
    { id: 'bpm-80', label: 'Vừa · 80 BPM', description: '8 phách có metronome, tự giữ 16 phách', spec: { kind: 'steady-beat', bpm: 80, silentBeats: 16 } },
    { id: 'bpm-100', label: 'Nhanh · 100 BPM', description: '8 phách có metronome, tự giữ 20 phách', spec: { kind: 'steady-beat', bpm: 100, silentBeats: 20 } },
  ],
};

export function isArcadeKind(kind: string): kind is ArcadeKind {
  return (ARCADE_KINDS as readonly string[]).includes(kind);
}

export function arcadeKey(kind: ArcadeKind, variantId: string): string {
  return `${kind}:${variantId}`;
}

export type ArcadeRecords = Record<string, GameRecord>;

export function applyArcadeResult(records: ArcadeRecords, key: string, result: { score: number; stars: number }): ArcadeRecords {
  const prev = records[key];
  return {
    ...records,
    [key]: { plays: (prev?.plays ?? 0) + 1, bestScore: Math.max(prev?.bestScore ?? 0, result.score), bestStars: Math.max(prev?.bestStars ?? 0, Math.min(3, result.stars)) },
  };
}

/** Kỷ lục tốt nhất của một trò qua mọi mức chơi. */
export function bestOfKind(records: ArcadeRecords, kind: ArcadeKind): GameRecord | undefined {
  const all = ARCADE_VARIANTS[kind].map((v) => records[arcadeKey(kind, v.id)]).filter((r): r is GameRecord => !!r);
  if (all.length === 0) return undefined;
  return { plays: all.reduce((a, r) => a + r.plays, 0), bestScore: Math.max(...all.map((r) => r.bestScore)), bestStars: Math.max(...all.map((r) => r.bestStars)) };
}

/** Đọc dữ liệu lưu (có thể hỏng / bản cũ) → chỉ giữ bản ghi hợp lệ. */
export function sanitizeArcadeRecords(raw: unknown): ArcadeRecords {
  const out: ArcadeRecords = {};
  if (!raw || typeof raw !== 'object') return out;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    out[k] = { plays: num(r.plays), bestScore: num(r.bestScore), bestStars: Math.min(3, num(r.bestStars)) };
  }
  return out;
}

const storageKey = (profileKey: string) => `vietpiano-arcade:${profileKey}`;

export function loadArcadeRecords(profileKey: string): ArcadeRecords {
  try {
    const raw = localStorage.getItem(storageKey(profileKey));
    return raw ? sanitizeArcadeRecords(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveArcadeRecords(profileKey: string, records: ArcadeRecords): void {
  try {
    localStorage.setItem(storageKey(profileKey), JSON.stringify(records));
  } catch {
    // bộ nhớ đầy / chế độ riêng tư — chỉ mất kỷ lục
  }
}
