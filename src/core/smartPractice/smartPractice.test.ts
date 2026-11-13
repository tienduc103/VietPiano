import { describe, expect, it } from 'vitest';
import { referenceFromLesson } from '../coach/reference/fromLesson';
import { scorePerformance } from '../coach/scoring/ScoringEngine';
import { testLesson } from '../coach/testing/lessons';
import { synthPerformance, type SynthOptions } from '../coach/testing/synth';
import type { InputCapabilities, ScoreReference, ScoringResult } from '../coach/types';
import { LESSONS } from '../lessons/library';
import { splitMeasures } from '../lessons/notation';
import { DURATION_BEATS, measureLength, type Lesson } from '../lessons/types';
import { exerciseById } from '../technique/catalog';
import { evaluateRemedialOutcome } from './outcome';
import { detectDifficultPassages, passageErrorRate } from './passages';
import { buildRemedialLesson, parseRemedialId, remedialId, remedialLessonFromId, remedialRange } from './remedial';
import { getAdaptiveTempo, isPassed } from './tempo';

const MIDI: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: false, polyphonic: true };

let clock = 1_000;
function play(ref: ScoreReference, opts: SynthOptions = {}, lessonId = ref.id): ScoringResult {
  clock += 60_000;
  const id = `s${clock}`;
  return scorePerformance({
    reference: ref,
    performance: synthPerformance(ref, { jitterMs: 10, seed: clock, bpm: ref.targetBpm, ...opts }),
    session: { id, profileKey: 'p', lessonId },
    capabilities: MIDI,
    now: clock,
  });
}

const RUN8 = exerciseById('tech-l3-run8-updown-rh')!;
const run8Ref = referenceFromLesson(RUN8.lesson);

describe('detectDifficultPassages — phát hiện đoạn khó qua nhiều phiên', () => {
  it('Mi → Fa thường chậm (3/4 phiên): đúng một đoạn khó ở chỗ luồn ngón cái, độ tin cậy cao', () => {
    const slow = { mods: { 'm:3': { shiftMs: 380 } } };
    const results = [play(run8Ref, slow), play(run8Ref), play(run8Ref, slow), play(run8Ref, slow)];
    const ps = detectDifficultPassages(run8Ref, results);
    expect(ps).toHaveLength(1);
    const p = ps[0];
    expect(p.startGroup).toBe(3);
    expect(p.primaryError).toBe('slow-transition');
    expect(p.noteNames).toEqual(['E4', 'F4']);
    expect(p.confidence).toBe('high');
    expect(p.evidenceSessionIds).toHaveLength(3);
    expect(p.errorFrequency).toBeCloseTo(0.75);
    expect(p.timingDeviationMs).toBeGreaterThan(150);
    expect(p.strategy).toBe('slow');
    expect(p.handMode).toBe('right');
  });

  it('lỗi chỉ ở MỘT phiên → không kết luận (không hiện lỗi giả)', () => {
    const results = [play(run8Ref, { mods: { 'm:5': { midi: 70 } } }), play(run8Ref), play(run8Ref)];
    expect(detectDifficultPassages(run8Ref, results)).toEqual([]);
  });

  it('chưa đủ 2 phiên → không có đoạn khó', () => {
    expect(detectDifficultPassages(run8Ref, [play(run8Ref, { mods: { 'm:5': { midi: 70 } } })])).toEqual([]);
  });

  it('nhiều phiên chơi đúng (có dao động nhỏ) → không phát hiện lỗi giả', () => {
    const results = Array.from({ length: 6 }, () => play(run8Ref, { jitterMs: 25 }));
    expect(detectDifficultPassages(run8Ref, results)).toEqual([]);
  });

  it('sai cùng một nốt ở 2/3 phiên → đoạn "đánh sai nốt", tin cậy trung bình, chiến lược đọc nốt', () => {
    const wrong = { mods: { 'm:5': { midi: 70 } } };
    const results = [play(run8Ref, wrong), play(run8Ref), play(run8Ref, wrong)];
    const ps = detectDifficultPassages(run8Ref, results);
    expect(ps).toHaveLength(1);
    expect(ps[0].startGroup).toBe(5);
    expect(ps[0].primaryError).toBe('wrong-note');
    expect(ps[0].confidence).toBe('medium');
    expect(ps[0].strategy).toBe('note-reading');
  });

  it('bỏ sót nốt ở nhiều phiên → "bỏ sót nốt"', () => {
    const skip = { mods: { 'm:9': { skip: true } } };
    const ps = detectDifficultPassages(run8Ref, [play(run8Ref, skip), play(run8Ref, skip), play(run8Ref)]);
    expect(ps.map((p) => [p.startGroup, p.primaryError])).toEqual([[9, 'missing-note']]);
  });

  it('chỉ sai khi tăng tempo → gắn "nhạy với tempo"', () => {
    const wrong = { mods: { 'm:6': { midi: 66 } } };
    const results = [play(run8Ref, { bpm: 50 }), play(run8Ref, { bpm: 50 }), play(run8Ref, { ...wrong, bpm: 80 }), play(run8Ref, { ...wrong, bpm: 80 })];
    // Phiên chơi ở tempo đã chọn: đặt tempo mục tiêu của phiên = tempo chơi.
    results[0].tempo.targetBpm = 50;
    results[1].tempo.targetBpm = 50;
    results[2].tempo.targetBpm = 80;
    results[3].tempo.targetBpm = 80;
    const ps = detectDifficultPassages(run8Ref, results);
    expect(ps).toHaveLength(1);
    expect(ps[0].tempoSensitive).toBe(true);
  });

  it('kết quả của bản nhạc khác (đoạn cắt / bài khác) không được gộp', () => {
    const other = referenceFromLesson(exerciseById('tech-l3-run8-up-rh')!.lesson);
    const wrong = { mods: { 'm:5': { midi: 70 } } };
    const results = [play(other, wrong), play(other, wrong)];
    expect(detectDifficultPassages(run8Ref, results)).toEqual([]);
    expect(passageErrorRate(run8Ref, results, 5, 5)).toBeNull();
  });

  it('hai tay lệch nhau ở cùng một chỗ → đoạn "hai tay chưa cùng lúc", chiến lược tập từng tay', () => {
    const ex = exerciseById('tech-l2-5f-mirror')!;
    const ref = referenceFromLesson(ex.lesson);
    const lateLeft = { mods: { 'a:4:0': { shiftMs: 190 } } };
    const ps = detectDifficultPassages(ref, [play(ref, lateLeft), play(ref, lateLeft), play(ref)]);
    expect(ps.length).toBeGreaterThanOrEqual(1);
    expect(ps[0].startGroup).toBe(4);
    expect(ps[0].errorTypes.map((e) => e.type)).toContain('hands-async');
    expect(ps.find((p) => p.startGroup === 4)!.strategy).toBe('hands-separate');
  });
});

describe('bài luyện bổ trợ 3–5 nốt', () => {
  it('ví dụ đặc tả: chậm ở Mi → Fa → Rê–Mi–Fa, Rê–Mi–Fa–Sol, Đô–Rê–Mi–Fa–Sol', () => {
    expect(remedialRange(15, 3, 3, 0)).toEqual([1, 3]);
    expect(remedialRange(15, 3, 3, 1)).toEqual([1, 4]);
    expect(remedialRange(15, 3, 3, 2)).toEqual([0, 4]);
    const names = [0, 1, 2].map((v) => {
      const [a, b] = remedialRange(run8Ref.groups.length, 3, 3, v);
      return buildRemedialLesson(RUN8.lesson, a, b, run8Ref).noteNames.join(' ');
    });
    expect(names).toEqual(['D4 E4 F4', 'D4 E4 F4 G4', 'C4 D4 E4 F4 G4']);
  });

  it('đoạn sát đầu / cuối bài vẫn đủ 3–5 nhóm và chứa chỗ lỗi', () => {
    expect(remedialRange(15, 1, 1, 0)).toEqual([0, 2]);
    expect(remedialRange(15, 0, 0, 0)).toEqual([0, 2]);
    expect(remedialRange(15, 14, 14, 1)).toEqual([11, 14]);
    expect(remedialRange(3, 2, 2, 2)).toEqual([0, 2]);
    const [a, b] = remedialRange(15, 6, 9, 0);
    expect(a).toBeLessThanOrEqual(5);
    expect(b).toBeGreaterThanOrEqual(9);
  });

  it('giữ đúng cao độ, trường độ, thứ tự, số ngón; vạch nhịp đúng chỗ (ô lấy đà); Coach chấm được', () => {
    const { lesson } = buildRemedialLesson(RUN8.lesson, 1, 3, run8Ref);
    expect(lesson.id).toBe('rem:tech-l3-run8-updown-rh:1-3');
    expect(lesson.notes.map((n) => `${n.pitch}/${n.duration}:${n.finger}`)).toEqual(['D4/q:2', 'E4/q:3', 'F4/q:1']);
    expect(lesson.pickup).toBe(3);
    expect(lesson.pedal).toBeUndefined();
    const ref = referenceFromLesson(lesson);
    expect(ref.notes.map((n) => n.midi)).toEqual([62, 64, 65]);
    expect(splitMeasures(lesson.notes, 4, lesson.pickup)).toHaveLength(1);
  });

  it('id sinh lại được bài bổ trợ từ bài gốc (không lưu nốt)', () => {
    expect(parseRemedialId(remedialId('song-x', 2, 5))).toEqual({ sourceId: 'song-x', a: 2, b: 5 });
    expect(parseRemedialId('rem:abc')).toBeNull();
    expect(parseRemedialId('rem:abc:5-2')).toBeNull();
    const r = remedialLessonFromId('rem:tech-l3-run8-updown-rh:1-3', (id) => exerciseById(id)?.lesson);
    expect(r?.lesson.notes).toHaveLength(3);
    expect(remedialLessonFromId('rem:khong-co:1-3', () => undefined)).toBeNull();
    expect(remedialLessonFromId('rem:tech-l3-run8-updown-rh:1-99', (id) => exerciseById(id)?.lesson)).toBeNull();
  });

  it('hai tay: không cắt ngang nốt trắng đang ngân của tay trái — mở rộng tới ranh giới chung', () => {
    const ex = exerciseById('tech-l4-hands-rhythm')!;
    const ref = referenceFromLesson(ex.lesson);
    // Nhóm 1 = Rê móc đơn ở phách 0.5, giữa nốt trắng Đô tay trái (phách 0–2).
    const { lesson } = buildRemedialLesson(ex.lesson, 1, 2, ref);
    expect(lesson.notes.map((n) => n.pitch)).toEqual(['C4', 'D4', 'E4', 'F4']);
    expect(lesson.accompaniment?.map((a) => a.pitches.join('+'))).toEqual(['C3']);
    const beats = (xs: { duration: keyof typeof DURATION_BEATS }[]) => xs.reduce((s, x) => s + DURATION_BEATS[x.duration], 0);
    expect(beats(lesson.notes)).toBe(beats(lesson.accompaniment!));
    expect(referenceFromLesson(lesson).twoHands).toBe(true);
  });

  it('bài hát có ô lấy đà (Happy Birthday): đoạn bổ trợ giữ vạch nhịp, mọi ô giữa đủ phách', () => {
    const hb = LESSONS.find((l) => l.id === 'song-happy-birthday-beginner')!;
    const ref = referenceFromLesson(hb);
    for (const g of [2, 5, 9, 14]) {
      const [a, b] = remedialRange(ref.groups.length, g, g, 2);
      const { lesson } = buildRemedialLesson(hb, a, b, ref);
      const ms = splitMeasures(lesson.notes, measureLength(lesson.timeSignature), lesson.pickup);
      ms.slice(1, -1).forEach((m) => expect(m.beats).toBeCloseTo(measureLength(lesson.timeSignature)));
      expect(referenceFromLesson(lesson).notes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('mọi bài hai tay của Thư viện: bài bổ trợ ở mọi chỗ đều hợp lệ (đủ phách, hai tay cùng độ dài, không vượt quá 2 ô)', () => {
    const twoHands = LESSONS.filter((l) => l.accompaniment?.length);
    expect(twoHands.length).toBeGreaterThan(10);
    for (const l of twoHands) {
      const ref = referenceFromLesson(l);
      const full = measureLength(l.timeSignature);
      for (let g = 1; g < ref.groups.length; g += 7) {
        const [a, b] = remedialRange(ref.groups.length, g, g, 1);
        const r = buildRemedialLesson(l, a, b, ref);
        const ms = splitMeasures(r.lesson.notes, full, r.lesson.pickup);
        if (r.lesson.accompaniment) {
          const acc = splitMeasures(r.lesson.accompaniment, full, r.lesson.pickup);
          expect(acc.map((m) => m.beats), `${l.id} ${a}-${b}`).toEqual(ms.map((m) => m.beats));
        }
        expect(ms.reduce((s, m) => s + m.beats, 0)).toBeLessThanOrEqual(3 * full + 1e-6);
        expect(referenceFromLesson(r.lesson).notes.length).toBeGreaterThan(0);
      }
    }
  });

  it('nốt / bè lệch nhau không ghép được (dữ liệu bất thường) → cắt theo ô nhịp thay vì tách sai', () => {
    // Tay trái ngắn hơn tay phải 1 phách: đoạn cuối không có ranh giới chung.
    const odd: Lesson = testLesson('C4 D4 E4 F4 | G4 A4 B4 C5', { acc: 'C3/w | G2/h G2' });
    const ref = referenceFromLesson(odd);
    const last = ref.groups.length - 1;
    const r = buildRemedialLesson(odd, last - 2, last, ref);
    expect(r.byMeasures).toEqual([2, 2]);
    expect(r.lesson.id).toBe(remedialId(odd.id, last - 2, last));
  });
});

/** Kết quả chấm tối giản cho test tempo / hiệu quả (chỉ các trường thuật toán đọc). */
function fake(at: number, bpm: number, total: number, notes = total / 100, rhythm: number | null = total / 100): ScoringResult {
  return {
    id: `r${at}`,
    sessionId: `s${at}`,
    profileKey: 'p',
    lessonId: 'x',
    referenceId: 'x',
    createdAt: at,
    total,
    criteria: [
      { key: 'notes', value: notes },
      { key: 'rhythm', value: rhythm },
    ],
    tempo: { targetBpm: bpm, actualBpm: bpm, perMeasure: [], drift: null },
    confidence: { alignment: 1, overall: 'high' },
    counts: { refNotes: 8 },
    alignment: [],
    issues: [],
  } as unknown as ScoringResult;
}

describe('Adaptive Tempo', () => {
  it('chưa có lượt → bắt đầu chậm hơn tempo bài', () => {
    const t = getAdaptiveTempo([], { baseBpm: 60, tempoRange: [40, 100] });
    expect(t.action).toBe('start');
    expect(t.recommendedBpm).toBe(51);
  });

  it('ví dụ đặc tả: 50, 55, 60 đạt; 65 trượt 2 lần → về 60 (tempo ổn định cao nhất)', () => {
    const rs = [fake(1, 50, 90), fake(2, 50, 92), fake(3, 55, 90), fake(4, 55, 91), fake(5, 60, 88, 0.95, 0.9), fake(6, 60, 90), fake(7, 65, 70), fake(8, 65, 65)];
    const t = getAdaptiveTempo(rs, { baseBpm: 60, tempoRange: [40, 100] });
    expect(t.stableBpm).toBe(60);
    expect(t.action).toBe('decrease');
    expect(t.recommendedBpm).toBe(60);
  });

  it('hai lượt đạt liên tiếp → tăng 5; một lượt đạt → giữ; mỏi → không tăng; không vượt khoảng tempo', () => {
    expect(getAdaptiveTempo([fake(1, 60, 90), fake(2, 60, 95)], { baseBpm: 60 }).recommendedBpm).toBe(65);
    expect(getAdaptiveTempo([fake(1, 60, 50), fake(2, 60, 95)], { baseBpm: 60 }).action).toBe('hold');
    expect(getAdaptiveTempo([fake(1, 60, 90), fake(2, 60, 95)], { baseBpm: 60, fatigue: true }).action).toBe('hold');
    expect(getAdaptiveTempo([fake(1, 98, 90), fake(2, 98, 95)], { baseBpm: 60, tempoRange: [40, 100] }).recommendedBpm).toBe(100);
  });

  it('chưa có tempo ổn định mà trượt 2 lần → giảm 10%', () => {
    const t = getAdaptiveTempo([fake(1, 70, 50), fake(2, 70, 40)], { baseBpm: 70, tempoRange: [40, 100] });
    expect(t.action).toBe('decrease');
    expect(t.recommendedBpm).toBe(63);
  });

  it('lượt đạt cần nốt ≥ 90% và nhịp ≥ 75%, tổng đủ; nhịp không đo vẫn xét được', () => {
    expect(isPassed(fake(1, 60, 85, 0.85, 0.9))).toBe(false);
    expect(isPassed(fake(1, 60, 85, 0.95, 0.7))).toBe(false);
    expect(isPassed(fake(1, 60, 85, 0.95, null))).toBe(true);
    const bad = fake(1, 60, 95);
    bad.confidence.alignment = 0.2;
    expect(isPassed(bad)).toBe(false);
  });
});

describe('đánh giá hiệu quả luyện bổ trợ', () => {
  it('đạt 2 lượt liên tiếp ở bậc ngắn → mở rộng; ở bậc dài nhất → quay về bài gốc', () => {
    const rem = [fake(10, 50, 70), fake(11, 50, 90), fake(12, 50, 92)];
    expect(evaluateRemedialOutcome({ startGroup: 3, endGroup: 3, variant: 0 }, rem, run8Ref, []).next).toBe('extend');
    const o = evaluateRemedialOutcome({ startGroup: 3, endGroup: 3, variant: 2 }, rem, run8Ref, []);
    expect(o.next).toBe('return-to-source');
    expect(o.stable).toBe(true);
    expect(o.verdict).toBe('not-enough-data');
  });

  it('trượt 2 lượt liền → chậm lại', () => {
    expect(evaluateRemedialOutcome({ startGroup: 3, endGroup: 3, variant: 0 }, [fake(1, 50, 40), fake(2, 50, 50)], run8Ref, []).next).toBe('slower');
  });

  it('so lỗi trong bài gốc trước / sau khi luyện bổ trợ → "đã cải thiện"', () => {
    const slow = { mods: { 'm:3': { shiftMs: 380 } } };
    const before = [play(run8Ref, slow), play(run8Ref, slow)];
    const rem = [fake(clock + 10, 50, 90), fake(clock + 20, 50, 95)];
    clock += 100;
    const after = [play(run8Ref), play(run8Ref)];
    const o = evaluateRemedialOutcome({ startGroup: 3, endGroup: 3, variant: 1 }, rem, run8Ref, [...before, ...after]);
    expect(o.errorRateBefore).toBe(1);
    expect(o.errorRateAfter).toBe(0);
    expect(o.verdict).toBe('improved');
  });
});
