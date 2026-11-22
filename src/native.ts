import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

/* ==========================================================================
   Native shell behaviour.
   The router is the only place that knows what "back" means. A pushed screen
   carries a shadow history entry, so the platform back gesture walks back
   through the app; the native side is only told whether the screen on top was
   pushed, and closes the app when it was not.
   ========================================================================== */

/** A screen the user navigated into, as opposed to one of the five tabs. */
const isPushed = (path: string) => !path.includes('/', 1) || path.startsWith('/chat/');

export const isNativeShell = () => Capacitor.isNativePlatform();

type BackButtonPlugin = { armed: (options: { value: boolean }) => Promise<void> };
const BackButton = registerPlugin<BackButtonPlugin>('BackButton');

const hasShadow = () => (window.history.state as { beneShadow?: boolean } | null)?.beneShadow === true;
const dropShadow = () => {
  if (hasShadow()) window.history.replaceState(null, '');
};

export function useNativeBackButton(path: string) {
  const pushed = isPushed(path);

  useEffect(() => {
    if (isNativeShell()) void BackButton.armed({ value: pushed });
  }, [pushed]);

  useEffect(() => {
    if (!isNativeShell()) return undefined;
    if (pushed) {
      // Let the route change land first, then leave a marker behind it.
      const push = window.setTimeout(() => {
        if (!hasShadow()) window.history.pushState({ beneShadow: true }, '');
      }, 0);
      return () => {
        window.clearTimeout(push);
        dropShadow();
      };
    }
    // A tab is the last screen: chat threads are routes inside one tab, so their
    // shadow would stack on the tab's. Drop it and let the next press leave.
    dropShadow();
    return undefined;
  }, [path, pushed]);
}
