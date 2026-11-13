/**
 * Ghi một đoạn biểu diễn tự do để phát lại: CHỈ dữ liệu nốt (cao độ, lúc bắt đầu, thời gian giữ) — không ghi âm.
 */

export interface RecordedNote {
  midi: number;
  /** ms tính từ lúc bắt đầu ghi. */
  at: number;
  durationMs: number;
}

export const MAX_RECORD_MS = 30_000;
export const MAX_RECORD_NOTES = 120;
/** Nốt chưa thả khi dừng ghi → giữ tối đa chừng này. */
const MAX_NOTE_MS = 4000;

export function sanitizeRecording(raw: unknown): RecordedNote[] {
  if (!Array.isArray(raw)) return [];
  const out: RecordedNote[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    if (typeof r.midi !== 'number' || typeof r.at !== 'number' || typeof r.durationMs !== 'number') continue;
    if (!Number.isFinite(r.midi) || r.midi < 0 || r.midi > 127 || !(r.at >= 0) || r.at > MAX_RECORD_MS) continue;
    out.push({ midi: Math.round(r.midi), at: Math.round(r.at), durationMs: Math.round(Math.min(MAX_NOTE_MS, Math.max(30, r.durationMs))) });
    if (out.length >= MAX_RECORD_NOTES) break;
  }
  return out.sort((a, b) => a.at - b.at);
}

export class PerformanceRecorder {
  private startedAt: number | null = null;
  private notes: RecordedNote[] = [];
  private open = new Map<number, number>();

  start(now: number): void {
    this.startedAt = now;
    this.notes = [];
    this.open.clear();
  }

  isRecording(): boolean {
    return this.startedAt !== null;
  }

  /** Đủ thời lượng / số nốt → nên dừng. */
  isFull(now: number): boolean {
    return this.startedAt !== null && (now - this.startedAt >= MAX_RECORD_MS || this.notes.length >= MAX_RECORD_NOTES);
  }

  noteOn(midi: number, time: number): void {
    if (this.startedAt === null || this.open.has(midi) || this.notes.length + this.open.size >= MAX_RECORD_NOTES) return;
    this.open.set(midi, Math.max(0, time - this.startedAt));
  }

  noteOff(midi: number, time: number): void {
    if (this.startedAt === null) return;
    const at = this.open.get(midi);
    if (at === undefined) return;
    this.open.delete(midi);
    this.notes.push({ midi, at, durationMs: Math.min(MAX_NOTE_MS, Math.max(30, time - this.startedAt - at)) });
  }

  /** Dừng ghi; nốt còn giữ được đóng tại `now`. */
  stop(now: number): RecordedNote[] {
    if (this.startedAt === null) return [];
    for (const midi of [...this.open.keys()]) this.noteOff(midi, now);
    this.startedAt = null;
    return sanitizeRecording(this.notes);
  }
}

/** Tổng thời lượng phát lại (ms). */
export function recordingLength(notes: readonly RecordedNote[]): number {
  return notes.reduce((m, n) => Math.max(m, n.at + n.durationMs), 0);
}
