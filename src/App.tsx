import { useEffect } from 'react';
import { useApp } from './store/appStore';
import { useAppLifecycle, useTheme } from './hooks/useAppLifecycle';
import { LibraryScreen } from './screens/LibraryScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const route = useApp((s) => s.route);
  const loadProgress = useApp((s) => s.loadProgress);
  useAppLifecycle();
  useTheme();

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  return (
    <div className="h-full bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {route.name === 'library' && <LibraryScreen />}
      {route.name === 'practice' && <PracticeScreen lessonId={route.lessonId} />}
      {route.name === 'settings' && <SettingsScreen />}
    </div>
  );
}
