import { describe, expect, it } from 'vitest';
import { PracticeEngine } from './PracticeEngine';
import { MAX_READING_MS, NoteStatsCollector, mergeNoteTallies } from './NoteStats';

/** Gắn collector vào engine thật, giống useSessionRecorder. */
function setup(expected: number[], advanceOnWrong = false) {
  const engine = new PracticeEngine(expected, { minAdvanceIntervalMs: 120, octaveTolerant: false, advanceOnWrong });
  const stats = new NoteStatsCollector();
  stats.update(engine.getState());
  engine.subscribe((s) => stats.update(s));
  return { engine, stats };
}

describe('NoteStatsCollector', () => {
  it('đo thời gian tới lần đánh đầu tiên của mỗi nốt (trừ nốt đầu)', () => {
    const { engine, stats } = setup([60, 62, 64]);
    engine.handleNote(60, 1000); // nốt đầu: không đo
    engine.handleNote(62, 2500); // 1.5 s
    engine.handleNote(65, 3000); // sai: lần đánh đầu của E4 sau 0.5 s
    engine.handleNote(64, 4000); // đánh lại: không tính thêm thời gian đọc
    expect(stats.result().reading).toEqual({ totalMs: 2000, count: 2 });
  });

  it('đếm đúng / sai theo nốt cần đánh và ghi nốt bị nhầm', () => {
    const { engine, stats } = setup([60, 64, 64]);
    engine.handleNote(60, 1000);
    engine.handleNote(65, 2000);
    engine.handleNote(65, 2500);
    engine.handleNote(64, 3000);
    engine.handleNote(62, 4000);
    engine.handleNote(64, 5000);
    const e4 = stats.result().notes.find((n) => n.midi === 64)!;
    expect(e4).toEqual({ midi: 64, hits: 2, misses: 3, confusions: { '65': 2, '62': 1 } });
    expect(stats.result().notes.find((n) => n.midi === 60)).toMatchObject({ hits: 1, misses: 0 });
  });

  it('bỏ qua sự kiện bị engine chặn (quá sát lần chuyển nốt)', () => {
    const { engine, stats } = setup([60, 62]);
    engine.handleNote(60, 1000);
    engine.handleNote(65, 1050); // ignored
    expect(stats.result().notes.find((n) => n.midi === 62)).toBeUndefined();
  });

  it('khoảng chờ quá dài không tính vào tốc độ đọc', () => {
    const { engine, stats } = setup([60, 62, 64]);
    engine.handleNote(60, 0);
    engine.handleNote(62, MAX_READING_MS + 1);
    engine.handleNote(64, MAX_READING_MS + 1001);
    expect(stats.result().reading).toEqual({ totalMs: 1000, count: 1 });
  });

  it('bỏ qua nốt → đặt lại mốc thời gian cho nốt kế tiếp', () => {
    const { engine, stats } = setup([60, 62, 64]);
    engine.handleNote(60, 0);
    engine.skip(3000);
    engine.handleNote(64, 3400);
    expect(stats.result().reading).toEqual({ totalMs: 400, count: 1 });
  });

  it('chế độ đếm nốt: sai vẫn đi tiếp, nốt sau được đo từ lần sai', () => {
    const { engine, stats } = setup([60, 62, 64], true);
    engine.handleNote(60, 0);
    engine.handleNote(63, 800);
    engine.handleNote(64, 1500);
    const r = stats.result();
    expect(r.reading).toEqual({ totalMs: 1500, count: 2 });
    expect(r.notes.find((n) => n.midi === 62)).toMatchObject({ hits: 0, misses: 1, confusions: { '63': 1 } });
  });

  it('chơi lại từ đầu xoá thống kê', () => {
    const { engine, stats } = setup([60, 62]);
    engine.handleNote(60, 0);
    engine.handleNote(61, 500);
    engine.restart();
    expect(stats.result()).toEqual({ reading: { totalMs: 0, count: 0 }, notes: [] });
  });

  it('gộp thống kê nhiều phiên', () => {
    const merged = mergeNoteTallies([
      [{ midi: 64, hits: 2, misses: 1, confusions: { '65': 1 } }],
      undefined,
      [{ midi: 64, hits: 1, misses: 2, confusions: { '65': 1, '62': 1 } }],
    ]);
    expect(merged).toEqual([{ midi: 64, hits: 3, misses: 3, confusions: { '65': 2, '62': 1 } }]);
  });
});
