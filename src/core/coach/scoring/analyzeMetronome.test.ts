import { describe, expect, it } from 'vitest';
import { buildAiPayload } from '../ai/payload';
import { ruleBasedFeedback } from '../ai/fallback';
import { verifyFeedback } from '../ai/verify';
import { buildPerformance } from '../recorder/buildPerformance';
import { referenceFromLesson } from '../reference/fromLesson';
import { testLesson } from '../testing/lessons';
import { synthRecorded, type SynthOptions } from '../testing/synth';
import type { InputCapabilities, LatencyCalibration, PerformanceEvent, RecordedSession, ScoreReference, ScoringResult } from '../types';
import { metronomeText } from './analyzeMetronome';
import { scorePerformance } from './ScoringEngine';

const CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: false, polyphonic: true };
const ref = referenceFromLesson(testLesson('C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4', { tempo: 80 }));
const BEAT = 60000 / ref.targetBpm;
/** Lưới tiếng click: phách 0 ở 1000 ms (mốc phách 0 của bộ sinh), 4 phách đếm vào, chạy tới hết bài + 2 phách. */
const grid = (from = -4, to = 18, origin = 1000) => Array.from({ length: to - from + 1 }, (_, k) => origin + (from + k) * BEAT);

const cal = (offsetMs: number, patch: Partial<LatencyCalibration> = {}): LatencyCalibration => ({
  deviceKey: 'midi:Đàn thử',
  source: 'midi',
  deviceName: 'Đàn thử',
  offsetMs,
  jitterMs: 8,
  taps: 16,
  clicks: 16,
  bpm: 90,
  method: 'tap',
  measuredAt: 1,
  outputLatencyMs: 40,
  ...patch,
});

/** Log tổng hợp + tiếng click + thông tin phiên (metronome / độ trễ). */
function session(opts: SynthOptions, clicks: number[], s: { metronome?: boolean; latencyMs?: number; calibration?: LatencyCalibration; outputLatencyMs?: number | null; extra?: PerformanceEvent[] } = {}): RecordedSession {
  const rec = synthRecorded(ref, { jitterMs: 8, ...opts });
  const marks: PerformanceEvent[] = clicks.map((t) => ({ k: 'mark', t, rt: t, m: 'click' }));
  const [start, ...rest] = rec.events;
  const events = [start, ...[...rest.slice(0, -1), ...marks, ...(s.extra ?? [])].sort((a, b) => a.t - b.t), rest[rest.length - 1]];
  return {
    session: {
      ...rec.session,
      metronome: s.metronome ?? true,
      latencyMs: s.latencyMs ?? s.calibration?.offsetMs ?? 0,
      ...(s.calibration ? { latencyCalibration: s.calibration } : {}),
      ...(s.outputLatencyMs !== undefined ? { outputLatencyMs: s.outputLatencyMs } : {}),
    },
    events,
  };
}

function score(rec: RecordedSession, r: ScoreReference = ref): ScoringResult {
  return scorePerformance({ reference: r, performance: buildPerformance(rec), session: rec.session, capabilities: CAPS, now: 1 });
}

/** Người chơi đánh trễ `lag` ms so với tiếng click NGHE ĐƯỢC + máy trễ `device` ms (log gốc = click + lag + device). */
const played = (lag: number, device: number): SynthOptions => ({ startMs: 1000 + lag + device });

describe('so nốt với tiếng metronome (M1-T7, thông tin — không trừ điểm)', () => {
  it('không bật metronome → không nói gì', () => {
    expect(score(session(played(0, 0), grid(), { metronome: false, calibration: cal(0) })).tempo.metronome).toBeUndefined();
  });

  it('bật metronome nhưng chưa đo độ trễ → không kết luận, nói rõ lý do', () => {
    const r = score(session(played(0, 120), grid()));
    expect(r.tempo.metronome).toEqual({ status: 'not-calibrated' });
    expect(r.explanation.join(' ')).toContain('chưa đo độ trễ');
  });

  it('máy trễ 120 ms, người chơi đúng tiếng click → "khớp" sau khi bù', () => {
    const r = score(session(played(0, 120), grid(), { calibration: cal(120) }));
    expect(r.tempo.metronome).toMatchObject({ status: 'ok', verdict: 'with', latencyMs: 120, groups: 16 });
    expect(Math.abs((r.tempo.metronome as { offsetMs: number }).offsetMs)).toBeLessThanOrEqual(10);
    expect(r.explanation.join(' ')).toContain('Đã bù độ trễ đo của máy: 120 ms');
  });

  it('đánh SAU / TRƯỚC tiếng click', () => {
    const behind = score(session(played(110, 120), grid(), { calibration: cal(120) })).tempo.metronome;
    expect(behind).toMatchObject({ status: 'ok', verdict: 'behind' });
    expect((behind as { offsetMs: number }).offsetMs).toBeGreaterThanOrEqual(100);
    expect(metronomeText(behind!)).toContain('SAU tiếng metronome khoảng');
    const ahead = score(session(played(-80, 120), grid(), { calibration: cal(120) })).tempo.metronome;
    expect(ahead).toMatchObject({ status: 'ok', verdict: 'ahead' });
    expect(metronomeText(ahead!)).toMatch(/TRƯỚC tiếng metronome khoảng \d+ ms/);
  });

  it('tempo khác tiếng click (chậm dần khỏi lưới) → "không bám metronome"', () => {
    const r = score(session({ bpm: ref.targetBpm * 0.85, startMs: 1120 }, grid(-4, 22), { calibration: cal(120) }));
    expect(r.tempo.metronome).toMatchObject({ status: 'ok', verdict: 'unsteady' });
  });

  it('tạm dừng rồi metronome bắt đầu lại (lệch pha khác) → vẫn so đúng theo lưới mới', () => {
    // Bộ sinh: phách 8 trở đi trễ thêm 1 937 ms (khoảng tạm dừng 1 000 ms + chơi lại lệch pha 937 ms so với lưới cũ).
    const pauseAt = 1000 + 7.6 * BEAT + 120;
    const resumeAt = pauseAt + 1000;
    const origin2 = resumeAt + 4 * BEAT - 8 * BEAT; // lưới mới: phách 8 của bài sau 4 phách đếm vào
    const opts: SynthOptions = { startMs: 1120, gaps: [{ beat: 8, ms: resumeAt + 4 * BEAT - (1000 + 8 * BEAT) }] };
    const clicks = [...grid(-4, 7), ...grid(4, 18, origin2)];
    const extra: PerformanceEvent[] = [
      { k: 'mark', t: pauseAt, rt: pauseAt, m: 'pause' },
      { k: 'mark', t: resumeAt, rt: resumeAt, m: 'resume' },
    ];
    const r = score(session(opts, clicks, { calibration: cal(120), extra }));
    expect(r.tempo.metronome).toMatchObject({ status: 'ok', verdict: 'with' });
  });

  it('nốt lẻ phách (móc đơn) so với click + nửa phách', () => {
    const r8 = referenceFromLesson(testLesson('C4/8 D4/8 E4/8 F4/8 G4/8 A4/8 B4/8 C5/8 | C5/8 B4/8 A4/8 G4/8 F4/8 E4/8 D4/8 C4/8', { tempo: 80 }));
    const rec = synthRecorded(r8, { jitterMs: 6, startMs: 1000 + 95 });
    const clicks = grid(-4, 10);
    const events = [rec.events[0], ...[...rec.events.slice(1, -1), ...clicks.map((t): PerformanceEvent => ({ k: 'mark', t, rt: t, m: 'click' }))].sort((a, b) => a.t - b.t), rec.events[rec.events.length - 1]];
    const r = score({ session: { ...rec.session, metronome: true, latencyMs: 95, latencyCalibration: cal(95) }, events }, r8);
    expect(r.tempo.metronome).toMatchObject({ status: 'ok', verdict: 'with', groups: 16 });
  });

  it('quá ít nốt đúng → chưa kết luận', () => {
    const mods = Object.fromEntries(ref.notes.slice(0, 10).map((n) => [n.id, { skip: true }]));
    expect(score(session({ ...played(0, 120), mods }, grid(), { calibration: cal(120) })).tempo.metronome).toEqual({ status: 'too-few', groups: 6 });
  });

  it('bù độ trễ chỉ dời mốc: điểm y hệt khi không bù (chấm nhịp tương đối)', () => {
    const a = score(session(played(30, 150), grid(), { calibration: cal(150) }));
    const b = score(session(played(30, 150), grid(), { metronome: false, latencyMs: 0 }));
    expect(a.total).toBe(b.total);
    expect(a.criteria.map((c) => c.value)).toEqual(b.criteria.map((c) => c.value));
    expect(a.issues.map((i) => i.type)).toEqual(b.issues.map((i) => i.type));
  });

  it('loa / tai nghe lúc ghi khác lúc đo → đánh dấu, giải thích nên đo lại', () => {
    const r = score(session(played(0, 120), grid(), { calibration: cal(120, { outputLatencyMs: 40 }), outputLatencyMs: 220 }));
    expect(r.tempo.metronome).toMatchObject({ status: 'ok', outputChanged: true });
    expect(r.explanation.join(' ')).toContain('nên đo lại độ trễ');
  });

  it('dữ liệu gửi AI: độ lệch luôn dương + hướng; nhận xét theo quy tắc; câu AI "sau tiếng click 110 ms" qua xác minh', () => {
    const r = score(session(played(110, 120), grid(), { calibration: cal(120) }));
    const payload = buildAiPayload(r, ref, { recommendations: [], source: 'midi', hand: 'both' });
    expect(payload.tempo.metronome?.verdict).toBe('behind');
    const dev = payload.tempo.metronome!.deviationMs;
    expect(dev).toBeGreaterThan(0);
    const rules = ruleBasedFeedback(r, payload);
    expect(rules.summary).toContain(`sau tiếng click khoảng ${dev} ms`);
    const ahead = score(session(played(-80, 120), grid(), { calibration: cal(120) }));
    const pa = buildAiPayload(ahead, ref, { recommendations: [], source: 'midi', hand: 'both' });
    expect(pa.tempo.metronome!.deviationMs).toBeGreaterThan(0);
    expect(ruleBasedFeedback(ahead, pa).summary).toContain(`trước tiếng click khoảng ${pa.tempo.metronome!.deviationMs} ms`);
    const ok = verifyFeedback({ ...rules, summary: `Bạn thường đánh sau tiếng click khoảng ${dev} ms.` }, payload, rules);
    expect(ok.content.summary).toContain(`${dev} ms`);
    const bad = verifyFeedback({ ...rules, summary: `Bạn thường đánh sau tiếng click khoảng ${dev + 400} ms.` }, payload, rules);
    expect(bad.content.summary).not.toContain(`${dev + 400} ms`);
  });

  it('khớp metronome → nhận xét theo quy tắc khen bám nhịp', () => {
    const r = score(session(played(0, 120), grid(), { calibration: cal(120) }));
    const p = buildAiPayload(r, ref, { recommendations: [], source: 'midi', hand: 'both' });
    expect(ruleBasedFeedback(r, p).strengths.join(' ')).toContain('Bám tiếng metronome tốt');
  });
});
