import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

/* ==========================================================================
   Native shell behaviour.

   Android closes the app on back unless the web view has history behind it.
   The router already leaves a real history entry behind every screen the user
   navigates into, so the honest question is "does the router have somewhere
   to go back to" rather than "does the web view have a spare entry".

   The first attempt here pushed a marker entry per screen and relied on
   goBack() to walk it. That was wrong: the marker consumed the back press and
   the page never changed, so a nested screen needed two presses — one to eat
   the marker, one to actually leave. It could also strand the app on a screen
   with no route back.

   A popstate listener now answers the question directly. MainActivity asks
   history.state for a router index: below 1 the user is on the first entry the
   app pushed, so back falls through and closes the app.
   ========================================================================== */

export const isNativeShell = () => Capacitor.isNativePlatform();

/**
 * Tells the native shell whether the router can go back one screen.
 *
 * React Router keeps its own position in `history.state.idx`. Exposing that
 * as a plain global keeps MainActivity free of any assumption about route
 * names: it asks one question and gets one answer.
 */
const BACK_STATE_KEY = '__beneCanGoBack';

type BackState = Window & { [BACK_STATE_KEY]?: () => boolean };

export function canGoBackInRouter(history: History = window.history): boolean {
  const idx = (history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export function useNativeBackButton() {
  const installed = useRef(false);

  useEffect(() => {
    if (!isNativeShell() || installed.current) return undefined;
    installed.current = true;

    const publish = () => {
      (window as BackState)[BACK_STATE_KEY] = canGoBackInRouter;
    };
    publish();

    // The router updates history.state on a navigation but does not fire an
    // event the shell can see, so the getter is a function rather than a
    // cached boolean. MainActivity calls it per press and always reads truth.
    const onPop = () => publish();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      delete (window as BackState)[BACK_STATE_KEY];
      installed.current = false;
    };
  }, []);
}
