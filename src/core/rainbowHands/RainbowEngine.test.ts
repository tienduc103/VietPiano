import { describe, expect, it } from 'vitest';
import { RainbowEngine, type NoteSource } from './RainbowEngine';
import { buildRoute, DEFAULT_STARTS, type HandSet, type RainbowPath } from './route';
import { summarize } from './analysis';

const route = (hands: HandSet, path: RainbowPath = 'round') => buildRoute({ hands, path, starts: DEFAULT_STARTS });

/** Bấm + thả một phím (đàn MIDI). */
function tap(e: RainbowEngine, midi: number, t: number, source: NoteSource = 'midi') {
  const out = e.noteOn(midi, t, source);
  e.noteOff(midi);
  return out;
}

/** Chơi đúng trọn một lượt, hai tay cách nhau `gap` ms; trả về thời điểm kết thúc. */
function playRound(e: RainbowEngine, t0: number, gap = 20, stepMs = 400): number {
  let t = t0;
  for (const step of e.getState().steps) {
    step.notes.forEach((n, k) => tap(e, n.midi, t + k * gap));
    t += stepMs;
  }
  return t;
}

describe('RainbowEngine — chờ', () => {
  it('bài hai tay: chỉ sang bước khi ĐỦ hai tay; một tay đánh hết lộ trình không qua được bước nào', () => {
    const e = new RainbowEngine(route('both'), { rounds: 1 });
    e.start(0);
    // Chỉ tay phải chạy hết 15 nốt.
    let t = 1000;
    for (const step of e.getState().steps) tap(e, step.notes[1].midi, (t += 300));
    expect(e.getState().index).toBe(0);
    expect(e.getState().roundsComplete).toBe(0);
    expect(e.getState().handsDone).toEqual(['right']);
    // Tay trái đánh nốt của bước 0 → mới qua bước.
    expect(tap(e, 48, (t += 300))).toBe('step');
    expect(e.getState().index).toBe(1);
  });

  it('giữ phím / Note On lặp không tăng bước; thả ra rồi bấm lại mới tính', () => {
    const e = new RainbowEngine(route('right', 'up'), { rounds: 1 });
    e.start(0);
    expect(e.noteOn(60, 100, 'midi')).toBe('step');
    // Đàn gửi Note On lặp khi giữ.
    expect(e.noteOn(60, 400, 'midi')).toBe('held');
    expect(e.noteOn(60, 700, 'midi')).toBe('held');
    expect(e.getState().index).toBe(1);
    // Nốt kế đến khi phím trước vẫn giữ (legato) vẫn được.
    expect(e.noteOn(62, 900, 'midi')).toBe('step');
    expect(e.getState().index).toBe(2);
  });

  it('không đếm trùng ở điểm quay đầu; vòng sau cần một lần nhấn Đô MỚI', () => {
    const e = new RainbowEngine(route('right'), { rounds: 2, celebrateMs: 500 });
    e.start(0);
    const notes = e.getState().steps.map((s) => s.notes[0].midi);
    let t = 0;
    for (const m of notes.slice(0, 8)) tap(e, m, (t += 300));
    expect(e.getState().index).toBe(8); // đã qua Đô cao
    // Đô cao bấm lại (thả rồi bấm): không phải nốt của bước Si đi xuống → sai, không tiến.
    expect(tap(e, 72, (t += 300))).toBe('wrong');
    expect(e.getState().index).toBe(8);
    for (const m of notes.slice(8, 14)) tap(e, m, (t += 300));
    // Nốt cuối (Đô) — GIỮ phím, không thả.
    expect(e.noteOn(60, (t += 300), 'midi')).toBe('round');
    expect(e.getState()).toMatchObject({ status: 'celebrating', roundsEnded: 1, roundsComplete: 1 });
    e.tick((t += 600));
    expect(e.getState()).toMatchObject({ status: 'playing', round: 2, index: 0 });
    // Vẫn giữ Đô của vòng trước → không tính bước đầu vòng mới.
    expect(e.noteOn(60, (t += 300), 'midi')).toBe('held');
    expect(e.getState().index).toBe(0);
    e.noteOff(60);
    expect(e.noteOn(60, (t += 300), 'midi')).toBe('step');
    expect(e.getState().index).toBe(1);
  });

  it('phân biệt đủ hai nốt và cùng lúc: cách xa vẫn qua bước nhưng không ghi là đồng thời', () => {
    const e = new RainbowEngine(route('both', 'up'), { rounds: 1, syncToleranceMs: 250 });
    e.start(0);
    tap(e, 48, 1000);
    tap(e, 60, 1100); // 100 ms → cùng lúc
    tap(e, 50, 2000);
    tap(e, 62, 3500); // 1,5 s → đủ nốt, không cùng lúc
    const [a, b] = e.getRecords();
    expect(a).toMatchObject({ closed: true, together: true, spreadMs: 100 });
    expect(b).toMatchObject({ closed: true, together: false, spreadMs: 1500 });
    expect(e.getState().index).toBe(2);
    const s = summarize(e.getRecords().filter((r) => r.closed));
    expect(s.sync).toMatchObject({ complete: 2, together: 1 });
  });

  it('sai rồi sửa: giữ đúng bước, phần đúng của tay kia giữ nguyên, lỗi gán đúng tay + chỉ phím cần sửa', () => {
    const e = new RainbowEngine(route('both', 'up'), { rounds: 1 });
    e.start(0);
    tap(e, 60, 1000); // tay phải đúng
    expect(tap(e, 53, 1300)).toBe('wrong'); // Fa3: vùng tay trái
    expect(e.getState()).toMatchObject({ index: 0, lastHand: 'left', fixMidi: 48, handsDone: ['right'] });
    expect(tap(e, 48, 1600)).toBe('step');
    expect(e.getState().fixMidi).toBeNull();
    const rec = e.getRecords()[0];
    expect(rec.hands.left).toMatchObject({ wrong: 1, wrongMidis: [53] });
    expect(rec.hands.right).toMatchObject({ wrong: 0 });
  });

  it('mỗi sự kiện tiến tối đa một bước + chống nhảy sát lần chuyển bước', () => {
    const e = new RainbowEngine(route('right', 'up'), { rounds: 1, minAdvanceIntervalMs: 120 });
    e.start(0);
    tap(e, 60, 1000);
    expect(tap(e, 62, 1050)).toBe('ignored');
    expect(e.getState().index).toBe(1);
    expect(tap(e, 62, 1200)).toBe('step');
  });

  it('micro: lệch quãng tám / âm ngân của nốt trước là không chắc — không tính lỗi của bé', () => {
    const e = new RainbowEngine(route('right', 'up'), { rounds: 1 });
    e.start(0);
    e.noteOn(60, 1000, 'microphone');
    expect(e.noteOn(74, 1400, 'microphone')).toBe('uncertain'); // Rê5 thay Rê4
    expect(e.noteOn(60, 1800, 'microphone')).toBe('uncertain'); // Đô còn ngân
    expect(e.noteOn(65, 2200, 'microphone')).toBe('wrong'); // Fa: sai thật
    const s = summarize(e.getRecords());
    expect(s.hands.right).toMatchObject({ wrong: 1, uncertain: 2 });
    // Micro không có Note Off: hai lần Rê liên tiếp (NoteRecognizer đã lọc onset) đều tính.
    expect(e.noteOn(62, 2600, 'microphone')).toBe('step');
  });

  it('tạm dừng (mất kết nối) bỏ nốt + phần đánh dở, không ghi lỗi; tiếp tục chơi đúng bước', () => {
    const e = new RainbowEngine(route('both', 'up'), { rounds: 1 });
    e.start(0);
    tap(e, 48, 1000);
    e.pause(1100, 'input-lost');
    expect(e.getState()).toMatchObject({ status: 'paused', pauseReason: 'input-lost', handsDone: [] });
    expect(tap(e, 60, 1200)).toBe('ignored');
    expect(tap(e, 99, 1300)).toBe('ignored');
    e.resume(5000);
    expect(e.getState().status).toBe('playing');
    expect(tap(e, 60, 5300)).toBe('hit'); // tay trái phải đánh lại
    expect(tap(e, 48, 5350)).toBe('step');
    const rec = e.getRecords()[0];
    expect(rec.hands.left!.wrong + rec.hands.right!.wrong).toBe(0);
    expect(rec.together).toBe(true);
  });

  it('ván mới (đổi bài / chơi lại) không mang nốt hay điểm cũ, chỉ nhớ phím còn giữ', () => {
    const a = new RainbowEngine(route('right', 'up'), { rounds: 1 });
    a.start(0);
    a.noteOn(60, 100, 'midi'); // giữ
    tap(a, 99, 400);
    const b = new RainbowEngine(route('left', 'up'), { rounds: 1 }, a.heldKeys());
    b.start(1000);
    expect(b.getState()).toMatchObject({ index: 0, roundsComplete: 0, handsDone: [], lastOutcome: null });
    expect(summarize(b.getRecords()).hands.left).toMatchObject({ hits: 0, wrong: 0 });
    expect(b.noteOn(60, 1200, 'midi')).toBe('held');
  });

  it('số vòng khớp dữ liệu; xong nhiệm vụ dừng hẳn, chơi thêm cần bấm', () => {
    const e = new RainbowEngine(route('both'), { rounds: 3, celebrateMs: 300 });
    e.start(0);
    let t = 100;
    for (let r = 0; r < 3; r++) {
      t = playRound(e, t + 200);
      expect(e.getState().roundsComplete).toBe(r + 1);
      e.tick((t += 400));
    }
    expect(e.getState()).toMatchObject({ status: 'done', roundsEnded: 3, roundsComplete: 3 });
    expect(e.getRounds()).toHaveLength(3);
    expect(e.getRecords().filter((r) => r.closed)).toHaveLength(45);
    expect(tap(e, 48, (t += 300))).toBe('ignored');
    e.playMore(t);
    expect(e.getState()).toMatchObject({ status: 'playing', round: 4, roundsTarget: 4 });
  });
});

describe('RainbowEngine — giữ nhịp', () => {
  const beat = 500; // 120 bpm cho test gọn
  const cfg = { timing: 'tempo' as const, bpm: 120, countInBeats: 4, rounds: 1, restBeats: 4 };

  it('đếm vào rồi nhịp chạy: đúng nhịp / trễ / thiếu được ghi; không chờ nốt', () => {
    const e = new RainbowEngine(route('right', 'up'), cfg);
    e.start(0);
    e.tick(10);
    expect(e.getState()).toMatchObject({ status: 'count-in', countdown: 4 });
    e.tick(1600);
    expect(e.getState().countdown).toBe(1);
    const t0 = 4 * beat; // phách bước 0
    expect(tap(e, 60, t0 + 30)).toBe('hit');
    expect(tap(e, 62, t0 + beat + 180)).toBe('hit'); // trễ (onTime 100 ms ở 120 bpm)
    // bước 2 bỏ trống; đồng hồ vẫn đi.
    e.tick(t0 + 2 * beat + beat / 2 + 1);
    expect(e.getState().index).toBe(3);
    const [r0, r1, r2] = e.getRecords();
    expect(r0.hands.right!.timing).toBe('on-time');
    expect(r1.hands.right!.timing).toBe('late');
    expect(r2.hands.right!.timing).toBe('missed');
  });

  it('không dùng cơ chế chờ: một tay bỏ trống → vòng không tính chơi hết', () => {
    const e = new RainbowEngine(route('both', 'up'), cfg);
    e.start(0);
    const t0 = 4 * beat;
    e.getState().steps.forEach((s, i) => tap(e, s.notes[1].midi, t0 + i * beat));
    e.tick(t0 + 9 * beat);
    expect(e.getState()).toMatchObject({ status: 'done', roundsEnded: 1, roundsComplete: 0 });
    const s = summarize(e.getRecords());
    expect(s.hands.left).toMatchObject({ hits: 0, missed: 8 });
  });

  it('hai tay đúng nhịp + cùng lúc → vòng chơi hết; nghỉ giữa vòng rồi đếm vào lại', () => {
    const e = new RainbowEngine(route('both', 'up'), { ...cfg, rounds: 2 });
    e.start(0);
    let t0 = 4 * beat;
    e.getState().steps.forEach((s, i) => s.notes.forEach((n, k) => tap(e, n.midi, t0 + i * beat + k * 40)));
    e.tick(t0 + 8 * beat);
    expect(e.getState()).toMatchObject({ status: 'celebrating', roundsComplete: 1, round: 2 });
    // Vòng 2: phách đầu = phách cuối + (1 + restBeats) phách.
    t0 = t0 + 7 * beat + 5 * beat;
    e.tick(t0 - 2 * beat);
    expect(e.getState()).toMatchObject({ status: 'count-in', countdown: 2 });
    e.getState().steps.forEach((s, i) => s.notes.forEach((n) => tap(e, n.midi, t0 + i * beat)));
    e.tick(t0 + 8 * beat);
    expect(e.getState()).toMatchObject({ status: 'done', roundsComplete: 2 });
    expect(summarize(e.getRecords()).sync).toMatchObject({ complete: 16, together: 16 });
  });

  it('tạm dừng giữa vòng → đếm vào lại từ bước đang dở, nốt lúc dừng không tính', () => {
    const e = new RainbowEngine(route('right', 'up'), cfg);
    e.start(0);
    const t0 = 4 * beat;
    tap(e, 60, t0);
    tap(e, 62, t0 + beat);
    e.pause(t0 + beat + 100);
    expect(tap(e, 64, t0 + 2 * beat)).toBe('ignored');
    const r = 10000;
    e.resume(r);
    expect(e.getState()).toMatchObject({ status: 'count-in', countdown: 4 });
    // Bước 1 đang mở lúc dừng → đánh lại; bước 2 là phách sau đó.
    expect(tap(e, 62, r + 4 * beat)).toBe('hit');
    expect(tap(e, 64, r + 5 * beat)).toBe('hit');
    expect(e.getRecords()[2].hands.right!.timing).toBe('on-time');
  });
});
