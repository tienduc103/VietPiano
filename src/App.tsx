import { useEffect } from 'react';
import { useApp } from './store/appStore';
import { useAppLifecycle, useTheme } from './hooks/useAppLifecycle';
import { LibraryScreen } from './screens/LibraryScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AppVersionSide } from './components/AppVersion';
import { FloatingDetectedNote } from './components/MicPanel';

export function App() {
  const route = useApp((s) => s.route);
  const loadProgress = useApp((s) => s.loadProgress);
  useAppLifecycle();
  useTheme();

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  return (
    <div className="h-full bg-gradient-to-br from-sky-100 via-violet-50 to-pink-100 text-slate-900 dark:from-slate-950 dark:via-violet-950 dark:to-slate-950 dark:text-slate-100">
      {route.name === 'library' && <LibraryScreen />}
      {route.name === 'practice' && <PracticeScreen lessonId={route.lessonId} />}
      {route.name === 'settings' && <SettingsScreen />}
      {/* Luyện tập và Cài đặt đã có ô "Nghe thấy" riêng → không hiện trùng. */}
      {route.name === 'library' && <FloatingDetectedNote />}
      {/* TẠM THỜI trong giai đoạn xây dựng site — xoá khi không cần */}
      <AppVersionSide />
    </div>
  );
}
