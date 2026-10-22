import { describe, expect, it } from 'vitest';
import { AutoCalibrator, computeCalibration, type CalibrationMeasurements, type NoteMeasurement } from './AutoCalibrator';
import { PitchDetector } from '../audio/PitchDetector';
import { NoteRecognizer, DEFAULT_RECOGNIZER_CONFIG, type TimedPitchFrame } from '../audio/NoteRecognizer';
import { noise, pianoLike } from '../audio/testSignals';
import { midiToFrequency } from '../music/notes';

const SR = 48000;
const FRAME = 2048;
const HOP = 1024;

/** Đoạn âm: im lặng (nhiễu nền) hoặc phím đàn (có thể gõ lại lúc còn ngân). */
type Segment = { kind: 'silence'; ms: number } | { kind: 'note'; midi: number; ms: number; a4?: number; restrikeAtMs?: number };

function render(segments: Segment[], ambient = 0.001): Float32Array {
  const total = segments.reduce((n, s) => n + Math.round((SR * s.ms) / 1000), 0);
  const out = noise(total, ambient * Math.sqrt(3), 7);
  let off = 0;
  for (const s of segments) {
    const len = Math.round((SR * s.ms) / 1000);
    if (s.kind === 'note') {
      const tone = pianoLike(midiToFrequency(s.midi, s.a4 ?? 440), SR, len);
      const strikes = [0, ...(s.restrikeAtMs !== undefined ? [Math.round((SR * s.restrikeAtMs) / 1000)] : [])];
      for (let i = 0; i < len; i++) {
        // Lần gõ lại: bao hình bắt đầu lại từ đầu (to như lần đầu).
        const since = i - Math.max(...strikes.filter((k) => k <= i));
        const env = Math.min(1, since / (SR * 0.005)) * Math.exp(-since / SR / 0.8);
        out[off + i] += tone[i] * env;
      }
    }
    off += len;
  }
  return out;
}

function frames(signal: Float32Array, startMs = 0): TimedPitchFrame[] {
  const det = new PitchDetector({ sampleRate: SR, frameSize: FRAME });
  const out: TimedPitchFrame[] = [];
  for (let s = 0; s + FRAME <= signal.length; s += HOP) {
    out.push({ ...det.detect(signal.subarray(s, s + FRAME)), time: startMs + ((s + FRAME) / SR) * 1000 });
  }
  return out;
}

const NOTES = [48, 60, 67];

function fullSession(a4 = 440): Segment[] {
  return [
    { kind: 'silence', ms: 3000 },
    ...NOTES.flatMap((midi): Segment[] => [
      { kind: 'note', midi, ms: 1800, a4 },
      { kind: 'silence', ms: 400 },
    ]),
    { kind: 'note', midi: 60, ms: 3500, a4, restrikeAtMs: 1000 },
    { kind: 'silence', ms: 500 },
  ];
}

function run(cal: AutoCalibrator, fs: TimedPitchFrame[]) {
  for (const f of fs) cal.process(f);
  return cal.getState();
}

describe('AutoCalibrator', () => {
  it('đi hết các bước: im lặng → từng nốt → đánh hai lần → kết quả', () => {
    const cal = new AutoCalibrator({ notes: NOTES, repeatMidi: 60 });
    const phases: string[] = [];
    cal.subscribe((s) => {
      const label = s.phase === 'done' ? 'done' : `${s.phase}:${s.stepIndex}`;
      if (phases[phases.length - 1] !== label) phases.push(label);
    });
    const state = run(cal, frames(render(fullSession())));
    expect(phases).toEqual([
      'silence:0',
      'waiting:1',
      'listening:1',
      'waiting:2',
      'listening:2',
      'waiting:3',
      'listening:3',
      'waiting:4',
      'listening:4',
      'done',
    ]);
    if (state.phase !== 'done') throw new Error('chưa xong');
    const { patch, measurements, warnings } = state.result;
    expect(warnings).toEqual([]);
    expect(measurements.notes.map((n) => n.midi)).toEqual(NOTES);
    expect(measurements.ambientRms).toBeGreaterThan(0.0005);
    expect(measurements.ambientRms).toBeLessThan(0.002);
    expect(patch.noiseGate).toBeCloseTo(Math.max(0.002, measurements.ambientRms * 3), 4);
    expect(patch.a4).toBe(440);
    expect(patch.octaveTolerant).toBeUndefined();
    expect(measurements.restrikeJump).toBeGreaterThan(1.5);
    expect(patch.onsetRatio).toBeGreaterThanOrEqual(1.15);
    expect(patch.onsetRatio).toBeLessThan(measurements.restrikeJump! * 0.75 + 0.01);
  });

  it('đàn đã chỉnh Tuning A4 = 446 → đề xuất a4 ≈ 446 (cộng vài cents do inharmonicity)', () => {
    const state = run(new AutoCalibrator({ notes: NOTES, repeatMidi: null }), frames(render(fullSession(446))));
    if (state.phase !== 'done') throw new Error('chưa xong');
    expect(state.result.patch.a4).toBeGreaterThanOrEqual(446);
    expect(state.result.patch.a4).toBeLessThanOrEqual(448);
  });

  it('nhiễu nền không bị coi là phím được gõ', () => {
    const cal = new AutoCalibrator({ notes: NOTES });
    const state = run(cal, frames(render([{ kind: 'silence', ms: 6000 }])));
    expect(state).toMatchObject({ phase: 'waiting', stepIndex: 1, issue: null });
  });

  it('đánh sai nốt → báo nốt nghe được và chờ đánh lại; đánh đúng thì sang bước sau', () => {
    const cal = new AutoCalibrator({ notes: [60, 64], repeatMidi: null });
    const sig = render([
      { kind: 'silence', ms: 3000 },
      { kind: 'note', midi: 62, ms: 1800 },
      { kind: 'silence', ms: 400 },
    ]);
    const fs = frames(sig);
    let state = run(cal, fs);
    expect(state).toMatchObject({ phase: 'waiting', stepIndex: 1, issue: { kind: 'wrong-note', heardMidi: 62 } });
    const last = fs[fs.length - 1].time;
    state = run(cal, frames(render([{ kind: 'note', midi: 60, ms: 1800 }, { kind: 'silence', ms: 400 }]), last + 21));
    expect(state).toMatchObject({ phase: 'waiting', stepIndex: 2, issue: null });
  });

  it('bước đánh hai lần: chỉ đánh một lần → yêu cầu đánh lại', () => {
    const cal = new AutoCalibrator({ notes: [], repeatMidi: 60 });
    const state = run(
      cal,
      frames(render([{ kind: 'silence', ms: 3000 }, { kind: 'note', midi: 60, ms: 3500 }, { kind: 'silence', ms: 300 }])),
    );
    expect(state).toMatchObject({ phase: 'waiting', issue: { kind: 'no-restrike' } });
  });

  it('bỏ qua mọi nốt → chỉ chỉnh noise gate, có cảnh báo', () => {
    const cal = new AutoCalibrator({ notes: [60, 64] });
    run(cal, frames(render([{ kind: 'silence', ms: 3000 }])));
    cal.skip();
    cal.skip();
    cal.skip();
    const state = cal.getState();
    if (state.phase !== 'done') throw new Error('chưa xong');
    expect(state.result.warnings).toContain('no-notes');
    expect(Object.keys(state.result.patch)).toEqual(['noiseGate']);
  });

  it('cài đặt đề xuất giúp NoteRecognizer nhận đúng mỗi nốt một lần, kể cả gõ lại khi còn ngân', () => {
    const state = run(new AutoCalibrator({ notes: NOTES, repeatMidi: 60 }), frames(render(fullSession())));
    if (state.phase !== 'done') throw new Error('chưa xong');
    const rec = new NoteRecognizer({ ...state.result.patch });
    const heard: number[] = [];
    const song = render([
      { kind: 'silence', ms: 500 },
      { kind: 'note', midi: 48, ms: 900 },
      { kind: 'note', midi: 67, ms: 900 },
      { kind: 'note', midi: 60, ms: 2000, restrikeAtMs: 900 },
      { kind: 'silence', ms: 500 },
    ]);
    for (const f of frames(song)) {
      const out = rec.process(f);
      if (out.noteOn) heard.push(out.noteOn.midi);
    }
    expect(heard).toEqual([48, 67, 60, 60]);
  });
});

describe('computeCalibration', () => {
  const note = (p: Partial<NoteMeasurement> = {}): NoteMeasurement => ({
    midi: 60,
    peakRms: 0.2,
    centsMedian: 0,
    confidenceP25: 0.95,
    octaveRatio: 0,
    wrongRunMs: 0,
    sustainJump: 1.05,
    ...p,
  });
  const base = (p: Partial<CalibrationMeasurements> = {}): CalibrationMeasurements => ({
    ambientRms: 0.002,
    notes: [note()],
    restrikeJump: 3,
    frameMs: 21.3,
    ...p,
  });

  it('tín hiệu sạch → giữ mặc định nhận diện', () => {
    const { patch, warnings } = computeCalibration(base());
    expect(warnings).toEqual([]);
    expect(patch).toMatchObject({ a4: 440, stableMs: DEFAULT_RECOGNIZER_CONFIG.stableMs, onsetRatio: DEFAULT_RECOGNIZER_CONFIG.onsetRatio });
    expect(patch.noiseGate).toBeCloseTo(0.006);
    expect(patch.minConfidence).toBe(0.9);
  });

  it('nốt trầm hay bị nghe thành quãng 8 → bật chấp nhận sai quãng tám', () => {
    expect(computeCalibration(base({ notes: [note(), note({ midi: 48, octaveRatio: 0.8 })] })).patch.octaveTolerant).toBe(true);
  });

  it('tiếng đàn nhỏ so với noise gate → hạ ngưỡng và cảnh báo', () => {
    const r = computeCalibration(base({ ambientRms: 0.004, notes: [note({ peakRms: 0.03 })] }));
    expect(r.patch.noiseGate).toBeCloseTo(0.0075);
    expect(r.warnings).toContain('quiet-signal');
  });

  it('nhiễu gần bằng tiếng đàn → cảnh báo phòng ồn', () => {
    expect(computeCalibration(base({ ambientRms: 0.01, notes: [note({ peakRms: 0.03 })] })).warnings).toContain('noisy-room');
  });

  it('pha attack nhận nhầm nốt lâu → tăng thời gian ổn định', () => {
    expect(computeCalibration(base({ notes: [note({ wrongRunMs: 85 })] })).patch.stableMs).toBe(130);
    expect(computeCalibration(base({ notes: [note({ wrongRunMs: 900 })] })).patch.stableMs).toBe(200);
  });

  it('ngưỡng onset nằm trên dao động âm ngân và dưới bước nhảy khi gõ lại', () => {
    expect(computeCalibration(base({ notes: [note({ sustainJump: 1.4 })] })).patch.onsetRatio).toBeCloseTo(1.54);
    expect(computeCalibration(base({ restrikeJump: 1.6 })).patch.onsetRatio).toBeCloseTo(1.2);
    const conflict = computeCalibration(base({ notes: [note({ sustainJump: 1.5 })], restrikeJump: 1.6 }));
    expect(conflict.warnings).toContain('onset-conflict');
    // Không có bước đánh hai lần: chỉ đẩy lên khi âm ngân dao động mạnh.
    expect(computeCalibration(base({ restrikeJump: null })).patch.onsetRatio).toBe(DEFAULT_RECOGNIZER_CONFIG.onsetRatio);
  });

  it('độ lệch cao độ: lệch đều → chỉnh A4; lệch lộn xộn → giữ 440 và cảnh báo', () => {
    expect(computeCalibration(base({ notes: [note({ centsMedian: 24 }), note({ centsMedian: 23 })] })).patch.a4).toBe(446);
    expect(computeCalibration(base({ notes: [note({ centsMedian: 6 })] })).patch.a4).toBe(440);
    const messy = computeCalibration(base({ notes: [note({ centsMedian: -20 }), note({ centsMedian: 20 })] }));
    expect(messy.patch.a4).toBe(440);
    expect(messy.warnings).toContain('tuning-inconsistent');
  });

  it('độ tin cậy thấp ở nốt khó → hạ minConfidence, có giới hạn dưới', () => {
    expect(computeCalibration(base({ notes: [note(), note({ confidenceP25: 0.8 })] })).patch.minConfidence).toBe(0.75);
    expect(computeCalibration(base({ notes: [note({ confidenceP25: 0.3 })] })).patch.minConfidence).toBe(0.6);
  });
});
