import { lazy, Suspense, useEffect } from 'react';
import { useApp } from './store/appStore';
import { useAppLifecycle, useMidiConnection, useTheme } from './hooks/useAppLifecycle';
import { useVoiceTeacherLifecycle } from './hooks/useVoiceTeacher';
import { PracticeScreen } from './screens/PracticeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CurriculumScreen } from './screens/CurriculumScreen';
import { LessonPlayerScreen } from './screens/LessonPlayerScreen';
import { GamesScreen } from './screens/GamesScreen';
import { NoteHunterScreen } from './screens/NoteHunterScreen';
import { FlappyNoteScreen } from './screens/FlappyNoteScreen';
import { BalloonPopScreen } from './screens/BalloonPopScreen';
import { TomatoHarvestScreen } from './screens/TomatoHarvestScreen';
import { F1RacingScreen } from './screens/F1RacingScreen';
import { SupplementScreen } from './screens/SupplementScreen';
import { NoteDiscoveryScreen } from './screens/NoteDiscoveryScreen';
import { SongLibraryScreen } from './screens/SongLibraryScreen';
import { FiveFingerScreen } from './screens/FiveFingerScreen';
import { useCurriculum } from './store/curriculumStore';
import { useProfiles } from './store/profileStore';
import { AppVersionSide } from './components/AppVersion';
import { FloatingMicNote } from './components/MicPanel';
import { FloatingReloadButton } from './components/FloatingReloadButton';
import { GameTimeController, TimedGameRoute } from './components/GameTimeLimit';
import { ShortcutOverlays } from './components/shortcuts/ShortcutOverlays';

/** AI Piano Coach tải riêng (chunk khác, vẫn được service worker cache để chạy offline). */
const CoachScreen = lazy(() => import('./screens/CoachScreen').then((m) => ({ default: m.CoachScreen })));
const TechniqueScreen = lazy(() => import('./screens/TechniqueScreen').then((m) => ({ default: m.TechniqueScreen })));

export function App() {
  const route = useApp((s) => s.route);
  const loadProgress = useApp((s) => s.loadProgress);
  useAppLifecycle();
  useMidiConnection();
  useTheme();
  useVoiceTeacherLifecycle();

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  // Tiến độ giáo trình theo người học đang chọn.
  const activeProfileId = useProfiles((s) => s.activeId);
  useEffect(() => {
    void useCurriculum.getState().load(activeProfileId);
  }, [activeProfileId]);

  return (
    <div className="h-full bg-gradient-to-br from-sky-100 via-violet-50 to-pink-100 text-slate-900 dark:from-slate-950 dark:via-violet-950 dark:to-slate-950 dark:text-slate-100">
      {route.name === 'dashboard' && <DashboardScreen />}
      {route.name === 'curriculum' && <CurriculumScreen levelId={route.levelId} />}
      {route.name === 'lesson' && <LessonPlayerScreen lessonId={route.lessonId} stage={route.stage} />}
      {route.name === 'library' && <DashboardScreen focus="library" />}
      {route.name === 'song-library' && <SongLibraryScreen />}
      {route.name === 'games' && <GamesScreen key={route.open ? JSON.stringify(route.open) : 'list'} open={route.open} />}
      {route.name === 'note-hunter' && <TimedGameRoute><NoteHunterScreen /></TimedGameRoute>}
      {route.name === 'flappy-note' && <TimedGameRoute><FlappyNoteScreen /></TimedGameRoute>}
      {route.name === 'balloon-pop' && <TimedGameRoute><BalloonPopScreen key={route.preset ? JSON.stringify(route.preset) : 'free'} preset={route.preset} returnTo={route.returnTo} /></TimedGameRoute>}
      {route.name === 'tomato-harvest' && <TimedGameRoute><TomatoHarvestScreen /></TimedGameRoute>}
      {route.name === 'f1-racing' && <TimedGameRoute><F1RacingScreen /></TimedGameRoute>}
      {route.name === 'supplement' && <SupplementScreen />}
      {route.name === 'five-finger' && <FiveFingerScreen />}
      {route.name === 'note-discovery' && <NoteDiscoveryScreen />}
      {route.name === 'practice' && <PracticeScreen lessonId={route.lessonId} />}
      {route.name === 'coach' && (
        <Suspense fallback={<div className="grid h-full place-items-center text-slate-500">Đang mở AI Piano Coach…</div>}>
          <CoachScreen
            key={`${route.lessonId ?? ''}|${route.measures?.join('-') ?? ''}|${route.bpm ?? ''}|${route.hand ?? ''}`}
            lessonId={route.lessonId}
            measures={route.measures}
            bpm={route.bpm}
            hand={route.hand}
            returnTo={route.returnTo}
          />
        </Suspense>
      )}
      {route.name === 'technique' && (
        <Suspense fallback={<div className="grid h-full place-items-center text-slate-500">Đang mở Luyện kỹ thuật ngón tay…</div>}>
          <TechniqueScreen key={route.tab ?? 'today'} tab={route.tab} />
        </Suspense>
      )}
      {route.name === 'settings' && <SettingsScreen section={route.section} />}
      {/* Màn hình Luyện tập tự đặt nút trong khung khuông nhạc (góc phải dưới có bàn phím ảo + nút điều khiển). */}
      {route.name !== 'practice' && route.name !== 'lesson' && route.name !== 'note-hunter' && route.name !== 'flappy-note' && route.name !== 'balloon-pop' && route.name !== 'tomato-harvest' && route.name !== 'f1-racing' && route.name !== 'five-finger' && (
        <FloatingMicNote className="fixed right-[calc(12px+env(safe-area-inset-right,0px))] bottom-[calc(12px+env(safe-area-inset-bottom,0px))]" />
      )}
      <FloatingReloadButton />
      <GameTimeController />
      {/* Hộp thoại tạo / sửa / ghim lối tắt, thanh Hoàn tác, thông báo lối tắt hỏng — dùng chung mọi màn. */}
      <ShortcutOverlays />
      {/* TẠM THỜI trong giai đoạn xây dựng site — xoá khi không cần */}
      <AppVersionSide />
    </div>
  );
}
