/**
 * Kiểm tra câu trả lời của AI cục bộ — coi là dữ liệu KHÔNG tin cậy:
 *  1. Tách JSON (bỏ ```json … ```), kiểm kiểu + độ dài từng trường (schema), bỏ ký tự điều khiển.
 *  2. Xác minh với dữ liệu đã gửi (payload):
 *     - `issueRef` / `recommendationRef` phải là mã có trong payload, không thì bỏ mục đó;
 *     - đoạn luyện phải nằm trong bài và chạm ô có lỗi; tempo luyện trong [40%, 100%] tempo mục tiêu;
 *     - trong câu chữ: mọi "ô N", tên nốt (E4…) và con số (ms, BPM, %, điểm, giây…) phải có trong payload (sai số nhỏ),
 *       câu sai bị bỏ cả câu; trường trống sau khi lọc → thay bằng câu theo quy tắc (fallback).
 *     - so sánh với lần trước chỉ giữ khi payload có lịch sử.
 *  Điểm số không bao giờ lấy từ AI.
 */
import type { CoachFeedbackContent } from '../types';
import type { CoachAiPayload } from './payload';

export interface VerifyOutcome {
  content: CoachFeedbackContent;
  removed: string[];
  replaced: string[];
  ok: boolean;
}

const MAX_TEXT = 400;
const clean = (s: unknown): string =>
  typeof s === 'string'
    ? s
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT)
    : '';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Tách đối tượng JSON từ câu trả lời (có thể bọc trong ```json). null nếu không đọc được. */
export function parseFeedbackJson(text: string): unknown {
  const body = text.replace(/```(?:json)?/gi, '').trim();
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(body.slice(a, b + 1));
  } catch {
    return null;
  }
}

/** Ép về đúng cấu trúc (bỏ trường sai kiểu). null nếu không phải đối tượng. */
export function coerceFeedback(raw: unknown): CoachFeedbackContent | null {
  if (!isObj(raw)) return null;
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.map(clean).filter(Boolean).slice(0, 3) : [];
  const priorities = Array.isArray(raw.priorities)
    ? raw.priorities
        .filter(isObj)
        .map((p) => ({ issueRef: clean(p.issueRef).slice(0, 12), title: clean(p.title).slice(0, 120), explanation: clean(p.explanation), fix: clean(p.fix) }))
        .slice(0, 3)
    : [];
  const sec = isObj(raw.practiceSection) && Number.isInteger(raw.practiceSection.fromMeasure) && Number.isInteger(raw.practiceSection.toMeasure) ? { fromMeasure: raw.practiceSection.fromMeasure as number, toMeasure: raw.practiceSection.toMeasure as number } : null;
  const tempo = typeof raw.practiceTempo === 'number' && Number.isFinite(raw.practiceTempo) ? Math.round(raw.practiceTempo) : null;
  const next = isObj(raw.nextExercise) && clean(raw.nextExercise.text) ? { ...(clean(raw.nextExercise.recommendationRef) ? { recommendationRef: clean(raw.nextExercise.recommendationRef).slice(0, 12) } : {}), text: clean(raw.nextExercise.text) } : null;
  return { summary: clean(raw.summary), strengths, priorities, practiceSection: sec, practiceTempo: tempo, nextExercise: next, comparison: clean(raw.comparison) || null };
}

interface Facts {
  numbers: number[];
  notes: Set<string>;
  first: number;
  last: number;
  /** Ô có lỗi (issues + ô cần xem). */
  problemMeasures: Set<number>;
  /** Ô thuộc đoạn luyện được gợi ý. */
  practiceMeasures: Set<number>;
  issueRefs: Set<string>;
  recRefs: Set<string>;
}

const NUMBER = /\d+(?:[.,]\d+)?/g;
const NOTE = /\b([A-G](?:#|b)?)(-?\d)\b/g;
// `\b` của regex JS chỉ hiểu chữ ASCII → dùng lookbehind Unicode để bắt cả "Ô 4" (chữ có dấu).
const MEASURE = /(?<![\p{L}\p{N}])ô\s*(?:nhịp\s*)?(?:số\s*)?(\d+)(?:\s*(?:–|-|—|đến|tới)\s*(?:ô\s*)?(\d+))?/giu;

function collectFacts(payload: CoachAiPayload, extraNumbers: number[]): Facts {
  const numbers: number[] = [...extraNumbers];
  const notes = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v);
    else if (typeof v === 'string') {
      for (const m of v.matchAll(NUMBER)) numbers.push(Number(m[0].replace(',', '.')));
      for (const m of v.matchAll(NOTE)) notes.add(`${m[1]}${m[2]}`);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(payload);
  const problemMeasures = new Set<number>();
  for (const i of payload.issues) if (i.measure !== null) problemMeasures.add(i.measure);
  for (const m of payload.measuresToReview) problemMeasures.add(m.measure);
  const practiceMeasures = new Set(problemMeasures);
  for (const r of payload.recommendations) if (r.measures) for (let k = r.measures[0]; k <= r.measures[1]; k++) practiceMeasures.add(k);
  return {
    numbers,
    notes,
    first: payload.lesson.measures[0],
    last: payload.lesson.measures[1],
    problemMeasures,
    practiceMeasures,
    issueRefs: new Set(payload.issues.map((i) => i.ref)),
    recRefs: new Set(payload.recommendations.map((r) => r.ref)),
  };
}

const near = (x: number, facts: Facts) => facts.numbers.some((a) => Math.abs(x - a) <= Math.max(1, 0.03 * Math.abs(a)) || Math.abs(x * 1000 - a) <= Math.max(50, 0.05 * Math.abs(a)));

/**
 * Câu có kiểm chứng được không. `mode`: 'problem' — ô nhắc tới phải là ô có lỗi; 'practice' — ô có lỗi hoặc thuộc đoạn luyện được
 * gợi ý; 'strength' — ô chỉ cần nằm trong bài.
 */
export function sentenceVerified(sentence: string, facts: Facts, mode: 'problem' | 'practice' | 'strength'): boolean {
  let rest = sentence;
  for (const m of sentence.matchAll(MEASURE)) {
    const nums = [m[1], m[2]].filter(Boolean).map(Number);
    for (const k of nums) {
      if (k < facts.first || k > facts.last) return false;
      if (mode === 'problem' && !facts.problemMeasures.has(k)) return false;
      if (mode === 'practice' && !facts.practiceMeasures.has(k)) return false;
    }
    rest = rest.replace(m[0], ' ');
  }
  for (const m of sentence.matchAll(NOTE)) {
    if (!facts.notes.has(`${m[1]}${m[2]}`)) return false;
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(NUMBER)) {
    const x = Number(m[0].replace(',', '.'));
    if (Number.isInteger(x) && x >= 0 && x <= 3) continue; // "2 tay", "3 lần" — lời khuyên, không phải số liệu
    if (!near(x, facts)) return false;
  }
  return true;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function verifyFeedback(content: CoachFeedbackContent, payload: CoachAiPayload, fallback: CoachFeedbackContent): VerifyOutcome {
  const removed: string[] = [];
  const replaced: string[] = [];
  const target = payload.lesson.targetBpm;
  const tempoOk = (t: number | null | undefined) => t !== null && t !== undefined && Number.isInteger(t) && t >= Math.round(0.4 * target) && t <= target;
  const practiceTempo = tempoOk(content.practiceTempo) ? content.practiceTempo! : fallback.practiceTempo ?? null;
  if (content.practiceTempo !== practiceTempo) replaced.push('practiceTempo');
  // Thang điểm /100 + tempo luyện đã kiểm là số được phép nhắc tới.
  const facts = collectFacts(payload, [100, ...(practiceTempo !== null ? [practiceTempo] : [])]);

  const filterText = (text: string, mode: 'problem' | 'practice' | 'strength', field: string) => {
    const keep: string[] = [];
    for (const s of splitSentences(text)) {
      if (sentenceVerified(s, facts, mode)) keep.push(s);
      else removed.push(`${field}: ${s}`);
    }
    return keep.join(' ');
  };

  let summary = filterText(content.summary, 'problem', 'summary');
  if (!summary) {
    summary = fallback.summary;
    replaced.push('summary');
  }
  let strengths = content.strengths.map((s) => filterText(s, 'strength', 'strengths')).filter(Boolean);
  if (!strengths.length) {
    strengths = fallback.strengths;
    replaced.push('strengths');
  }
  const priorities: CoachFeedbackContent['priorities'] = [];
  for (const p of content.priorities) {
    if (!p.issueRef || !facts.issueRefs.has(p.issueRef)) {
      removed.push(`priorities: mã lỗi không có trong dữ liệu (${p.issueRef || 'trống'})`);
      continue;
    }
    const issue = payload.issues.find((i) => i.ref === p.issueRef)!;
    const fb = fallback.priorities.find((x) => x.issueRef === p.issueRef);
    const title = filterText(p.title, 'problem', 'priorities.title') || fb?.title || 'Cần luyện thêm';
    const explanation = filterText(p.explanation, 'problem', 'priorities.explanation') || issue.message;
    const fix = filterText(p.fix, 'practice', 'priorities.fix') || fb?.fix || '';
    if (!fix) continue;
    priorities.push({ issueRef: p.issueRef, title, explanation, fix });
  }
  if (!priorities.length && fallback.priorities.length) replaced.push('priorities');

  const sec = content.practiceSection;
  const secOk =
    !!sec &&
    sec.fromMeasure <= sec.toMeasure &&
    sec.fromMeasure >= facts.first &&
    sec.toMeasure <= facts.last &&
    Array.from({ length: sec.toMeasure - sec.fromMeasure + 1 }, (_, k) => sec.fromMeasure + k).some((m) => facts.problemMeasures.has(m));
  if (!secOk && (sec || fallback.practiceSection)) replaced.push('practiceSection');

  let next = content.nextExercise ?? null;
  if (next) {
    const text = filterText(next.text, 'practice', 'nextExercise');
    const refOk = !next.recommendationRef || facts.recRefs.has(next.recommendationRef);
    if (!refOk) removed.push(`nextExercise: mã gợi ý không có trong dữ liệu (${next.recommendationRef})`);
    next = text ? { ...(refOk && next.recommendationRef ? { recommendationRef: next.recommendationRef } : {}), text } : null;
  }
  if (!next && fallback.nextExercise) {
    next = fallback.nextExercise;
    replaced.push('nextExercise');
  }

  let comparison: string | null = null;
  if (content.comparison) {
    if (!payload.history) removed.push('comparison: không có lịch sử để so sánh');
    else comparison = filterText(content.comparison, 'problem', 'comparison') || null;
  }
  if (!comparison && payload.history && fallback.comparison) {
    comparison = fallback.comparison;
    replaced.push('comparison');
  }

  return {
    content: { summary, strengths, priorities: priorities.length ? priorities : fallback.priorities, practiceSection: secOk ? sec : (fallback.practiceSection ?? null), practiceTempo, nextExercise: next, comparison },
    removed,
    replaced,
    ok: removed.length === 0 && replaced.length === 0,
  };
}
