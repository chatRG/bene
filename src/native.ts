import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/* ==========================================================================
   Native shell behaviour.

   Android closes the app on back unless the web view has history behind it.
   So every screen the user navigates into leaves a marker entry in the
   history; back pops the marker, which returns to the previous screen. A tab
   has no marker, so its back press falls through and closes the app.

   MainActivity asks the web view's own canGoBack() for that decision, so this
   file keeps no native state and there is nothing to drift out of sync.
   ========================================================================== */

export const isNativeShell = () => Capacitor.isNativePlatform();

/** The five tabs. Everything else is a screen the user navigated into. */
const TABS = ['/', '/fitness', '/journal', '/biology', '/intelligence'] as const;

/**
 * A screen the user navigated into, as opposed to one of the five tabs.
 * Compared against the tab list rather than by counting slashes, because
 * `/settings` and `/recovery` are top-level paths that are still pushed
 * screens.
 */
export function isPushed(path: string): boolean {
  if (path.startsWith('/chat/')) return true;
  return !(TABS as readonly string[]).includes(path);
}

const hasShadow = () => (window.history.state as { beneShadow?: boolean } | null)?.beneShadow === true;

export function useNativeBackButton(path: string) {
  const pushed = isPushed(path);

  useEffect(() => {
    if (!isNativeShell()) return undefined;
    if (!pushed) {
      // Back on a tab: drop any marker a thread or detail screen left behind,
      // so this tab's back press closes the app rather than revisiting it.
      if (hasShadow()) window.history.replaceState(null, '');
      return undefined;
    }
    // Leave a marker behind the current entry. Pushed in the same tick as the
    // navigation, so a back press straight after it cannot outrun the marker.
    if (!hasShadow()) window.history.pushState({ beneShadow: true }, '');
    return () => {
      if (hasShadow()) window.history.replaceState(null, '');
    };
  }, [path, pushed]);
}
