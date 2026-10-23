/**
 * NoteStatsCollector — thống kê từng nốt trong một phiên, suy ra từ chuỗi PracticeState
 * (không can thiệp PracticeEngine):
 *  - Tốc độ đọc nốt: từ lúc nốt trở thành nốt cần đánh tới lần đánh ĐẦU TIÊN (đúng hay sai).
 *    Nốt đầu bài không đo (chưa có mốc thời gian); khoảng > MAX_READING_MS coi là đang làm việc khác.
 *  - Nốt hay sai: số lần đánh đúng / sai theo nốt cần đánh, và nốt đã đánh nhầm sang.
 */
import type { PracticeState } from './PracticeEngine';

export const MAX_READING_MS = 10_000;

export interface NoteTally {
  /** Nốt cần đánh (MIDI). */
  midi: number;
  hits: number;
  misses: number;
  /** Nốt đã đánh nhầm → số lần (khoá là MIDI dạng chuỗi để lưu IndexedDB/JSON). */
  confusions: Record<string, number>;
}

export interface SessionNoteStats {
  reading: { totalMs: number; count: number };
  notes: NoteTally[];
}

export class NoteStatsCollector {
  private prev: PracticeState | null = null;
  /** Thời điểm nốt hiện tại bắt đầu được chờ; null = chưa có mốc. */
  private since: number | null = null;
  private attempted = false;
  private readingTotal = 0;
  private readingCount = 0;
  private tallies = new Map<number, NoteTally>();

  update(s: PracticeState): void {
    const prev = this.prev;
    this.prev = s;
    if (s.startedAt === null) {
      // Chơi lại từ đầu → phiên mới.
      this.reset();
      this.prev = s;
      return;
    }
    if (!prev) return;

    const isAttempt = s.correct > prev.correct || s.wrong > prev.wrong;
    if (isAttempt) {
      if (!this.attempted && this.since !== null) {
        const dt = s.lastEventTime - this.since;
        if (dt > 0 && dt <= MAX_READING_MS) {
          this.readingTotal += dt;
          this.readingCount++;
        }
      }
      this.attempted = true;
      const expected = prev.expected[prev.index];
      const t = this.tally(expected);
      if (s.wrong > prev.wrong) {
        t.misses++;
        if (s.lastPlayedMidi !== null) t.confusions[s.lastPlayedMidi] = (t.confusions[s.lastPlayedMidi] ?? 0) + 1;
      } else {
        t.hits++;
      }
    }
    // Sang nốt mới (đánh đúng, bỏ qua, quay lại) → bắt đầu chờ nốt đó.
    if (s.index !== prev.index || (!isAttempt && s.lastEventTime !== prev.lastEventTime)) {
      this.since = s.lastEventTime;
      this.attempted = false;
    }
  }

  result(): SessionNoteStats {
    return {
      reading: { totalMs: Math.round(this.readingTotal), count: this.readingCount },
      notes: [...this.tallies.values()].map((t) => ({ ...t, confusions: { ...t.confusions } })),
    };
  }

  reset(): void {
    this.prev = null;
    this.since = null;
    this.attempted = false;
    this.readingTotal = 0;
    this.readingCount = 0;
    this.tallies = new Map();
  }

  private tally(midi: number): NoteTally {
    let t = this.tallies.get(midi);
    if (!t) this.tallies.set(midi, (t = { midi, hits: 0, misses: 0, confusions: {} }));
    return t;
  }
}

/** Gộp thống kê nốt của nhiều phiên. */
export function mergeNoteTallies(lists: readonly (readonly NoteTally[] | undefined)[]): NoteTally[] {
  const map = new Map<number, NoteTally>();
  for (const list of lists) {
    for (const t of list ?? []) {
      const m = map.get(t.midi) ?? { midi: t.midi, hits: 0, misses: 0, confusions: {} };
      m.hits += t.hits;
      m.misses += t.misses;
      for (const [k, n] of Object.entries(t.confusions)) m.confusions[k] = (m.confusions[k] ?? 0) + n;
      map.set(t.midi, m);
    }
  }
  return [...map.values()];
}
