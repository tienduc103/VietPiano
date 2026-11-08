import { describe, expect, it } from 'vitest';
import { applyAiRanking, buildAiRequest, rankWithAi, type SmartAiAdapter } from './ai';
import { computeSmartShortcuts } from './engine';
import { DAY, NOW, passed, policy, PROFILE, record, records, smartInput } from './testing';

function ruleList() {
  const input = smartInput({ profile: PROFILE, records: records(passed('l1-01-keyboard', { bestScore: 85, lastPracticedAt: NOW - 12 * DAY }), record('l1-02-find-c', { attempts: 1 })) });
  return computeSmartShortcuts(input, policy()).candidates;
}

describe('điểm mở rộng AI cục bộ (P8)', () => {
  it('chỉ gửi số liệu tóm tắt của đề xuất + nhóm tuổi — không tên học viên', () => {
    const req = buildAiRequest(ruleList(), PROFILE);
    expect(req.ageGroup).toBe('child');
    expect(JSON.stringify(req)).not.toContain(PROFILE.name);
    expect(req.candidates.every((c) => !('target' in c))).toBe(true);
  });

  it('AI chỉ sắp xếp lại khoá đã có: khoá lạ bị bỏ, không thêm được đích mới', () => {
    const list = ruleList();
    const last = list[list.length - 1].candidateKey;
    const r = applyAiRanking(list, { order: [last, 'lesson|l6-20-mo-khoa', last] });
    expect(r.applied).toBe(true);
    expect(r.candidates[0].candidateKey).toBe(last);
    expect(r.candidates.map((c) => c.candidateKey).sort()).toEqual(list.map((c) => c.candidateKey).sort());
    expect(r.rejected).toEqual(['order:lesson|l6-20-mo-khoa']);
  });

  it('lý do viết lại phải bám số liệu: bịa số / có link / quá dài → giữ lý do gốc', () => {
    const list = ruleList();
    const review = list.find((c) => c.type === 'review')!;
    const ok = applyAiRanking(list, { reasons: { [review.candidateKey]: 'Đã 12 ngày con chưa ôn, mình ôn lại nhé!' } });
    expect(ok.candidates.find((c) => c.type === 'review')!.reason).toBe('Đã 12 ngày con chưa ôn, mình ôn lại nhé!');
    for (const bad of ['Con sai 90% nốt Fa', 'Xem thêm https://x.y', '<b>Ôn</b>', 'a'.repeat(200), 42]) {
      const r = applyAiRanking(list, { reasons: { [review.candidateKey]: bad } });
      expect(r.candidates.find((c) => c.type === 'review')!.reason).toBe(review.reason);
      expect(r.rejected).toContain(`reason:${review.candidateKey}`);
    }
  });

  it('không có AI / AI lỗi / quá giờ / trả rác → vẫn dùng thứ tự theo quy tắc', async () => {
    const list = ruleList();
    const keys = list.map((c) => c.candidateKey);
    const failing: SmartAiAdapter = { rank: () => Promise.reject(new Error('Không kết nối được Ollama')) };
    const slow: SmartAiAdapter = { rank: (_req, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ order: [...keys].reverse() }))) };
    const junk: SmartAiAdapter = { rank: async () => 'xin chào' };
    expect((await rankWithAi(list, null, PROFILE)).source).toBe('rules');
    const f = await rankWithAi(list, failing, PROFILE);
    expect(f).toMatchObject({ source: 'rules', error: 'Không kết nối được Ollama' });
    expect(f.candidates.map((c) => c.candidateKey)).toEqual(keys);
    const s = await rankWithAi(list, slow, PROFILE, 20);
    expect(s).toMatchObject({ source: 'rules', error: 'timeout' });
    expect((await rankWithAi(list, junk, PROFILE)).candidates.map((c) => c.candidateKey)).toEqual(keys);
  });

  it('AI hợp lệ → dùng thứ tự của AI', async () => {
    const list = ruleList();
    const reversed = list.map((c) => c.candidateKey).reverse();
    const r = await rankWithAi(list, { rank: async () => ({ order: reversed }) }, PROFILE);
    expect(r.source).toBe('ai');
    expect(r.candidates.map((c) => c.candidateKey)).toEqual(reversed);
  });
});
