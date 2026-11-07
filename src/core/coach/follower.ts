/**
 * Bám vị trí khi đang ghi (con trỏ khuông nhạc + "ô hiện tại") — nhẹ, chạy trên từng Note On, KHÔNG phải bộ chấm:
 * con trỏ nhảy tới nhóm nốt kế tiếp (trong `lookahead` nhóm) có chứa phím vừa đánh; đánh đủ các phím của nhóm → sang nhóm sau.
 * Phím không khớp nhóm nào gần đó → đứng yên (người chơi đánh sai / thừa). Kết quả chấm cuối cùng do Scoring Engine căn chỉnh lại toàn bộ.
 */
import type { ScoreReference } from './types';

export class ScoreFollower {
  private pointer = 0;
  private hits = new Map<number, Set<number>>();
  private readonly pitches: number[][];

  constructor(
    private readonly ref: ScoreReference,
    private readonly lookahead = 3,
  ) {
    this.pitches = ref.groups.map((g) => g.notes.map((i) => ref.notes[i].midi));
  }

  reset(): void {
    this.pointer = 0;
    this.hits.clear();
  }

  /** Nhóm đang chờ (đã hết bài → nhóm cuối). */
  get group(): number {
    return Math.min(this.pointer, Math.max(0, this.ref.groups.length - 1));
  }

  get finished(): boolean {
    return this.pointer >= this.ref.groups.length;
  }

  get measure(): number {
    return this.ref.groups[this.group]?.measure ?? this.ref.printedMeasures[0] ?? 1;
  }

  handle(midi: number): number {
    const last = Math.min(this.ref.groups.length - 1, this.pointer + this.lookahead);
    for (let g = this.pointer; g <= last; g++) {
      if (!this.pitches[g].includes(midi)) continue;
      const set = this.hits.get(g) ?? new Set<number>();
      if (set.has(midi) && g === this.pointer) continue;
      set.add(midi);
      this.hits.set(g, set);
      this.pointer = set.size >= new Set(this.pitches[g]).size ? g + 1 : g;
      break;
    }
    return this.group;
  }

  /** Chỉ số nốt trên khuông cho con trỏ của ScoreView (`staff`: giai điệu nếu bài có, không thì phần đệm). */
  cursor(): { staff: 'melody' | 'accompaniment'; index: number } {
    return cursorAt(this.ref, this.ref.groups[this.group]?.onsetBeat ?? 0);
  }
}

/** Nốt trên khuông đang ở phách `beat` (nốt bắt đầu muộn nhất ≤ beat) — dùng cho con trỏ lúc ghi và lúc phát lại. */
export function cursorAt(ref: ScoreReference, beat: number): { staff: 'melody' | 'accompaniment'; index: number } {
  const staff = ref.notes.some((n) => n.staff === 'melody') ? 'melody' : 'accompaniment';
  let best = -1;
  let bestBeat = -Infinity;
  for (const n of ref.notes) {
    if (n.staff !== staff || n.onsetBeat > beat + 1e-9) continue;
    if (n.onsetBeat > bestBeat || (n.onsetBeat === bestBeat && n.scoreIndex < best)) {
      best = n.scoreIndex;
      bestBeat = n.onsetBeat;
    }
  }
  if (best < 0) best = ref.notes.find((n) => n.staff === staff)?.scoreIndex ?? 0;
  return { staff, index: best };
}
