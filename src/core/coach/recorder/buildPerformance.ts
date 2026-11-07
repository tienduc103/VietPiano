/**
 * Log gốc → dữ liệu biểu diễn đã ghép (nốt, pedal, ngân) để chấm. Hàm thuần, KHÔNG sửa log.
 *
 * Hiệu chỉnh chỉ áp ở đây:
 *  1. Đồng hồ: mốc của driver MIDI có thể lệch performance.now() (Windows, Bluetooth) → độ lệch = trung vị (rt − t) của sự kiện
 *     MIDI; mốc dao động mạnh (> 30 ms) → dùng mốc nhận. Bàn phím ảo / micro: mốc đã là performance.now().
 *  2. Tạm dừng: bỏ khoảng [pause, resume] khỏi trục thời gian ("thời gian hoạt động") → không thành chỗ ngắt nhịp giả.
 *  3. Bù trễ nguồn (`latencyMs`, micro 60 ms).
 *
 * Ghép nốt theo (nguồn, cổng, kênh, phím):
 *  - Note On lặp khi phím chưa thả (đánh chồng cùng nốt) → đóng nốt cũ tại onset mới (`retrigger`), nốt mới `retriggered`.
 *  - Note Off không có Note On (vd phím vừa bấm nút "Bắt đầu") → bỏ, đếm `orphanOffs`.
 *  - Hợp âm / nhả lệch thứ tự: mỗi phím một hàng chờ riêng nên thứ tự nhả không ảnh hưởng.
 *  - Còn giữ phím lúc dừng ghi → `offMs` = null, `heldAtLeastMs`; Note Off do lớp MIDI phát hộ khi rút đàn → `disconnect`, không đo.
 * Pedal (CC 64 vang, 66 sostenuto, 67 mềm): giữ giá trị 0–127; đạp = ≥ 64. Note Off không phải lúc tiếng tắt:
 * thả phím khi pedal vang đang đạp → ngân tới lúc nhả pedal; sostenuto giữ các nốt đang giữ phím lúc đạp.
 */
import type { BuiltPerformance, ClockModel, NoteEnd, PedalChange, PedalTrack, PerformanceEvent, PerformanceNote, RecordedSession } from '../types';

export interface BuildOptions {
  /** Ghi đè độ trễ của phiên (ms). */
  latencyMs?: number;
}

/** Độ dao động mốc nguồn tối đa vẫn tin được (ms). */
export const CLOCK_JITTER_LIMIT_MS = 30;
/** Note Off trong khoảng này trước / sau mốc mất kết nối = do lớp MIDI thả hộ. */
const DISCONNECT_WINDOW_BEFORE_MS = 60;
const DISCONNECT_WINDOW_AFTER_MS = 5;
const PEDAL_THRESHOLD = 64;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ước lượng đồng hồ của các sự kiện MIDI. */
export function estimateClock(events: readonly PerformanceEvent[]): ClockModel {
  const diffs = events.filter((e) => e.k !== 'mark' && e.src === 'midi').map((e) => e.rt - e.t);
  if (!diffs.length) return { basis: 'source', offsetMs: 0, jitterMs: 0 };
  const offset = median(diffs);
  const jitter = median(diffs.map((d) => Math.abs(d - offset)));
  if (jitter > CLOCK_JITTER_LIMIT_MS) return { basis: 'receive', offsetMs: 0, jitterMs: jitter };
  return { basis: 'source', offsetMs: offset, jitterMs: jitter };
}

/** Mốc dùng để phân tích (trước khi bỏ tạm dừng). */
export function eventTime(e: PerformanceEvent, clock: ClockModel): number {
  if (e.k === 'mark' || e.src !== 'midi') return e.t;
  return clock.basis === 'receive' ? e.rt : e.t + clock.offsetMs;
}

/** Bỏ khoảng tạm dừng: mốc trong lúc tạm dừng dồn về đầu khoảng. */
export function activeTimeMapper(paused: readonly { from: number; to: number }[]): (t: number) => number {
  const sorted = [...paused].sort((a, b) => a.from - b.from);
  return (t: number) => {
    let shift = 0;
    for (const p of sorted) {
      if (t >= p.to) shift += p.to - p.from;
      else if (t > p.from) return p.from - shift;
      else break;
    }
    return t - shift;
  };
}

interface OpenNote {
  note: PerformanceNote;
  /** Mốc tuyệt đối (trước khi bỏ tạm dừng) để so với mốc mất kết nối. */
  rawOn: number;
}

function emptyTrack(controller: 64 | 66 | 67): PedalTrack {
  return { controller, changes: [], intervals: [], continuous: false, initialDown: false };
}

function finishTrack(track: PedalTrack, endMs: number): PedalTrack {
  // Tín hiệu đầu tiên là "nhả" và đang giảm (không phải half-pedal bắt đầu đạp từ giá trị thấp) → pedal đã đạp từ trước khi ghi.
  const [first, second] = track.changes;
  const inferred = !!first && first.value < PEDAL_THRESHOLD && (!second || second.value <= first.value);
  const initialDown = track.initialDown || inferred;
  let downAt: number | null = initialDown ? 0 : null;
  const intervals: PedalTrack['intervals'] = [];
  for (const c of track.changes) {
    const down = c.value >= PEDAL_THRESHOLD;
    if (down && downAt === null) downAt = c.t;
    else if (!down && downAt !== null) {
      intervals.push({ down: downAt, up: c.t });
      downAt = null;
    }
  }
  if (downAt !== null) intervals.push({ down: downAt, up: null });
  const distinct = new Set(track.changes.map((c) => c.value));
  return { ...track, initialDown, intervals, continuous: distinct.size > 2, changes: track.changes.filter((c) => c.t <= endMs + 1e-6) };
}

/** Khoảng đạp chứa thời điểm `t` (đạp ≤ t < nhả). */
function intervalAt(track: PedalTrack, t: number): PedalTrack['intervals'][number] | undefined {
  return track.intervals.find((iv) => iv.down <= t + 1e-9 && (iv.up === null || iv.up > t + 1e-9));
}

export function buildPerformance(rec: RecordedSession, opts: BuildOptions = {}): BuiltPerformance {
  const latency = opts.latencyMs ?? rec.session.latencyMs ?? 0;
  const clock = estimateClock(rec.events);
  // Thứ tự phân tích: theo mốc đã hiệu chỉnh, cùng mốc giữ thứ tự nhận.
  const ordered = rec.events
    .map((e, index) => ({ e, index, time: eventTime(e, clock) }))
    .sort((a, b) => a.time - b.time || a.index - b.index);

  // Khoảng tạm dừng theo mốc (đánh dấu do app ghi, cùng đồng hồ performance.now()).
  const pausedIntervals: { from: number; to: number }[] = [];
  let pauseFrom: number | null = null;
  let stopAt: number | null = null;
  for (const { e } of ordered) {
    if (e.k !== 'mark') continue;
    if (e.m === 'pause' && pauseFrom === null) pauseFrom = e.t;
    else if (e.m === 'resume' && pauseFrom !== null) {
      pausedIntervals.push({ from: pauseFrom, to: e.t });
      pauseFrom = null;
    } else if ((e.m === 'stop' || e.m === 'abort') && stopAt === null) stopAt = e.t;
  }
  const lastTime = ordered.length ? ordered[ordered.length - 1].time : 0;
  const rawEnd = stopAt ?? lastTime;
  if (pauseFrom !== null) pausedIntervals.push({ from: pauseFrom, to: Math.max(pauseFrom, rawEnd) });
  const active = activeTimeMapper(pausedIntervals);
  const endMs = active(rawEnd);
  const disconnectMarks = ordered.filter((o) => o.e.k === 'mark' && o.e.m === 'disconnect').map((o) => o.time);

  const sustain = emptyTrack(64);
  const sostenuto = emptyTrack(66);
  const soft = emptyTrack(67);
  const tracks: Record<number, PedalTrack> = { 64: sustain, 66: sostenuto, 67: soft };
  let sustainSeen = false;
  let orphanOffs = 0;

  const open = new Map<string, OpenNote>();
  const done: { note: PerformanceNote; rawOff: number | null; rawOn: number }[] = [];
  const close = (key: string, rawOff: number | null, end: NoteEnd) => {
    const o = open.get(key);
    if (!o) return false;
    open.delete(key);
    const off = rawOff === null ? null : Math.max(o.note.onMs, active(rawOff) - latency);
    o.note.offMs = off;
    o.note.endedBy = end;
    o.note.heldMs = off === null ? null : off - o.note.onMs;
    done.push({ note: o.note, rawOff, rawOn: o.rawOn });
    return true;
  };

  ordered.forEach(({ e, index, time }) => {
    switch (e.k) {
      case 'mark':
        if (e.m === 'pedal-initial') sustain.initialDown = true;
        return;
      case 'cc': {
        if (e.c === 64) sustainSeen = true;
        const track = tracks[e.c];
        if (track) {
          track.changes.push({ t: active(time), value: e.v } satisfies PedalChange);
        } else if (e.c === 120 || e.c === 123) {
          for (const [key, o] of [...open]) if (o.note.channel === e.ch && o.note.source === e.src) close(key, time, 'release');
        }
        return;
      }
      case 'on': {
        if (e.p) return; // nhận lúc tạm dừng: giữ trong log, không chấm
        const key = noteKey(e);
        const onMs = active(time) - latency;
        // Micro không báo thả phím: mỗi nốt đứng riêng, không đo trường độ.
        const prev = e.src === 'microphone' ? undefined : open.get(key);
        if (prev) close(key, time, 'retrigger');
        const note: PerformanceNote = {
          id: -1,
          midi: e.n,
          onMs,
          offMs: null,
          endedBy: 'stop',
          heldMs: null,
          soundingEndMs: null,
          releasedUnderPedal: false,
          velocity: e.v,
          channel: e.ch,
          source: e.src,
          eventIndex: index,
          ...(e.lv !== undefined ? { level: e.lv } : {}),
          ...(prev ? { retriggered: true } : {}),
        };
        if (e.src === 'microphone') done.push({ note, rawOff: null, rawOn: time });
        else open.set(key, { note, rawOn: time });
        return;
      }
      case 'off': {
        if (!close(noteKey(e), time, 'release')) orphanOffs++;
        return;
      }
    }
  });
  for (const [key] of [...open]) close(key, null, 'stop');

  const sustainTrack = finishTrack(sustain, endMs);
  const sostenutoTrack = finishTrack(sostenuto, endMs);
  const softTrack = finishTrack(soft, endMs);

  for (const d of done) {
    const n = d.note;
    // Lớp MIDI thả hộ phím còn giữ khi rút đàn → lúc thả không phải của người chơi.
    if (d.rawOff !== null && n.endedBy === 'release' && disconnectMarks.some((m) => d.rawOff! >= m - DISCONNECT_WINDOW_BEFORE_MS && d.rawOff! <= m + DISCONNECT_WINDOW_AFTER_MS)) {
      n.endedBy = 'disconnect';
      n.heldAtLeastMs = n.heldMs ?? undefined;
      n.heldMs = null;
      n.offMs = null;
    }
    if (n.offMs === null && n.endedBy === 'stop' && n.source !== 'microphone') n.heldAtLeastMs = Math.max(0, endMs - n.onMs);
    if (n.offMs !== null) {
      const iv = intervalAt(sustainTrack, n.offMs);
      n.releasedUnderPedal = !!iv;
      let end = iv ? (iv.up ?? endMs) : n.offMs;
      // Sostenuto: giữ nốt đang giữ phím lúc đạp.
      for (const s of sostenutoTrack.intervals) {
        if (n.onMs <= s.down + 1e-9 && n.offMs > s.down) end = Math.max(end, s.up ?? endMs);
      }
      n.soundingEndMs = end;
    }
    if (intervalAt(softTrack, n.onMs)) n.softPedal = true;
  }

  const notes = done
    .map((d) => d.note)
    .sort((a, b) => a.onMs - b.onMs || a.midi - b.midi || a.eventIndex - b.eventIndex);
  notes.forEach((n, i) => (n.id = i));

  return {
    notes,
    sustain: sustainTrack,
    sostenuto: sostenutoTrack,
    soft: softTrack,
    pausedIntervals,
    endMs,
    clock,
    orphanOffs,
    disconnects: disconnectMarks.length,
    sustainSeen,
  };
}

function noteKey(e: { src: string; port?: string; ch: number | null; n: number }): string {
  return `${e.src}|${e.port ?? ''}|${e.ch ?? ''}|${e.n}`;
}
