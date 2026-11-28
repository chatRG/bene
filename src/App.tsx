import { useCallback, useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import type { ThemeMode } from './domain/types';
import { TAB_ROOTS, useNativeBackButton } from './native';
import { readAndImport } from './native/link';
import { TabBar } from './components/ui';
import { ToastHost, showToast } from './components/toast';
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

// The tab roots, plus the chat screen, which keeps the bar so a conversation
// can still be left by tapping a tab. Both come from one list: the shell's idea
// of a tab and the back gesture's idea of the top of the app must not drift.
const CHAT = '/chat/';

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

/**
 * Mounts the shell's back behaviour. Named for what it replaces: the web view's
 * own idea of going back to the previous page.
 *
 * The toast is the same one the app uses everywhere else, so the prompt before
 * closing looks like the rest of the app rather than a system dialog.
 */
function NativeBack() {
  const promptExit = useCallback(() => showToast('Press back again to exit'), []);
  useNativeBackButton(promptExit);
  return null;
}

function Shell() {
  const location = useLocation();
  const onboarded = useAppStore((s) => s.settings.onboarded);
  const ensureToday = useAppStore((s) => s.ensureToday);
  const importHealthDays = useAppStore((s) => s.importHealthDays);
  const autoSyncStarted = useRef(false);
  const autoBackup = useAppStore((s) => s.settings.autoBackup);
  const lastBackupAt = useAppStore((s) => s.settings.lastBackupAt);
  const backupNow = useAppStore((s) => s.backupNow);
  const activeTabs = useAppStore((s) => s.settings.activeTabs);
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const isTab = TAB_ROOTS.includes(path) || path.startsWith(CHAT);
  const isOnboarding = path === '/onboarding';

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);

  useEffect(() => {
    if (!onboarded) {
      // Delete-all leaves Shell mounted. Reset the one-shot guard so a fresh
      // account in the same session still syncs on its first open.
      autoSyncStarted.current = false;
      return;
    }
    if (autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    ensureToday();
    // Read existing grants only. First-time permission belongs to the explicit
    // Connect flow; opening the app must never surprise the user with a prompt.
    const lastSyncedAt = useAppStore.getState().settings.lastHealthSyncAt;
    // Onboarding's Connect already performed a full read moments ago. Do not
    // follow it with a second immediate round-trip. A future clock-skewed
    // cursor must still sync: syncWindowDays treats it as a full resync.
    const elapsed = lastSyncedAt ? Date.now() - Date.parse(lastSyncedAt) : Number.NaN;
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 60_000) return;
    void readAndImport(importHealthDays, lastSyncedAt).catch(() => {
      // The link turns expected store failures into an idle result. This catch
      // only prevents an unexpected bridge rejection becoming an unhandled one.
    });
  }, [onboarded, ensureToday, importHealthDays]);

  useEffect(() => {
    if (!onboarded) return;
    const sync = () => {
      ensureToday();
      const lastSyncedAt = useAppStore.getState().settings.lastHealthSyncAt;
      const elapsed = lastSyncedAt ? Date.now() - Date.parse(lastSyncedAt) : Number.NaN;
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 60_000) return;
      void readAndImport(importHealthDays, lastSyncedAt).catch(() => {
        // Expected bridge failures become idle results in link.ts.
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Keep the timeline current if the app stays open across midnight.
    const ticker = window.setInterval(() => ensureToday(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(ticker);
    };
  }, [onboarded, ensureToday, importHealthDays]);

  useEffect(() => {
    if (!onboarded || !autoBackup) return;
    const last = lastBackupAt ? new Date(lastBackupAt).getTime() : 0;
    if (Date.now() - last > 24 * 60 * 60 * 1000) backupNow();
  }, [onboarded, autoBackup, lastBackupAt, backupNow]);

  if (!onboarded && !isOnboarding) return <Navigate to="/onboarding" replace />;
  if (onboarded && isOnboarding) return <Navigate to="/" replace />;

  // A disabled feature is unreachable, not merely hidden from the tab bar: an
  // old link or a back press would still land on it and resume tracking. Its
  // sub-screens (a workout detail, a settings section) are covered too.
  //
  // Compared against the normalised path above: React Router matches `/journal/`
  // to the `/journal` route, so an exact comparison would let a trailing slash
  // through and the "disabled" screen would render and still write data.
  const off =
    (path.startsWith('/workout/') && !activeTabs.fitness) ||
    (path === '/fitness' && !activeTabs.fitness) ||
    (path === '/journal' && !activeTabs.journal) ||
    (path === '/biology' && !activeTabs.biology) ||
    (path === '/records' && !activeTabs.biology) ||
    (path === '/nutrition' && !activeTabs.nutrition);
  if (off) return <Navigate to="/" replace />;

  return (
    <div className="app-shell">
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
      <NativeBack />
      <Shell />
    </HashRouter>
  );
}
