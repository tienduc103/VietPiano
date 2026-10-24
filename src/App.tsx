import { useEffect } from 'react';
import { useApp } from './store/appStore';
import { useAppLifecycle, useMidiConnection, useTheme } from './hooks/useAppLifecycle';
import { LibraryScreen } from './screens/LibraryScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AppVersionSide } from './components/AppVersion';
import { FloatingMicNote } from './components/MicPanel';
import { FloatingReloadButton } from './components/FloatingReloadButton';

export function App() {
  const route = useApp((s) => s.route);
  const loadProgress = useApp((s) => s.loadProgress);
  useAppLifecycle();
  useMidiConnection();
  useTheme();

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  return (
    <div className="h-full bg-gradient-to-br from-sky-100 via-violet-50 to-pink-100 text-slate-900 dark:from-slate-950 dark:via-violet-950 dark:to-slate-950 dark:text-slate-100">
      {route.name === 'library' && <LibraryScreen />}
      {route.name === 'practice' && <PracticeScreen lessonId={route.lessonId} />}
      {route.name === 'settings' && <SettingsScreen />}
      {/* Màn hình Luyện tập tự đặt nút trong khung khuông nhạc (góc phải dưới có bàn phím ảo + nút điều khiển). */}
      {route.name !== 'practice' && (
        <FloatingMicNote className="fixed right-[calc(12px+env(safe-area-inset-right,0px))] bottom-[calc(12px+env(safe-area-inset-bottom,0px))]" />
      )}
      <FloatingReloadButton />
      {/* TẠM THỜI trong giai đoạn xây dựng site — xoá khi không cần */}
      <AppVersionSide />
    </div>
  );
}
