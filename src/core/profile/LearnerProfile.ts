/**
 * LearnerProfile — hồ sơ người học (tuổi, trình độ ban đầu, mục tiêu), lưu trong localStorage.
 * Dữ liệu nhỏ, đọc đồng bộ khi khởi động; tiến độ thật vẫn nằm ở ProgressStorage (theo profileId).
 */

/** Trình độ người học tự khai lúc tạo hồ sơ. */
export type Experience = 'new' | 'beginner' | 'basic' | 'intermediate';

export type LearningGoal = 'fun' | 'reading' | 'songs' | 'technique' | 'both-hands';

/** Nhóm tuổi quyết định loại bài và thời lượng buổi tập gợi ý. */
export type AgeGroup = 'preschool' | 'child' | 'teen' | 'adult';

export interface LearnerProfile {
  id: string;
  name: string;
  age: number;
  avatar: string;
  experience: Experience;
  goals: LearningGoal[];
  /** Mục tiêu số phút luyện mỗi ngày. */
  dailyMinutes: number;
  createdAt: number;
}

export interface ProfilesState {
  profiles: LearnerProfile[];
  activeId: string | null;
}

export const AGE_MIN = 3;
export const AGE_MAX = 99;
export const DAILY_MINUTES_OPTIONS = [10, 15, 20, 30, 45] as const;
export const AVATARS = ['🐱', '🐶', '🐰', '🦊', '🐼', '🐨', '🦁', '🐸', '🐧', '🦄', '🎹', '⭐'] as const;

export const EXPERIENCE_LABELS: Record<Experience, { label: string; hint: string }> = {
  new: { label: 'Chưa học bao giờ', hint: 'Chưa biết tên nốt, chưa từng chơi đàn' },
  beginner: { label: 'Mới làm quen', hint: 'Biết vài nốt, chơi được vài nốt bằng một tay' },
  basic: { label: 'Cơ bản', hint: 'Đọc được khuông đơn giản, chơi được bài ngắn một tay' },
  intermediate: { label: 'Khá', hint: 'Đã học trên 1 năm, đọc nốt khá nhanh, chơi được hai tay' },
};

export const GOAL_LABELS: Record<LearningGoal, string> = {
  fun: 'Chơi cho vui',
  reading: 'Đọc nốt nhạc',
  songs: 'Chơi được bài hát',
  technique: 'Luyện ngón, kỹ thuật',
  'both-hands': 'Dùng tốt cả hai tay',
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  preschool: 'Mầm non',
  child: 'Thiếu nhi',
  teen: 'Thiếu niên',
  adult: 'Người lớn',
};

export function ageGroup(age: number): AgeGroup {
  if (age <= 6) return 'preschool';
  if (age <= 11) return 'child';
  if (age <= 17) return 'teen';
  return 'adult';
}

/** Thời lượng một buổi tập vừa sức theo tuổi (phút) — trẻ nhỏ tập ngắn, tập thường xuyên. */
export function recommendedDailyMinutes(age: number): number {
  switch (ageGroup(age)) {
    case 'preschool':
      return 10;
    case 'child':
      return 15;
    case 'teen':
      return 20;
    default:
      return 30;
  }
}

export function newProfile(input: Pick<LearnerProfile, 'name' | 'age'> & Partial<LearnerProfile>, now = Date.now()): LearnerProfile {
  return sanitizeProfile({
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    avatar: AVATARS[0],
    experience: 'new',
    goals: [],
    dailyMinutes: recommendedDailyMinutes(input.age),
    createdAt: now,
    ...input,
  })!;
}

const EXPERIENCES = Object.keys(EXPERIENCE_LABELS) as Experience[];
const GOALS = Object.keys(GOAL_LABELS) as LearningGoal[];

/** Làm sạch dữ liệu đọc từ localStorage; trả null nếu không dùng được. */
export function sanitizeProfile(raw: unknown): LearnerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 30) : '';
  const age = typeof r.age === 'number' && Number.isFinite(r.age) ? Math.round(Math.min(AGE_MAX, Math.max(AGE_MIN, r.age))) : 8;
  const minutes = typeof r.dailyMinutes === 'number' && Number.isFinite(r.dailyMinutes) ? Math.round(Math.min(120, Math.max(5, r.dailyMinutes))) : recommendedDailyMinutes(age);
  return {
    id: r.id,
    name: name || 'Người học',
    age,
    avatar: typeof r.avatar === 'string' && r.avatar ? r.avatar.slice(0, 8) : AVATARS[0],
    experience: EXPERIENCES.includes(r.experience as Experience) ? (r.experience as Experience) : 'new',
    goals: Array.isArray(r.goals) ? GOALS.filter((g) => (r.goals as unknown[]).includes(g)) : [],
    dailyMinutes: minutes,
    createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0,
  };
}

export function sanitizeProfiles(raw: unknown): ProfilesState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const profiles = (Array.isArray(r.profiles) ? r.profiles : [])
    .map(sanitizeProfile)
    .filter((p): p is LearnerProfile => !!p && !seen.has(p.id) && !!seen.add(p.id));
  const activeId = typeof r.activeId === 'string' && seen.has(r.activeId) ? r.activeId : (profiles[0]?.id ?? null);
  return { profiles, activeId };
}

const PROFILES_KEY = 'vietpiano.profiles.v1';

export function loadProfiles(): ProfilesState {
  try {
    return sanitizeProfiles(JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}'));
  } catch {
    return { profiles: [], activeId: null };
  }
}

export function saveProfiles(state: ProfilesState): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(state));
  } catch {
    // bỏ qua (Safari private mode…)
  }
}

/**
 * Phiên của một người học. Phiên cũ (trước khi có hồ sơ, không có profileId) được tính cho
 * hồ sơ tạo sớm nhất — thường chính là người đã luyện trên máy này.
 */
export function sessionsForProfile<T extends { profileId?: string }>(sessions: T[], profileId: string, profiles: LearnerProfile[]): T[] {
  const oldest = [...profiles].sort((a, b) => a.createdAt - b.createdAt)[0];
  const ownsLegacy = oldest?.id === profileId;
  return sessions.filter((s) => s.profileId === profileId || (ownsLegacy && !s.profileId));
}
