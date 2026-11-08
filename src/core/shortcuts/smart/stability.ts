/**
 * Chống thay đổi liên tục (đặc tả mục 6).
 *
 * - `smartSignature`: tóm tắt CÁC DỮ LIỆU CÓ Ý NGHĨA (tiến độ bài, phiên luyện, số ván, ngày lịch, còn / hết giờ chơi).
 *   Chữ ký không đổi ⇒ không có sự kiện đáng kể ⇒ giữ nguyên thứ tự đã hiện. Không gồm cài đặt / đề xuất đã ẩn /
 *   lối tắt thủ công: các thao tác đó chỉ GỠ đề xuất khỏi danh sách đang hiện, không xếp lại phần còn lại.
 * - `stableOrder`: đề xuất còn hiện giữ đúng vị trí cũ; đề xuất mới (thay chỗ cái vừa ghim / ẩn) xếp sau cùng.
 * Nơi gọi (store) chỉ tính lại ở "thời điểm an toàn": mở trang chủ, đổi hồ sơ, đổi cài đặt — không theo từng nốt MIDI.
 */
import { dayIndex } from '../../profile/assessment';
import type { SmartInput } from './context';
import type { SmartCache } from './settings';
import type { SmartCandidate } from './types';

export function smartSignature(input: SmartInput): string {
  let recordCount = 0;
  let attempts = 0;
  let passed = 0;
  let exercises = 0;
  let reviews = 0;
  let gamePlays = 0;
  let lastPracticed = 0;
  for (const r of Object.values(input.records)) {
    if (!r) continue;
    recordCount += 1;
    attempts += r.attempts;
    passed += r.passed ? 1 : 0;
    reviews += r.reviewCount;
    gamePlays += r.gamePlays;
    lastPracticed = Math.max(lastPracticed, r.lastPracticedAt);
    for (const e of Object.values(r.exercises)) exercises += e.attempts;
  }
  const lastSession = input.sessions.reduce((m, s) => Math.max(m, s.startedAt), 0);
  const uses = input.usage.reduce((a, u) => a + u.uses, 0);
  const ff = input.fiveFinger?.history.length ?? 0;
  return [
    input.profileId,
    input.profile ? `${input.profile.age}:${input.profile.experience}:${input.profile.goals.join('+')}` : '-',
    `r${recordCount}.${attempts}.${passed}.${exercises}.${reviews}.${gamePlays}.${lastPracticed}`,
    `s${input.sessions.length}.${lastSession}`,
    `u${uses}.${ff}`,
    `g${input.gameTimeRemainingMs > 0 ? 1 : 0}`,
    `d${dayIndex(input.now, input.tzOffsetMin)}`,
    `l${input.library.length}.${input.labelStyle}`,
  ].join('|');
}

/** Cache còn dùng được: cùng chữ ký và chưa hết hạn. */
export function cacheValid(cache: SmartCache | null, signature: string, now: number): cache is SmartCache {
  return !!cache && cache.signature === signature && now < cache.expiresAt;
}

/** Giữ vị trí cũ cho đề xuất còn hiện; đề xuất mới xếp sau (theo thứ tự của engine). */
export function stableOrder(fresh: readonly SmartCandidate[], previousKeys: readonly string[] | null): SmartCandidate[] {
  if (!previousKeys || previousKeys.length === 0) return [...fresh];
  const pos = new Map(previousKeys.map((k, i) => [k, i]));
  const kept = fresh.filter((c) => pos.has(c.candidateKey)).sort((a, b) => pos.get(a.candidateKey)! - pos.get(b.candidateKey)!);
  const added = fresh.filter((c) => !pos.has(c.candidateKey));
  return [...kept, ...added];
}

export function toCache(signature: string, list: readonly SmartCandidate[], calculatedAt: number, expiresAt: number): SmartCache {
  return { signature, calculatedAt, expiresAt, keys: list.map((c) => c.candidateKey) };
}
