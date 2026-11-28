import { afterEach, describe, expect, it, vi } from 'vitest';
import { RainbowEngine } from './RainbowEngine';
import { buildRoute, DEFAULT_STARTS } from './route';
import { adviseTempo, feedbackText, missionRewards, retryPlan, summarize, summarizeRounds, weakSegment } from './analysis';
import { loadRainbowProgress, loadRainbowSettings, previousAccuracy, recordRainbowSession, saveRainbowSettings, type SessionEntry } from './storage';
import { DEFAULT_RAINBOW_SETTINGS, needsTwoNotes, resolvePlan, sanitizeSettings } from './settings';

function tap(e: RainbowEngine, midi: number, t: number) {
  e.noteOn(midi, t, 'midi');
  e.noteOff(midi);
}

/** Hai vòng hai tay; tay trái mỗi vòng bấm nhầm ở bước Fa (pos 3) một lần. */
function playWithLeftMistakes() {
  const e = new RainbowEngine(buildRoute({ hands: 'both', path: 'round', starts: DEFAULT_STARTS }), { rounds: 2, celebrateMs: 100 });
  e.start(0);
  let t = 0;
  for (let r = 0; r < 2; r++) {
    for (const step of e.getState().steps) {
      if (step.pos === 3) tap(e, 54, (t += 200)); // Fa thăng 3 thay Fa 3
      tap(e, step.notes[0].midi, (t += 200));
      tap(e, step.notes[1].midi, t + 30);
    }
    e.tick((t += 500));
  }
  return e;
}

describe('Tổng kết', () => {
  it('độ chính xác riêng từng tay, đồng bộ, vòng đạt tiêu chí', () => {
    const e = playWithLeftMistakes();
    const s = summarize(e.getRecords());
    expect(s.hands.left).toMatchObject({ notes: 30, hits: 30, wrong: 2, firstTry: 28 });
    expect(s.hands.right).toMatchObject({ notes: 30, hits: 30, wrong: 0, accuracy: 1 });
    expect(s.hands.left!.accuracy).toBeCloseTo(30 / 32);
    expect(s.sync).toMatchObject({ complete: 30, together: 30 });
    const rounds = summarizeRounds(e.getRecords(), e.getRounds(), 'wait', { accuracy: 0.95, onTime: 0.7 });
    expect(rounds.map((r) => [r.complete, r.passed])).toEqual([
      [true, false],
      [true, false],
    ]);
    expect(summarizeRounds(e.getRecords(), e.getRounds(), 'wait').every((r) => r.passed)).toBe(true);
  });

  it('đoạn nên tập lại từ lỗi chắc chắn → "Mi–Fa của tay trái" + kế hoạch tay riêng rồi ghép hai tay', () => {
    const e = playWithLeftMistakes();
    const weak = weakSegment(e.getRecords())!;
    expect(weak).toMatchObject({ hand: 'left', fromPos: 2, toPos: 3, label: 'Mi–Fa', errors: 2, practiceFrom: 1, practiceTo: 4 });
    expect(feedbackText({ roundsComplete: 3, weak, sync: null, timing: 'wait' })).toBe('Con hoàn thành ba vòng. Đoạn Mi–Fa của tay trái cần tập thêm.');
    const plan = retryPlan(weak, true);
    expect(plan.map((p) => p.hands)).toEqual(['left', 'both']);
    expect(retryPlan(weak, false)).toHaveLength(1);
  });

  it('ngược chiều: đoạn hay sai mang tên nốt của chính tay đó', () => {
    const e = new RainbowEngine(buildRoute({ hands: 'both', path: 'round', starts: { left: 36, right: 60 }, motion: 'contrary' }), { rounds: 1 });
    e.start(0);
    let t = 0;
    for (const step of e.getState().steps) {
      if (step.pos === 3) {
        tap(e, 42, (t += 200)); // Fa thăng 2 thay Sol 2 (tay trái), hai lần
        tap(e, 42, (t += 200));
      }
      step.notes.forEach((n) => tap(e, n.midi, (t += 200)));
    }
    // Tay trái ngược chiều: vị trí 2 → 3 là La → Sol.
    expect(weakSegment(e.getRecords(), 2, 'contrary')).toMatchObject({ hand: 'left', label: 'La–Sol', errors: 2 });
  });

  it('lỗi micro không chắc chắn không tạo đề xuất tập lại', () => {
    const e = new RainbowEngine(buildRoute({ hands: 'right', path: 'up', starts: DEFAULT_STARTS }), { rounds: 1 });
    e.start(0);
    e.noteOn(60, 100, 'microphone');
    for (let i = 0; i < 4; i++) e.noteOn(74, 400 + i * 300, 'microphone'); // quãng tám
    expect(weakSegment(e.getRecords())).toBeNull();
    expect(summarize(e.getRecords()).hands.right).toMatchObject({ wrong: 0, uncertain: 4 });
  });

  it('gợi ý tăng tốc chỉ khi đủ số vòng liên tiếp đạt ở đúng nhịp đó', () => {
    const at = 0;
    expect(adviseTempo([{ bpm: 60, passed: true, at }, { bpm: 60, passed: true, at }], 60)).toBeNull();
    expect(adviseTempo([{ bpm: 60, passed: true, at }, { bpm: 60, passed: false, at }, { bpm: 60, passed: true, at }, { bpm: 60, passed: true, at }], 60)).toBeNull();
    expect(adviseTempo([{ bpm: 60, passed: true, at }, { bpm: 60, passed: true, at }, { bpm: 60, passed: true, at }], 60)).toBe(66);
    expect(adviseTempo([{ bpm: 50, passed: true, at }, { bpm: 50, passed: true, at }, { bpm: 50, passed: true, at }], 60)).toBeNull();
    expect(adviseTempo([{ bpm: 96, passed: true, at }, { bpm: 96, passed: true, at }, { bpm: 96, passed: true, at }], 96)).toBeNull();
  });

  it('phần thưởng: không đủ vòng chơi hết → không có sticker; không xét tốc độ', () => {
    const passed = { hands: {}, sync: null, round: 1, complete: true, passed: true };
    expect(missionRewards({ roundsTarget: 3, rounds: [passed, passed], sync: null, accuracy: 1, previousAccuracy: 0.5 })).toEqual([]);
    expect(missionRewards({ roundsTarget: 2, rounds: [passed, passed], sync: { complete: 10, together: 9, avgSpreadMs: 40 }, accuracy: 0.9, previousAccuracy: 0.7 })).toEqual(['mission', 'accuracy', 'together', 'progress']);
    expect(missionRewards({ roundsTarget: 2, rounds: [passed, { ...passed, passed: false }], sync: { complete: 10, together: 2, avgSpreadMs: 400 }, accuracy: 0.7, previousAccuracy: null })).toEqual(['mission']);
  });
});

describe('Cài đặt + lưu theo hồ sơ', () => {
  const store = new Map<string, string>();
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });
  const stub = () => vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });

  it('cài đặt hỏng → mặc định; chế độ → kế hoạch dùng chung một engine', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_RAINBOW_SETTINGS);
    expect(sanitizeSettings({ mode: 'mirror', rounds: 7, starts: { left: 60, right: 72 }, bpm: 61 })).toMatchObject({ mode: 'steps', rounds: 3, starts: { left: 48, right: 72 }, bpm: 60 });
    expect(resolvePlan({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'single', hand: 'left', path: 'up' })).toMatchObject({ hands: 'left', path: 'up', timing: 'wait' });
    expect(resolvePlan({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'mountain', path: 'up' })).toMatchObject({ hands: 'both', path: 'round' });
    expect(resolvePlan({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'tempo', bpm: 60, slow: true })).toMatchObject({ timing: 'tempo', bpm: 45 });
    expect(needsTwoNotes({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'single' })).toBe(false);
    expect(needsTwoNotes({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'tempo', tempoHands: 'right' })).toBe(false);
    expect(needsTwoNotes(DEFAULT_RAINBOW_SETTINGS)).toBe(true);
    // Ngược chiều: chế độ hai tay, chọn đường đi, vùng tay trái tự lùi khi chạm tay phải.
    expect(resolvePlan({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'contrary', path: 'up' })).toMatchObject({ hands: 'both', path: 'up', motion: 'contrary', timing: 'wait', starts: { left: 36, right: 60 } });
    expect(resolvePlan(DEFAULT_RAINBOW_SETTINGS)).toMatchObject({ motion: 'parallel', starts: { left: 48, right: 60 } });
    expect(needsTwoNotes({ ...DEFAULT_RAINBOW_SETTINGS, mode: 'contrary' })).toBe(true);
    expect(sanitizeSettings({ mode: 'contrary' }).mode).toBe('contrary');
  });

  it('sticker / bạn thú chỉ cộng thêm, không bao giờ trừ; mỗi hồ sơ riêng', () => {
    stub();
    const session: SessionEntry = { at: 1, mode: 'mountain', hands: 'both', timing: 'wait', bpm: null, roundsTarget: 3, roundsComplete: 3, roundsPassed: 2, accuracy: { left: 0.8, right: 1 }, together: 0.5, weak: null };
    recordRainbowSession('p1', { session, animals: 3, stickers: ['mission'], tempoRounds: [] });
    const p = recordRainbowSession('p1', { session: { ...session, at: 2, roundsComplete: 0, accuracy: { left: 0.2, right: 0.3 } }, animals: 0, stickers: [], tempoRounds: [{ bpm: 60, passed: false, at: 2 }] });
    expect(p.stickers).toHaveLength(1);
    expect(p.animalsHome).toBe(3);
    expect(p.sessions).toHaveLength(2);
    expect(previousAccuracy(p, 'mountain', 'both')).toBeCloseTo(0.25);
    expect(loadRainbowProgress('p2').animalsHome).toBe(0);
    saveRainbowSettings('p1', { ...DEFAULT_RAINBOW_SETTINGS, mode: 'tempo' });
    expect(loadRainbowSettings('p1').mode).toBe('tempo');
    expect(loadRainbowProgress('p1').animalsHome).toBe(3);
    expect(loadRainbowSettings('p2').mode).toBe('steps');
  });

  it('không có localStorage (Safari chặn) → dữ liệu rỗng, không ném lỗi', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadRainbowProgress(null).stickers).toEqual([]);
    expect(() => saveRainbowSettings(null, DEFAULT_RAINBOW_SETTINGS)).not.toThrow();
  });
});
