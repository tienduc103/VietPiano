import { useMemo } from 'react';
import { sessionsForProfile } from '../core/profile/LearnerProfile';
import { applySession, emptyProgress, type LessonProgress, type PracticeSession } from '../core/storage/ProgressStorage';
import { useApp } from '../store/appStore';
import { activeProfile, useProfiles } from '../store/profileStore';

/** Lịch sử luyện tập của hồ sơ đang chọn (chưa có hồ sơ → mọi phiên). */
export function useProfileSessions(): PracticeSession[] {
  const sessions = useApp((s) => s.sessions);
  const profiles = useProfiles((s) => s.profiles);
  const profile = useProfiles(activeProfile);
  return useMemo(() => (profile ? sessionsForProfile(sessions, profile.id, profiles) : sessions), [sessions, profiles, profile]);
}

/** Tiến độ từng bài của hồ sơ đang chọn (số lần, số lần xong, độ chính xác cao nhất) — cùng cách gộp với ProgressStorage. */
export function useProfileProgress(): Record<string, LessonProgress> {
  const sessions = useProfileSessions();
  return useMemo(() => {
    const out: Record<string, LessonProgress> = {};
    for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) out[s.lessonId] = applySession(out[s.lessonId] ?? emptyProgress(s.lessonId), s);
    return out;
  }, [sessions]);
}
