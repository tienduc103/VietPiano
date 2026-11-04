import { describe, expect, it } from 'vitest';
import { CELEBRATE_MS, DEFAULT_SESSION_SETTINGS, FiveFingerSession, PHASE_PAUSE_MS, type ChainOutcome, type SessionSettings } from './FiveFingerSession';
import { chainKey, generateChain, mixSeed } from './generator';

function make(settings: Partial<SessionSettings> = {}, seed = 7) {
  const done: ChainOutcome[] = [];
  const session = new FiveFingerSession({ ...DEFAULT_SESSION_SETTINGS, ...settings }, { seed, onChainDone: (o) => done.push(o) });
  return { session, done };
}

/** Đánh đúng hết chuỗi hiện tại (hai tay: hai nốt cách nhau 20 ms). */
function playChain(session: FiveFingerSession, t: number): number {
  for (const step of session.getState().steps) {
    step.notes.forEach((n, i) => session.handleNote(n.midi, t + i * 20));
    t += 400;
  }
  return t;
}

describe('FiveFingerSession — luyện liên tục', () => {
  it('chưa bắt đầu → bỏ qua nốt; xong chuỗi → ăn mừng → tự sang chuỗi MỚI sau 1,5 s', () => {
    const { session, done } = make();
    const first = session.getState().steps[0].notes[0].midi;
    expect(session.handleNote(first, 0)).toBe('ignored');
    session.start(0);
    const firstChain = session.getState().chain;
    playChain(session, 100);
    expect(session.getState()).toMatchObject({ status: 'celebrating', chainsDone: 1, chainNumber: 1 });
    expect(done).toHaveLength(1);
    let t = session.getState().celebrate!.until - CELEBRATE_MS;
    session.tick(t + CELEBRATE_MS - 10);
    expect(session.getState().status).toBe('celebrating');
    // Đang ăn mừng: nốt không làm gì.
    expect(session.handleNote(first, t + 5)).toBe('ignored');
    t += CELEBRATE_MS + 5;
    session.tick(t);
    const s = session.getState();
    expect(s).toMatchObject({ status: 'playing', chainNumber: 2 });
    expect(chainKey(s.chain)).not.toBe(chainKey(firstChain));
    expect(s.drill.index).toBe(0);
  });

  it('không tạo chuỗi mới khi chuỗi hiện tại chưa xong (tick không đổi chuỗi)', () => {
    const { session } = make();
    session.start(0);
    const chain = session.getState().chain;
    session.handleNote(session.getState().steps[0].notes[0].midi, 100);
    session.tick(100_000);
    expect(session.getState().chain).toBe(chain);
    expect(session.getState().status).toBe('playing');
  });

  it('đủ số chuỗi của buổi (5) → kết thúc', () => {
    const { session, done } = make({ chainsPerSession: 5 });
    session.start(0);
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t = playChain(session, t + 100);
      session.tick(t + CELEBRATE_MS + 1);
      t += CELEBRATE_MS + 1;
    }
    expect(session.getState()).toMatchObject({ status: 'finished', chainsDone: 5, wrongNotes: 0, correctNotes: 40 });
    expect(done.map((d) => d.chainNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('không giới hạn: cứ tiếp tục sinh chuỗi; seed chuỗi tái tạo được', () => {
    const { session, done } = make({ chainsPerSession: 0 }, 99);
    session.start(0);
    let t = 0;
    for (let i = 0; i < 25; i++) {
      t = playChain(session, t + 100);
      t += CELEBRATE_MS + 1;
      session.tick(t);
    }
    expect(session.getState()).toMatchObject({ status: 'playing', chainNumber: 26, chainsDone: 25 });
    for (const o of done) expect(generateChain({ handMode: 'right', difficulty: 'easy' }, o.seed).right).toEqual(o.steps.map((s) => s.notes[0].index));
    expect(done[0].seed).toBe(mixSeed(99, 1));
  });

  it('Tạm dừng / Tiếp tục (kể cả lúc đang ăn mừng: giữ phần thời gian còn lại)', () => {
    const { session } = make();
    session.start(0);
    session.pause(10);
    expect(session.getState().status).toBe('paused');
    expect(session.handleNote(session.getState().steps[0].notes[0].midi, 20)).toBe('ignored');
    session.resume(30);
    const t = playChain(session, 100);
    session.pause(t);
    session.tick(t + 10_000);
    expect(session.getState().status).toBe('paused');
    session.resume(t + 10_000);
    expect(session.getState().status).toBe('celebrating');
    session.tick(t + 10_000 + CELEBRATE_MS + 1);
    expect(session.getState().status).toBe('playing');
  });

  it('Luyện lại: chơi lại đúng chuỗi đó từ đầu; Kết thúc: dừng buổi', () => {
    const { session } = make({ chainsPerSession: 5 });
    session.start(0);
    const chain = session.getState().chain;
    session.handleNote(session.getState().steps[0].notes[0].midi, 100);
    session.retry(200);
    expect(session.getState().chain).toBe(chain);
    expect(session.getState().drill.index).toBe(0);
    const t = playChain(session, 300);
    session.retry(t + 10);
    expect(session.getState()).toMatchObject({ status: 'playing', chainsDone: 0, chainNumber: 1 });
    expect(session.getState().chain).toBe(chain);
    session.end(t + 20);
    expect(session.getState().status).toBe('finished');
  });

  it('hai tay cùng lúc + luyện từng tay trước: tay phải → tay trái → hai tay, chỉ chuỗi cuối tính hoàn thành', () => {
    const { session, done } = make({ handMode: 'together', handsFirst: true });
    session.start(0);
    expect(session.getState().phase).toBe('right');
    expect(session.getState().steps.every((s) => s.notes.length === 1 && s.notes[0].hand === 'right')).toBe(true);
    let t = playChain(session, 100);
    expect(session.getState()).toMatchObject({ status: 'celebrating', chainsDone: 0 });
    t += PHASE_PAUSE_MS + 1;
    session.tick(t);
    expect(session.getState().phase).toBe('left');
    t = playChain(session, t + 100) + PHASE_PAUSE_MS + 1;
    session.tick(t);
    expect(session.getState().phase).toBe('main');
    expect(session.getState().steps.every((s) => s.notes.length === 2)).toBe(true);
    playChain(session, t + 100);
    expect(session.getState().chainsDone).toBe(1);
    expect(done.map((d) => d.phase ?? 'main')).toEqual(['right', 'left', 'main']);
  });

  it('chuỗi mới dùng chuyển động cần luyện (focus) lấy lại mỗi chuỗi', () => {
    let calls = 0;
    const session = new FiveFingerSession({ ...DEFAULT_SESSION_SETTINGS, handMode: 'left' }, {
      seed: 3,
      focus: () => {
        calls++;
        return [
          { hand: 'left', from: 1, to: 2 },
          { hand: 'right', from: 0, to: 1 },
        ];
      },
    });
    expect(calls).toBe(1);
    expect(session.getState().chain.params.focus).toEqual([{ hand: 'left', from: 1, to: 2 }]);
  });

  it('mở lại chuỗi đã lưu theo seed: chuỗi đầu đúng y như lần trước', () => {
    const { session, done } = make({ handMode: 'alternate', difficulty: 'hard' }, 5);
    session.start(0);
    playChain(session, 0);
    const saved = done[0];
    const replay = new FiveFingerSession({ ...DEFAULT_SESSION_SETTINGS, handMode: 'alternate', difficulty: 'hard' }, { seed: 1234, replay: { seed: saved.seed, focus: saved.focus } });
    expect(replay.getState().steps).toEqual(saved.steps);
  });
});
