/**
 * Đánh giá kỹ năng + đề xuất theo QUY TẮC (luôn có, kể cả khi không có AI).
 *
 * Phân biệt rõ ba trạng thái: chưa đủ dữ liệu · cần luyện thêm · đã thực hiện tốt. Không kết luận từ vài lần chơi
 * (cần ≥ MIN_ATTEMPTS lần thử). Không tự tăng mức độ: chỉ đề xuất, phụ huynh duyệt.
 */
import type { ExploreLevel } from './config';
import { SKILL_IDS, type ActivityId, type SkillId, type SoundExploreProgress } from './progress';

export const MIN_ATTEMPTS = 6;
export const GOOD_RATE = 0.75;

export type SkillStatus = 'insufficient' | 'practice' | 'good';

export const SKILL_LABEL: Record<SkillId, string> = {
  pitchRecognition: 'Nghe nhận biết cao / thấp',
  pitchDirection: 'Nghe hướng đi lên / xuống',
  durationRecognition: 'Nghe nhận biết dài / ngắn',
  durationExecution: 'Giữ phím ngắn / dài',
  pitchExecution: 'Đánh đúng vùng cao / thấp',
};

export const STATUS_LABEL: Record<SkillStatus, string> = {
  insufficient: 'Chưa có đủ dữ liệu',
  practice: 'Cần luyện thêm',
  good: 'Đã thực hiện tốt',
};

/** Mô hình `SkillAssessment` của đặc tả (một kỹ năng). */
export interface SkillAssessment {
  skill: SkillId;
  status: SkillStatus;
  attempts: number;
  successfulAttempts: number;
  /** Tỷ lệ đạt trong các lần gần nhất (null khi chưa thử). */
  recentRate: number | null;
  /** 0–1: tăng theo số lần thử (12 lần gần nhất = 1). */
  confidence: number;
  replays: number;
  retries: number;
  midiAttempts: number;
  midiSuccesses: number;
  updatedAt: number;
}

export function assessSkill(p: SoundExploreProgress, skill: SkillId): SkillAssessment {
  const s = p.skills[skill];
  const recentRate = s.recent.length ? s.recent.filter(Boolean).length / s.recent.length : null;
  const status: SkillStatus = s.attempts < MIN_ATTEMPTS || recentRate === null ? 'insufficient' : recentRate >= GOOD_RATE ? 'good' : 'practice';
  return {
    skill,
    status,
    attempts: s.attempts,
    successfulAttempts: s.successfulAttempts,
    recentRate,
    confidence: Math.min(1, s.recent.length / 12),
    replays: s.replays,
    retries: s.retries,
    midiAttempts: s.midiAttempts,
    midiSuccesses: s.midiSuccesses,
    updatedAt: s.updatedAt,
  };
}

export function assessAll(p: SoundExploreProgress): SkillAssessment[] {
  return SKILL_IDS.map((s) => assessSkill(p, s));
}

/** Kỹ năng luyện ở hoạt động nào (để đề xuất). */
export const SKILL_ACTIVITY: Record<SkillId, ActivityId> = {
  pitchRecognition: 'rocket',
  pitchDirection: 'rocket',
  durationRecognition: 'duration',
  durationExecution: 'duration',
  pitchExecution: 'garden',
};

/** Kỹ năng cần "tốt" để gợi ý lên mức tiếp theo. */
const LEVEL_SKILLS: Record<ExploreLevel, SkillId[]> = {
  1: ['pitchRecognition', 'durationRecognition', 'durationExecution'],
  2: ['pitchRecognition', 'pitchDirection', 'durationRecognition', 'durationExecution', 'pitchExecution'],
  3: [],
};

/** Mức nên lên (đề xuất cho phụ huynh), null = chưa sẵn sàng / đã cao nhất. Dựa trên kết quả nhiều lần, không dựa vào thời gian chơi. */
export function suggestedLevel(p: SoundExploreProgress): ExploreLevel | null {
  const level = p.settings.level;
  if (level === 3) return null;
  const ready = LEVEL_SKILLS[level].every((s) => {
    const a = assessSkill(p, s);
    return a.status === 'good' && a.attempts >= 8;
  });
  return ready ? ((level + 1) as ExploreLevel) : null;
}

/** Khu vườn dùng 2 hay 4 lựa chọn: phụ huynh chọn, hoặc tự lên 4 khi ≥ 5/6 lượt gần nhất đạt cả hai thành phần (hay từ mức 3). */
export function gardenChoices(p: SoundExploreProgress): 2 | 4 {
  const c = p.settings.gardenChoices;
  if (c !== 'auto') return c;
  if (p.settings.level === 3) return 4;
  const last = p.gardenRecent.slice(-6);
  return last.length >= 6 && last.filter(Boolean).length >= 5 ? 4 : 2;
}

/** Mô hình `Recommendation` của đặc tả. */
export interface Recommendation {
  skill: SkillId | 'level';
  suggestedActivity: ActivityId;
  reason: string;
  generatedBy: 'rules' | 'ai';
  createdAt: number;
  /** Đổi mức độ cần phụ huynh đồng ý; gợi ý chơi một hoạt động thì không. */
  parentApprovalRequired: boolean;
}

/** Đề xuất theo quy tắc — luôn tính được, AI chỉ viết thêm lời. */
export function recommend(p: SoundExploreProgress, now: number): Recommendation[] {
  const out: Recommendation[] = [];
  if (!p.visited.intro) {
    out.push({ skill: 'pitchRecognition', suggestedActivity: 'intro', reason: 'Bé chưa nghe phần làm quen âm thanh cao / thấp, dài / ngắn.', generatedBy: 'rules', createdAt: now, parentApprovalRequired: false });
  }
  const all = assessAll(p);
  const weak = all.filter((a) => a.status === 'practice').sort((a, b) => (a.recentRate ?? 0) - (b.recentRate ?? 0));
  for (const a of weak.slice(0, 2)) {
    out.push({
      skill: a.skill,
      suggestedActivity: SKILL_ACTIVITY[a.skill],
      reason: `${SKILL_LABEL[a.skill]}: ${Math.round((a.recentRate ?? 0) * 100)}% trong ${Math.min(a.attempts, 12)} lần gần nhất — chơi thêm vài lượt.`,
      generatedBy: 'rules',
      createdAt: now,
      parentApprovalRequired: false,
    });
  }
  const lacking = all.find((a) => a.status === 'insufficient' && a.attempts > 0) ?? all.find((a) => a.status === 'insufficient');
  if (out.length < 2 && lacking) {
    out.push({
      skill: lacking.skill,
      suggestedActivity: SKILL_ACTIVITY[lacking.skill],
      reason: `${SKILL_LABEL[lacking.skill]}: mới có ${lacking.attempts} lần thử, cần thêm để đánh giá.`,
      generatedBy: 'rules',
      createdAt: now,
      parentApprovalRequired: false,
    });
  }
  const up = suggestedLevel(p);
  if (up) {
    out.push({ skill: 'level', suggestedActivity: 'adventure', reason: `Các kỹ năng của mức hiện tại đều tốt qua nhiều lần — có thể thử mức ${up}.`, generatedBy: 'rules', createdAt: now, parentApprovalRequired: true });
  }
  if (out.length === 0) {
    out.push({ skill: 'pitchDirection', suggestedActivity: 'adventure', reason: 'Bé làm tốt — chơi chuyến phiêu lưu để ôn cả cao độ và trường độ.', generatedBy: 'rules', createdAt: now, parentApprovalRequired: false });
  }
  return out;
}

/** Câu động viên cho bé theo quy tắc (câu cố định → có giọng thu sẵn). */
export function kidMessage(p: SoundExploreProgress): string {
  const pitch = assessSkill(p, 'pitchRecognition');
  const durExec = assessSkill(p, 'durationExecution');
  const durRec = assessSkill(p, 'durationRecognition');
  if (pitch.status === 'good' && durRec.status !== 'good') return KID_MESSAGES.pitchGoodTryDuration;
  if (durExec.status === 'practice') return KID_MESSAGES.holdLonger;
  if (pitch.status === 'practice' || durRec.status === 'practice') return KID_MESSAGES.listenAgain;
  if (pitch.status === 'good' && durRec.status === 'good') return KID_MESSAGES.allGood;
  return KID_MESSAGES.keepExploring;
}

export const KID_MESSAGES = {
  pitchGoodTryDuration: 'Con đã phân biệt tiếng cao và tiếng thấp rất tốt! Mình cùng chơi thêm trò tiếng dài nhé!',
  holdLonger: 'Mình nghe lại một lần nữa nhé! Con thử giữ phím lâu hơn một chút.',
  listenAgain: 'Mình nghe lại một lần nữa nhé! Con lắng nghe thật kỹ nha.',
  allGood: 'Con nghe giỏi quá! Tiếng cao, tiếng thấp, tiếng dài, tiếng ngắn con đều biết rồi!',
  keepExploring: 'Con đã khám phá rất chăm chỉ! Mình cùng chơi tiếp nhé!',
} as const;
