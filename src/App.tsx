import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import type { ThemeMode } from './domain/types';
import { useNativeBackButton } from './native';
import { TabBar } from './components/ui';
import { ToastHost } from './components/toast';
import { HomeScreen } from './screens/HomeScreen';
import { RecoveryScreen } from './screens/RecoveryScreen';
import { SleepScreen } from './screens/SleepScreen';
import { StrainScreen } from './screens/StrainScreen';
import { TimelineScreen } from './screens/TimelineScreen';
import { FitnessScreen } from './screens/FitnessScreen';
import { JournalScreen } from './screens/JournalScreen';
import { BiologyScreen } from './screens/BiologyScreen';
import { NutritionScreen } from './screens/NutritionScreen';
import { IntelligenceScreen } from './screens/IntelligenceScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { WorkoutDetailScreen } from './screens/WorkoutDetailScreen';
import { RecordsScreen } from './screens/RecordsScreen';

const TABS = ['/', '/fitness', '/journal', '/biology', '/intelligence'];

const THEME_COLOR: Record<string, string> = {
  light: '#F7F6F2',
  dark: '#0A0E18',
  midnight: '#000000',
};

function ThemeSync() {
  const theme = useAppStore((s) => s.settings.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved: ThemeMode =
        theme === 'midnight' ? 'midnight' : theme === 'dark' || (theme === 'system' && media.matches) ? 'dark' : 'light';
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR[resolved]);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

function BackToPreviousScreen() {
  const location = useLocation();
  useNativeBackButton(location.pathname);
  return null;
}

function Shell() {
  const location = useLocation();
  const onboarded = useAppStore((s) => s.settings.onboarded);
  const ensureToday = useAppStore((s) => s.ensureToday);
  const autoBackup = useAppStore((s) => s.settings.autoBackup);
  const lastBackupAt = useAppStore((s) => s.settings.lastBackupAt);
  const backupNow = useAppStore((s) => s.backupNow);
  const isTab = TABS.includes(location.pathname) || location.pathname.startsWith('/chat/');
  const isOnboarding = location.pathname === '/onboarding';

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);

  useEffect(() => {
    if (!onboarded || !autoBackup) return;
    const last = lastBackupAt ? new Date(lastBackupAt).getTime() : 0;
    if (Date.now() - last > 24 * 60 * 60 * 1000) backupNow();
  }, [onboarded, autoBackup, lastBackupAt, backupNow]);

  if (!onboarded && !isOnboarding) return <Navigate to="/onboarding" replace />;
  if (onboarded && isOnboarding) return <Navigate to="/" replace />;

  return (
    <div className="app-shell">
      <BackToPreviousScreen />
      <Routes>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/" element={<HomeScreen />} />
        <Route path="/recovery" element={<RecoveryScreen />} />
        <Route path="/sleep" element={<SleepScreen />} />
        <Route path="/strain" element={<StrainScreen />} />
        <Route path="/timeline" element={<TimelineScreen />} />
        <Route path="/fitness" element={<FitnessScreen />} />
        <Route path="/journal" element={<JournalScreen />} />
        <Route path="/biology" element={<BiologyScreen />} />
        <Route path="/nutrition" element={<NutritionScreen />} />
        <Route path="/intelligence" element={<IntelligenceScreen />} />
        <Route path="/chat/:id" element={<IntelligenceScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/:section" element={<SettingsScreen />} />
        <Route path="/workout/:id" element={<WorkoutDetailScreen />} />
        <Route path="/records" element={<RecordsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isTab ? <TabBar /> : null}
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <Shell />
    </HashRouter>
  );
}
