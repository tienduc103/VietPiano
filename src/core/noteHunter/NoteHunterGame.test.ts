import { describe, expect, it } from 'vitest';
import { parseNotes } from '../lessons/notation';
import type { Lesson } from '../lessons/types';
import { AudioScheduler, type ScheduleOutput } from './AudioScheduler';
import { NoteHunterGame, summarize, weakestNotes, type HunterConfig } from './NoteHunterGame';
import { buildSong } from './songs';

function song(notation: string, timeSignature: Lesson['timeSignature'] = [4, 4]) {
  return buildSong(
    { id: 't', title: 'Thử', description: '', category: 'song', clef: 'treble', timeSignature, difficulty: 1, hand: 'right', notes: parseNotes(notation) },
    'test',
  );
}

/** 60 BPM → 1 phách = 1000 ms; không đếm vào để dễ tính. */
function game(notation: string, targets: number[], cfg: Partial<HunterConfig> = {}) {
  return new NoteHunterGame(song(notation), targets, { mode: 'wait', bpm: 60, leadInBeats: 0, ...cfg });
}

const C4 = 60;
const D4 = 62;
const E4 = 64;
const C5 = 72;

/** Đầu ra âm thanh giả: ghi thời điểm phát tuyệt đối (now + delay) và huỷ. */
function fakeOutput(nowRef: { now: number }) {
  const notes: { midi: number; at: number; dur: number; cancelled: boolean }[] = [];
  const clicks: number[] = [];
  const out: ScheduleOutput = {
    playNote(midi, delayMs, durationMs) {
      const n = { midi, at: nowRef.now + delayMs, dur: durationMs, cancelled: false };
      notes.push(n);
      return { cancel: () => void (n.cancelled = true) };
    },
    click(delayMs) {
      clicks.push(nowRef.now + delayMs);
      return { cancel: () => undefined };
    },
  };
  return { out, notes, clicks };
}

/** Chạy game + scheduler theo khung 16 ms từ `from` tới `to`. */
function run(g: NoteHunterGame, s: AudioScheduler | null, ref: { now: number }, to: number) {
  for (let t = ref.now; t <= to; t += 16) {
    ref.now = t;
    g.tick(t);
    s?.update(g, t);
  }
  ref.now = to;
  g.tick(to);
  s?.update(g, to);
}

describe('NoteHunterGame — Wait Mode', () => {
  it('chỉ chọn C4, bài có nhiều C4: dừng đúng phách ở từng C4, các nốt khác tự chạy', () => {
    const g = game('C4 D4 C4 E4 | C4/w', [C4]);
    expect(g.getState().targets.map((t) => t.noteIndex)).toEqual([0, 2, 4]);
    g.start(0);
    g.tick(0);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.noteOn({ midi: C4, time: 500 })).toBe('correct');
    expect(g.getState().targets[0]).toMatchObject({ status: 'hit', reactionMs: 500 });
    expect(g.getState().status).toBe('PLAYING');
    // Chạy tiếp từ phách 0 tính từ lúc đánh: D4 ở phách 1 (1500 ms), C4 thứ hai ở phách 2 (2500 ms).
    g.tick(1400);
    expect(g.positionAt(1400)).toBeCloseTo(0.9);
    g.tick(2533); // khung hình tới trễ 33 ms
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().position).toBe(2);
    expect(g.positionAt(5000)).toBe(2); // đồng hồ thật sự dừng
    expect(g.getState().waitingSince).toBe(2500);
    expect(g.noteOn({ midi: C4, time: 3000 })).toBe('correct');
    g.tick(4500); // E4 tự chạy, C4 thứ ba ở phách 4 (5000 ms)
    expect(g.getState().status).toBe('PLAYING');
    g.tick(5000);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().position).toBe(4);
    g.noteOn({ midi: C4, time: 5100 });
    g.tick(9000);
    expect(g.getState().status).toBe('PLAYING');
    g.tick(9100);
    expect(g.getState().status).toBe('COMPLETED');
    expect(summarize(g.getState().targets)).toMatchObject({ total: 3, hit: 3, missed: 0, wrong: 0, accuracy: 1 });
  });

  it('chọn C4 và E4: chỉ các nốt đó là mục tiêu, scheduler chỉ tự phát D4', () => {
    const ref = { now: 0 };
    const g = game('C4 D4 E4 D4 | C4/w', [C4, E4]);
    const { out, notes } = fakeOutput(ref);
    const s = new AudioScheduler(out, { lookaheadMs: 150, countIn: false });
    g.start(0);
    run(g, s, ref, 100);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    g.noteOn({ midi: C4, time: 100 });
    run(g, s, ref, 3000); // dừng ở E4 (phách 2 → 2100 ms)
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().position).toBe(2);
    g.noteOn({ midi: E4, time: 3000 });
    run(g, s, ref, 4500);
    expect(notes.map((n) => [n.midi, n.at])).toEqual([
      [D4, 1100],
      [D4, 4000],
    ]);
  });

  it('đánh sai D4 khi chờ C4: vẫn chờ, ghi lỗi, cho thử lại', () => {
    const g = game('C4 D4', [C4]);
    g.start(0);
    g.tick(0);
    expect(g.noteOn({ midi: D4, time: 300 })).toBe('wrong');
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().feedback).toMatchObject({ kind: 'wrong', midi: D4, targetMidi: C4 });
    expect(g.positionAt(2000)).toBe(0);
    expect(g.noteOn({ midi: C4, time: 900 })).toBe('correct');
    expect(g.getState().targets[0]).toMatchObject({ status: 'hit', wrong: [D4], reactionMs: 900 });
  });

  it('đánh C5 khi chờ C4: sai quãng 8 là sai', () => {
    const g = game('C4 D4', [C4]);
    g.start(0);
    g.tick(0);
    expect(g.noteOn({ midi: C5, time: 200 })).toBe('wrong');
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().targets[0].wrong).toEqual([C5]);
  });

  it('giữ C4 từ trước khi tới mục tiêu C4: không tính, phải đánh lại', () => {
    // Mục tiêu C4 ở phách 2 (2000 ms); người chơi đánh C4 ở 1000 ms (theo nốt tự phát) và giữ.
    const g = game('D4 D4 C4 D4', [C4]);
    g.start(0);
    g.tick(500);
    expect(g.noteOn({ midi: C4, time: 1000 })).toBe('ignored');
    expect(g.getState().held).toEqual([C4]);
    g.tick(2100);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    g.tick(4000);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    // Sự kiện cũ (xảy ra trước lúc chờ) tới muộn cũng không tính.
    expect(g.noteOn({ midi: C4, time: 1500 })).toBe('ignored');
    g.noteOff(C4);
    expect(g.noteOn({ midi: C4, time: 4200 })).toBe('correct');
  });

  it('đánh đúng ngay trước đầu mục tiêu (trong earlyGraceMs) → nhận, không dừng', () => {
    const g = game('D4 C4 D4', [C4]);
    g.start(0);
    g.tick(900);
    expect(g.noteOn({ midi: C4, time: 920 })).toBe('correct');
    g.tick(1100);
    expect(g.getState().status).toBe('PLAYING');
    expect(g.getState().targets[0]).toMatchObject({ status: 'hit', reactionMs: 0 });
  });

  it('hai mục tiêu liên tiếp: mỗi sự kiện chỉ giải quyết một mục tiêu, sự kiện lặp bị bỏ', () => {
    const g = game('C4 C4 D4', [C4]);
    g.start(0);
    g.tick(0);
    expect(g.noteOn({ midi: C4, time: 100 })).toBe('correct');
    // Micro báo lặp 50 ms sau → bỏ, dù vẫn trong earlyGrace của C4 thứ hai? (C4 thứ hai ở 1100 ms → không)
    expect(g.noteOn({ midi: C4, time: 150 })).toBe('ignored');
    expect(g.getState().cursor).toBe(1);
    g.tick(1150);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.noteOn({ midi: C4, time: 1300 })).toBe('correct');
    expect(g.getState().targets.map((t) => t.status)).toEqual(['hit', 'hit']);
  });

  it('hai mục tiêu sát nhau ở nhịp nhanh: sự kiện lặp trong minRepeatMs không tính cho mục tiêu sau', () => {
    // 140 BPM, móc đơn ≈ 214 ms: sự kiện lặp 60 ms sau lần đúng nằm trong earlyGrace của nốt sau.
    const g = new NoteHunterGame(song('C4/8 C4/8 D4 D4 D4'), [C4], { mode: 'wait', bpm: 140, leadInBeats: 0 });
    g.start(0);
    g.tick(0);
    g.noteOn({ midi: C4, time: 0 });
    expect(g.noteOn({ midi: C4, time: 100 })).toBe('ignored');
    expect(g.getState().targets[1].status).toBe('pending');
  });

  it('tạm dừng khi đang chờ: bỏ mọi nốt, chạy tiếp vẫn chờ, thời gian dừng không tính vào phản ứng', () => {
    const g = game('C4 D4', [C4]);
    g.start(0);
    g.tick(0);
    g.pause(400);
    expect(g.getState().status).toBe('PAUSED');
    expect(g.noteOn({ midi: C4, time: 600 })).toBe('ignored');
    g.tick(5000);
    expect(g.getState().status).toBe('PAUSED');
    g.resume(5400);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    g.noteOn({ midi: C4, time: 5500 });
    expect(g.getState().targets[0].reactionMs).toBe(500); // 400 trước + 100 sau
  });

  it('tạm dừng khi đang chạy: đóng băng vị trí, chạy tiếp từ đúng phách đó', () => {
    const g = game('D4 D4 C4 D4', [C4]);
    g.start(0);
    g.tick(700);
    g.pause(700);
    expect(g.positionAt(3000)).toBeCloseTo(0.7);
    g.resume(3000);
    expect(g.positionAt(3300)).toBeCloseTo(1.0);
    g.tick(4400);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().waitingSince).toBe(4300);
  });

  it('Restart khi đang chạy: về đầu bài (đếm vào), xoá kết quả', () => {
    const g = new NoteHunterGame(song('C4 D4 C4 D4'), [C4], { mode: 'wait', bpm: 60 });
    expect(g.leadInBeats).toBe(4);
    g.start(0);
    g.tick(4000);
    g.noteOn({ midi: C4, time: 4100 });
    g.tick(5000);
    g.restart(6000);
    const s = g.getState();
    expect(s.status).toBe('PLAYING');
    expect(s.targets.every((t) => t.status === 'pending')).toBe(true);
    expect(s.cursor).toBe(0);
    expect(g.positionAt(6000)).toBe(-4);
    g.tick(10_000);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    expect(g.getState().position).toBe(0);
  });

  it('đổi tempo trước khi chơi: đồng hồ và lịch phát theo nhịp mới', () => {
    const ref = { now: 0 };
    const g = game('C4 D4 E4 C4', [C4]);
    g.setTempo(120, 0);
    expect(g.getState().bpm).toBe(120);
    const { out, notes } = fakeOutput(ref);
    const s = new AudioScheduler(out, { lookaheadMs: 150, countIn: false });
    g.start(0);
    run(g, s, ref, 0);
    g.noteOn({ midi: C4, time: 0 });
    run(g, s, ref, 2000);
    // 120 BPM → 500 ms/phách: D4 ở 500, E4 ở 1000, chờ C4 ở 1500.
    expect(notes.map((n) => [n.midi, n.at, n.dur])).toEqual([
      [D4, 500, 500],
      [E4, 1000, 500],
    ]);
    expect(g.getState().waitingSince).toBe(1500);
    g.setTempo(10, 0);
    expect(g.getState().bpm).toBe(40);
  });

  it('bài không có nốt mục tiêu: không bắt đầu được', () => {
    const g = game('D4 E4', [C4]);
    expect(g.hasTargets()).toBe(false);
    expect(() => g.start(0)).toThrow();
    expect(g.getState().status).toBe('IDLE');
  });

  it('hết bài: COMPLETED, tổng kết đúng số lỗi và nốt hay sai', () => {
    const g = game('C4 E4 C4 E4', [C4, E4], { mode: 'note' });
    g.start(0);
    g.tick(0);
    g.noteOn({ midi: D4, time: 100 });
    g.noteOn({ midi: C4, time: 400 });
    g.tick(1500);
    g.noteOn({ midi: E4, time: 1500 });
    g.tick(2600);
    g.noteOn({ midi: D4, time: 2700 });
    g.noteOn({ midi: D4, time: 2800 });
    g.noteOn({ midi: C4, time: 3000 });
    g.tick(4100);
    g.noteOn({ midi: E4, time: 4200 });
    g.tick(5300);
    const s = g.getState();
    expect(s.status).toBe('COMPLETED');
    expect(s.finishedAt).toBe(5300);
    const sum = summarize(s.targets);
    expect(sum).toMatchObject({ total: 4, hit: 4, wrong: 3, accuracy: 0.5 });
    expect(sum.perNote.find((n) => n.midi === C4)).toMatchObject({ count: 2, wrong: 3 });
    expect(weakestNotes(sum)).toEqual([C4]);
  });
});

describe('NoteHunterGame — Rhythm Mode', () => {
  it('không dừng; đánh trong cửa sổ → trúng (ghi lệch), lỡ → missed', () => {
    const g = game('C4 D4 C4 D4', [C4], { mode: 'rhythm', rhythmWindowMs: 200 });
    g.start(0);
    expect(g.stopBeat()).toBe(Infinity);
    g.tick(50);
    expect(g.noteOn({ midi: C4, time: 80 })).toBe('correct');
    expect(g.getState().targets[0]).toMatchObject({ status: 'hit', timingMs: 80 });
    g.tick(2000);
    expect(g.getState().status).toBe('PLAYING');
    g.tick(2300); // quá 2000 + 200 ms
    expect(g.getState().targets[1].status).toBe('missed');
    expect(g.getState().feedback?.kind).toBe('miss');
    g.tick(4100);
    expect(g.getState().status).toBe('COMPLETED');
  });

  it('đánh sai cao độ trong cửa sổ → ghi lỗi', () => {
    const g = game('C4 D4', [C4], { mode: 'rhythm' });
    g.start(0);
    expect(g.noteOn({ midi: D4, time: 30 })).toBe('wrong');
    expect(g.getState().targets[0].wrong).toEqual([D4]);
    expect(g.noteOn({ midi: D4, time: 900 })).toBe('ignored');
  });
});

describe('AudioScheduler', () => {
  it('không lên lịch vượt điểm chờ; tạm dừng huỷ nốt chưa kêu, chạy tiếp lên lịch lại đúng giờ, không phát lặp', () => {
    const ref = { now: 0 };
    const g = game('D4 E4 D4 C4 | E4 D4 E4 D4', [C4]);
    const { out, notes } = fakeOutput(ref);
    const s = new AudioScheduler(out, { lookaheadMs: 150, countIn: false });
    g.start(0);
    run(g, s, ref, 900);
    // D4 (0) đã kêu, E4 (1000) đã đặt lịch trong lookahead.
    expect(notes.map((n) => n.midi)).toEqual([D4, E4]);
    g.pause(900);
    s.update(g, 900);
    expect(notes[1].cancelled).toBe(true);
    expect(notes[0].cancelled).toBe(true); // nốt đang kêu cũng dừng
    ref.now = 5000;
    g.resume(5000);
    run(g, s, ref, 8000);
    // Chạy tiếp từ 0.9: E4 ở 5100, D4 ở 6100, chờ C4 ở 7100 — D4 đầu bài không phát lại.
    const live = notes.filter((n) => !n.cancelled);
    expect(live.map((n) => [n.midi, n.at])).toEqual([
      [E4, 5100],
      [D4, 6100],
    ]);
    expect(g.getState().status).toBe('WAITING_FOR_NOTE');
    // Không nốt nào (kể cả đã huỷ) được đặt ở/ sau đầu mục tiêu, và nốt trước mục tiêu tắt đúng lúc đó.
    expect(Math.max(...notes.map((n) => n.at))).toBeLessThan(7100);
    expect(live[1].at + live[1].dur).toBe(7100);
    g.noteOn({ midi: C4, time: 8000 });
    run(g, s, ref, 8900);
    expect(notes[notes.length - 1]).toMatchObject({ midi: E4, at: 9000 });
  });

  it('đếm vào: click ở các phách âm, phách đầu ô nhấn', () => {
    const ref = { now: 0 };
    const g = new NoteHunterGame(song('C4 D4'), [C4], { mode: 'wait', bpm: 60 });
    const { out, clicks } = fakeOutput(ref);
    const s = new AudioScheduler(out, { lookaheadMs: 150, countIn: true });
    g.start(0);
    run(g, s, ref, 4200);
    expect(clicks).toEqual([0, 1000, 2000, 3000]);
  });

  it('Restart: huỷ mọi lịch cũ', () => {
    const ref = { now: 0 };
    const g = game('D4 E4 C4', [C4]);
    const { out, notes } = fakeOutput(ref);
    const s = new AudioScheduler(out, { lookaheadMs: 150, countIn: false });
    g.start(0);
    run(g, s, ref, 900);
    g.restart(900);
    s.reset(900);
    expect(notes.every((n) => n.cancelled)).toBe(true);
    expect(s.scheduledKeys()).toEqual([]);
    run(g, s, ref, 1000);
    expect(notes.filter((n) => !n.cancelled).map((n) => [n.midi, n.at])).toEqual([[D4, 900]]);
  });
});
