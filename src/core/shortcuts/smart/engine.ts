/**
 * Engine Lối tắt thông minh: quy tắc → lọc → xếp hạng (thuần, không AI, không đọc bộ nhớ / đồng hồ).
 *
 * Lọc theo thứ tự: tắt loại gợi ý → đích không còn (registry) → đích bị khoá (buổi còn tiên quyết chưa đạt, cấp
 * "sắp có", trò chơi khi hết quỹ thời gian chơi) → trùng lối tắt thủ công (cùng `targetKey`) → đang ẩn → trùng nhau
 * (giữ đề xuất điểm cao hơn) → giới hạn mỗi loại / tổng số.
 * Xếp hạng: điểm giảm dần → thứ tự loại → `candidateKey` (tie-breaker ổn định, không phụ thuộc ngôn ngữ máy).
 * Lối tắt thủ công chỉ được ĐỌC (tập khoá đích) — engine không có cách nào sửa chúng.
 */
import { resolveTarget, targetKey, targetStatus } from '../registry';
import type { ShortcutTarget } from '../types';
import { cmp, DAY_MS, type SmartInput } from './context';
import { continueDrafts, nextDrafts, reviewDrafts } from './learning';
import { frequentDrafts, gameDrafts, practiceDrafts } from './play';
import { isDismissed, type Dismissals, type SmartSettings } from './settings';
import { dayIndex } from '../../profile/assessment';
import { TYPE_PRIORITY, type SmartCandidate, type SmartDraft, type SmartExclusion, type SmartResult, type SmartType } from './types';
import { weaknessDrafts } from './weakness';

export interface SmartPolicy {
  settings: SmartSettings;
  dismissed: Dismissals;
  /** `targetKey` của MỌI lối tắt thủ công của hồ sơ (cả lối tắt không hiện trên thanh). */
  manualKeys: ReadonlySet<string>;
  /** `targetKey` đã mở từ đề xuất trong phiên này → hạ ưu tiên (không gợi ý lặp lại quá nhiều trong một phiên). */
  usedThisSession?: ReadonlySet<string>;
}

/** Số đề xuất tối đa mỗi loại — giữ danh sách đa dạng. */
export const TYPE_LIMITS: Record<SmartType, number> = { continue: 2, weakness: 2, review: 1, practice: 1, game: 1, frequent: 1 };
/** Tổng số đề xuất tối đa (thanh hồ sơ chỉ nhận 1, phần còn lại ở menu ⋯). */
export const MAX_SMART = 6;
/** Đề xuất đã mở trong phiên (trừ "Tiếp tục") bị trừ chừng này điểm. */
export const SESSION_REPEAT_PENALTY = 30;
/** Danh sách hết hạn sau chừng này giờ hoặc lúc nửa đêm (hạn ôn tập tính theo ngày), cái nào tới trước. */
export const SMART_TTL_MS = 6 * 3_600_000;

/** Đích là trò chơi (bị khoá khi hết quỹ thời gian chơi — `GameTimeLocked`). */
export function isGameTarget(t: ShortcutTarget): boolean {
  return t.type === 'game' || t.type === 'arcade' || t.type === 'lesson-game' || (t.type === 'lesson' && t.params?.stage === 'game');
}

export function smartExpiry(now: number, tzOffsetMin: number): number {
  const midnight = (dayIndex(now, tzOffsetMin) + 1) * DAY_MS + tzOffsetMin * 60_000;
  return Math.min(now + SMART_TTL_MS, midnight);
}

/** Mọi đề xuất thô từ các quy tắc (chưa lọc). */
export function generateDrafts(input: SmartInput): SmartDraft[] {
  return [
    ...continueDrafts(input),
    ...nextDrafts(input),
    ...weaknessDrafts(input),
    ...reviewDrafts(input),
    ...practiceDrafts(input),
    ...gameDrafts(input),
    ...frequentDrafts(input),
  ];
}

export function compareCandidates(a: Pick<SmartCandidate, 'score' | 'type' | 'candidateKey'>, b: Pick<SmartCandidate, 'score' | 'type' | 'candidateKey'>): number {
  return b.score - a.score || TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] || cmp(a.candidateKey, b.candidateKey);
}

export function computeSmartShortcuts(input: SmartInput, policy: SmartPolicy, drafts: readonly SmartDraft[] = generateDrafts(input)): SmartResult {
  const { now } = input;
  const expiresAt = smartExpiry(now, input.tzOffsetMin);
  const result: SmartResult = { profileId: input.profileId, candidates: [], excluded: [], calculatedAt: now, expiresAt };
  if (!policy.settings.enabled) return result;
  const exclude = (c: Pick<SmartCandidate, 'candidateKey' | 'targetKey' | 'type'>, why: SmartExclusion) =>
    result.excluded.push({ candidateKey: c.candidateKey, targetKey: c.targetKey, type: c.type, why });

  const best = new Map<string, SmartCandidate>();
  for (const d of drafts) {
    const key = targetKey(d.target);
    const ref = { candidateKey: `${d.type}|${key}`, targetKey: key, type: d.type };
    if (!policy.settings.types[d.type]) {
      exclude(ref, 'type-disabled');
      continue;
    }
    const dest = resolveTarget(d.target);
    if (!dest) {
      exclude(ref, 'missing');
      continue;
    }
    // 'suggest-later' vẫn MỞ được bằng lối tắt thủ công (giáo trình chỉ gợi ý) nhưng không bao giờ được ĐỀ XUẤT.
    if (targetStatus(dest.target, input.records) !== 'ok' || (isGameTarget(dest.target) && input.gameTimeRemainingMs <= 0)) {
      exclude(ref, 'locked');
      continue;
    }
    if (policy.manualKeys.has(key)) {
      exclude(ref, 'pinned');
      continue;
    }
    if (isDismissed(policy.dismissed, key, now)) {
      exclude(ref, 'dismissed');
      continue;
    }
    const penalty = d.type !== 'continue' && policy.usedThisSession?.has(key) ? SESSION_REPEAT_PENALTY : 0;
    const candidate: SmartCandidate = {
      ...ref,
      profileId: input.profileId,
      target: dest.target,
      label: d.label ?? (d.verb ? `${d.verb} — ${dest.shortName}` : dest.shortName),
      icon: d.icon ?? dest.icon,
      reason: d.reason,
      evidence: d.evidence,
      score: Math.max(0, Math.min(100, d.score - penalty)),
      calculatedAt: now,
      expiresAt,
      status: 'active',
    };
    const prev = best.get(key);
    if (prev && compareCandidates(prev, candidate) <= 0) {
      exclude(candidate, 'duplicate');
      continue;
    }
    if (prev) exclude(prev, 'duplicate');
    best.set(key, candidate);
  }

  const perType = new Map<SmartType, number>();
  for (const c of [...best.values()].sort(compareCandidates)) {
    const n = perType.get(c.type) ?? 0;
    if (n >= TYPE_LIMITS[c.type] || result.candidates.length >= MAX_SMART) {
      exclude(c, 'limit');
      continue;
    }
    perType.set(c.type, n + 1);
    result.candidates.push(c);
  }
  return result;
}
