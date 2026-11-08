/**
 * Glue React cho Lối tắt thông minh: gom dữ liệu của ĐÚNG hồ sơ đang chọn (tiến độ giáo trình đã nạp xong, phiên luyện,
 * kết quả trò chơi, quỹ giờ chơi, lối tắt thủ công) rồi gọi `refresh` của store.
 *
 * Thời điểm tính (đặc tả mục 4 + 6): lần đầu thanh lối tắt hiện (mở trang chủ, đổi hồ sơ) → tính đầy đủ; trong lúc thanh
 * đang hiện chỉ tính lại khi người dùng thao tác (ghim, ẩn, đổi lối tắt thủ công) và GIỮ thứ tự cũ. Chỉ chạy ở trang chủ
 * — không chạy trong màn luyện / trò chơi, không nằm trên đường xử lý nốt MIDI.
 */
import { useEffect, useMemo, useRef } from 'react';
import { loadBalloonRecords } from '../core/balloonPop/storage';
import { GUEST_PROFILE } from '../core/curriculum/progress';
import type { Records } from '../core/curriculum/unlock';
import { loadF1Progress } from '../core/f1Racing/storage';
import type { FiveFingerStats } from '../core/fiveFinger/stats';
import { loadFiveFingerStats } from '../core/fiveFinger/storage';
import { loadFlappyRecords } from '../core/flappyNote/storage';
import { loadArcadeRecords } from '../core/games/arcade';
import { lessonManager } from '../core/lessons/LessonManager';
import { loadRuns } from '../core/noteHunter/storage';
import { sessionsForProfile } from '../core/profile/LearnerProfile';
import { targetKey } from '../core/shortcuts/registry';
import type { SmartInput } from '../core/shortcuts/smart/context';
import type { SmartCandidate, UsageEntry } from '../core/shortcuts/smart/types';
import { usageFromArcade, usageFromFiveFinger, usageFromLessonGames, usageFromPlays, usageFromTimes } from '../core/shortcuts/smart/usage';
import type { ShortcutSuggestion } from '../core/shortcuts/types';
import { loadTomatoProgress } from '../core/tomatoHarvest/storage';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { useGameTime } from '../store/gameTimeStore';
import { useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';
import { useShortcuts } from '../store/shortcutStore';
import { useSmartShortcuts } from '../store/smartShortcutStore';

/** Số lần dùng từng trò / màn luyện, đọc từ kho kết quả của hồ sơ (mỗi kho tự bỏ qua lỗi bộ nhớ). */
export function collectUsage(profileId: string | null, profileKey: string, records: Records, fiveFinger: FiveFingerStats | null, now: number, tzOffsetMin: number): UsageEntry[] {
  const timed: (UsageEntry | null)[] = [
    // Cà chua / F1 chỉ lưu thành tích khi đã chọn hồ sơ.
    profileId ? usageFromTimes({ type: 'game', id: 'tomato-harvest' }, loadTomatoProgress().history.filter((r) => r.profileId === profileId).map((r) => r.achievedAt), now) : null,
    profileId ? usageFromTimes({ type: 'game', id: 'f1-racing' }, loadF1Progress().history.filter((r) => r.profileId === profileId).map((r) => r.achievedAt), now) : null,
    usageFromTimes({ type: 'game', id: 'note-hunter' }, loadRuns(profileId).map((r) => r.at), now),
    usageFromPlays({ type: 'game', id: 'flappy-note' }, loadFlappyRecords(profileKey)),
    usageFromPlays({ type: 'game', id: 'balloon-pop' }, loadBalloonRecords(profileKey)),
    usageFromFiveFinger(fiveFinger, now, tzOffsetMin),
  ];
  return [...timed.filter((u): u is UsageEntry => !!u), ...usageFromArcade(loadArcadeRecords(profileKey)), ...usageFromLessonGames(records)];
}

const toSuggestion = (c: SmartCandidate): ShortcutSuggestion => ({ key: c.candidateKey, name: c.label, icon: c.icon, target: c.target, reason: c.reason });

/** Đề xuất của hồ sơ đang chọn cho thanh lối tắt — rỗng khi chưa nạp xong dữ liệu của đúng hồ sơ đó. */
export function useSmartSuggestions(): ShortcutSuggestion[] {
  const activeId = useProfiles((s) => s.activeId);
  const profiles = useProfiles((s) => s.profiles);
  const profileKey = activeId ?? GUEST_PROFILE;
  const profile = useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);
  const curriculumReady = useCurriculum((s) => s.loaded && s.profileKey === profileKey);
  const records = useCurriculum((s) => s.records);
  const progressLoaded = useApp((s) => s.progressLoaded);
  const allSessions = useApp((s) => s.sessions);
  // null = bộ đếm giờ chơi chưa chuyển sang hồ sơ này (GameTimeController đổi trong effect) → chờ.
  const gameUnlocked = useGameTime((s) => (s.profileKey === profileKey ? s.remainingMs > 0 : null));
  const manualItems = useShortcuts((s) => (s.profileKey === profileKey ? s.items : null));
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const storeKey = useSmartShortcuts((s) => s.profileKey);
  const list = useSmartShortcuts((s) => s.list);

  /** Khoá đích của mọi lối tắt thủ công (đổi khi ghim / xoá / sửa đích). */
  const manualKeys = useMemo(() => (manualItems ? [...new Set(manualItems.map((i) => targetKey(i.target)))].sort() : null), [manualItems]);
  const manualSig = manualKeys?.join('\n') ?? null;
  /** Hồ sơ đã hiện danh sách trong lần mount này → các lần tính sau giữ thứ tự. */
  const shownFor = useRef<string | null>(null);
  const ready = curriculumReady && progressLoaded && gameUnlocked !== null && manualSig !== null && storeKey === profileKey;

  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const tzOffsetMin = new Date(now).getTimezoneOffset();
    const fiveFinger = loadFiveFingerStats(activeId);
    const input: SmartInput = {
      profileId: profileKey,
      profile,
      now,
      tzOffsetMin,
      records,
      sessions: profile ? sessionsForProfile(allSessions, profile.id, profiles) : allSessions.filter((s) => !s.profileId),
      library: lessonManager.all(),
      usage: collectUsage(activeId, profileKey, records, fiveFinger, now, tzOffsetMin),
      fiveFinger,
      gameTimeRemainingMs: useGameTime.getState().remainingMs,
      labelStyle,
    };
    useSmartShortcuts.getState().refresh(input, new Set(manualSig ? manualSig.split('\n') : []), { keepOrder: shownFor.current === profileKey });
    shownFor.current = profileKey;
  }, [ready, profileKey, activeId, profile, profiles, records, allSessions, gameUnlocked, manualSig, labelStyle]);

  return useMemo(() => (storeKey === profileKey ? list.map(toSuggestion) : []), [list, storeKey, profileKey]);
}
