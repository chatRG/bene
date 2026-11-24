import { useCallback, useEffect } from 'react';
import { useLocation, useNavigationType, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';

/* ==========================================================================
   Native shell behaviour: what the system back gesture means inside Bene.

   A browser back button undoes browsing. An app back button goes up one
   screen, and at the top of the app it closes the app. Those are different
   rules, and the web view only offers the first one: its history records every
   place the person has been, including the tabs they visited on the way, so
   back from Home used to land on whichever tab was open before it.

   So the shell does not read browser history at all. Two things are tracked
   here instead:

   1. The screens that are stacked behind the current one. A tab is the top of
      its own stack, so switching tabs never leaves anything behind — back from
      Home asks whether to close the app, and the answer it takes is the app's,
      not the web view's.
   2. The overlays that are covering the screen. A sheet is drawn on top of the
      current screen, so back closes the sheet and leaves the screen where it
      is. That is one press, not two.

   MainActivity asks this module one question per press — "handle it or leave?"
   — and does the leaving itself, because only native code can close the app.
   ========================================================================== */

/** The screens that own the tab bar. Each is the root of its own stack. */
export const TAB_ROOTS = ['/', '/fitness', '/journal', '/biology', '/intelligence'];

export const isTabRoot = (path: string) => TAB_ROOTS.includes(path);

/**
 * A route without its trailing slash.
 *
 * React Router matches `/journal/` to `/journal`, so a stray slash must not look
 * like a different screen and leave an entry behind that back would have to
 * walk through.
 */
export const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/';

/**
 * The screen one level up from `path`.
 *
 * Used in two places: to seed the stack when the app opens directly on a screen
 * (a link, or a reload on a sub-page) so there is still something to go up to,
 * and as the fallback for a header back button that has no history behind it.
 */
export function parentOf(route: string): string {
  const path = normalizePath(route);
  if (path.startsWith('/chat/')) return '/intelligence';
  if (path.startsWith('/workout/')) return '/fitness';
  if (path.startsWith('/settings/')) return '/settings';
  return '/';
}

/** How React Router says we arrived at a screen. */
export type NavKind = 'PUSH' | 'REPLACE' | 'POP';

/**
 * The screen stack after arriving at `path`.
 *
 * Pure, so the rules can be tested without a browser: a tab replaces the whole
 * stack, a push adds a screen, a replace swaps the current one, a pop removes
 * it. Repeating the screen that is already on top is not a new screen, and a
 * stack that starts empty is seeded with the parent of the first route.
 */
export function nextStack(stack: readonly string[], route: string, kind: NavKind): string[] {
  const path = normalizePath(route);
  // A tab switch is not a step downwards. Landing on a tab drops everything the
  // old section had behind it, so back from a tab always leaves the app.
  if (isTabRoot(path)) return stack.length === 1 && stack[0] === path ? [...stack] : [path];
  if (!stack.length) {
    const parent = parentOf(path);
    return parent === path ? [path] : [parent, path];
  }
  if (kind === 'POP') return stack.length > 1 ? stack.slice(0, -1) : [...stack];
  if (kind === 'REPLACE') return [...stack.slice(0, -1), path];
  // Two pushes of the same screen in a row leave one screen, not two: a back
  // press that changed nothing would look like a dropped press.
  return stack[stack.length - 1] === path ? [...stack] : [...stack, path];
}

/* ---------------- State ---------------- */

let stack: string[] = [];

/** The screen on top, kept here so a press does not have to read the router. */
let current = '/';

/**
 * Set while a pop is on its way back from the web view's history.
 *
 * Two presses inside one frame would otherwise each call `history.back()` and
 * walk past a screen. One pop at a time; the second press is absorbed.
 */
let popPending = false;

/**
 * Which press the pending pop belongs to.
 *
 * Each pop is stamped before it starts; the watchdog only releases its own
 * stamp. A watchdog can otherwise outlive its pop when a newer pop has already
 * begun — releasing then would re-open the two-press window the flag exists to
 * close. recordNavigation clears `popPending` directly when a pop lands, so a
 * landed pop is never stuck waiting on its watchdog.
 */
let popPressId = 0;

/**
 * The router's own navigate, captured by the hook below.
 *
 * A screen that was opened directly — a link, or a reload on a sub-page — has
 * nothing behind it in the web view's history, so there is nothing to pop. The
 * press then goes to the parent screen instead of doing nothing.
 */
type RouterNavigate = (to: string, opts: { replace: boolean }) => void;
let routerNavigate: RouterNavigate | null = null;

const overlays = new Map<symbol, () => void>();

/**
 * How long after the "press back again" toast a second press still closes the
 * app. The toast itself is gone after 2.2 s, so the window matches it: a press
 * the person can still see a reason for is the one that counts.
 */
export const EXIT_WINDOW_MS = 2000;

/** When the last press on a tab root asked for confirmation, or 0 for none. */
let exitArmedAt = 0;

/**
 * The last navigation the router reported.
 *
 * React in StrictMode runs an effect twice, and a double-applied pop costs a
 * screen. The same navigation reported twice is one navigation, so it is
 * counted once. Real navigation never repeats itself exactly: two identical
 * reports in a row only happen when the same event is replayed.
 */
let lastRecord: { path: string; kind: NavKind } | null = null;

/** The toast the shell shows before it closes. Supplied by the view layer. */
let promptExit: (() => void) | null = null;

export const backStack = () => [...stack];

/** Only for tests: the module is a singleton so its stack outlives a test. */
export const resetBackStack = () => {
  stack = [];
  current = '/';
  popPending = false;
  popPressId = 0;
  routerNavigate = null;
  exitArmedAt = 0;
  promptExit = null;
  lastRecord = null;
  overlays.clear();
};

export function recordNavigation(route: string, kind: NavKind) {
  const path = normalizePath(route);
  if (lastRecord && lastRecord.path === path && lastRecord.kind === kind) return;
  lastRecord = { path, kind };
  stack = nextStack(stack, path, kind);
  current = path;
  popPending = false;
  // Walking anywhere means the person did not mean to leave: a press that is
  // still armed from before must not close the app from a new screen.
  exitArmedAt = 0;
}

/**
 * Start a history pop and shield it from a second press.
 *
 * `popPending` goes up first, so a press that arrives while the web view is
 * still walking its history is absorbed instead of popping a second screen.
 * A pop that never lands must not wedge the gesture either: the watchdog
 * releases the flag shortly afterwards — but only while no newer press has
 * started a pop of its own (see popPressId).
 */
export function beginPop(): void {
  popPending = true;
  const press = popPressId + 1;
  popPressId = press;
  setTimeout(() => {
    if (popPressId === press) popPending = false;
  }, 400);
}

/**
 * Whether the web view really has an entry behind this one.
 *
 * React Router records its own position in `history.state.idx`. At 0 there is
 * nothing behind us whatever our stack says, which is the deep-link case.
 */
function historyBehind(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

/**
 * Registers something that covers the screen and can be dismissed — a sheet.
 * The newest registration is closed first, which is the one on top.
 */
export function registerOverlay(token: symbol, close: () => void) {
  overlays.set(token, close);
}

export function removeOverlay(token: symbol) {
  overlays.delete(token);
}

export type BackIntent = 'overlay' | 'screen' | 'exit';

/**
 * What one back press should do, asked before anything moves.
 *
 * `exit` is the answer at a tab root, which is the whole point of this module:
 * it is the shell's cue to offer to close the app rather than to walk the web
 * view back through screens the person has already left.
 */
export function backIntent(): BackIntent {
  if (overlays.size) return 'overlay';
  return stack.length > 1 ? 'screen' : 'exit';
}

/**
 * One back press, answered in JS.
 *
 * Returns 'handled' when the press was used here, 'exit' when there is nothing
 * left to go up to. Exposed on `window` for MainActivity, which cannot import
 * TypeScript but can evaluate one expression.
 *
 * The top of the app asks before it closes. A single press on Home is far too
 * easy to make by accident — it is the same gesture as "leave this screen" —
 * so the first one shows a toast and the next one, while that toast is still on
 * screen, closes the app. `now` is a parameter so the window can be tested
 * without waiting two seconds.
 */
export function handleBack(now: number = Date.now()): 'handled' | 'exit' {
  const intent = backIntent();
  if (intent === 'overlay') {
    const close = [...overlays.values()].pop();
    close?.();
    return 'handled';
  }
  if (intent === 'screen') {
    // A pop already on its way means this press is the second half of one
    // gesture, not a request for a second screen.
    if (popPending) return 'handled';
    if (historyBehind()) {
      beginPop();
      window.history.back();
    } else if (routerNavigate) {
      routerNavigate(parentOf(current), { replace: true });
    }
    return 'handled';
  }

  const confirmed = exitArmedAt !== 0 && now - exitArmedAt <= EXIT_WINDOW_MS;
  exitArmedAt = confirmed ? 0 : now;
  if (confirmed) return 'exit';
  promptExit?.();
  return 'handled';
}

/** The global MainActivity evaluates. Kept in one place so both sides agree. */
export const BACK_BRIDGE = '__beneBack';

type BackWindow = Window & { [BACK_BRIDGE]?: () => 'handled' | 'exit' };

/* ---------------- Hooks ---------------- */

/**
 * Keeps the stack in step with the router and publishes `window.__beneBack`.
 *
 * Installed on every platform, not only in the app shell: the web build is the
 * same code, and a browser back press should follow the same rule rather than
 * only the packaged app. Nothing calls the bridge unless the shell does.
 *
 * `onExitPrompt` is the toast shown before the app closes. It is passed in
 * rather than imported so this module stays free of the view layer.
 */
export function useNativeBackButton(onExitPrompt?: () => void) {
  const location = useLocation();
  const kind = useNavigationType() as NavKind;
  const navigate = useNavigate();

  useEffect(() => {
    recordNavigation(location.pathname, kind);
  }, [location.pathname, kind]);

  useEffect(() => {
    routerNavigate = (to, opts) => navigate(to, opts);
    return () => {
      routerNavigate = null;
    };
  }, [navigate]);

  useEffect(() => {
    promptExit = onExitPrompt ?? null;
    return () => {
      promptExit = null;
    };
  }, [onExitPrompt]);

  useEffect(() => {
    (window as BackWindow)[BACK_BRIDGE] = handleBack;
    return () => {
      delete (window as BackWindow)[BACK_BRIDGE];
    };
  }, []);
}

/**
 * The back action of a header back button, shared by the hook below so the
 * rules can be tested without a renderer.
 *
 * It goes back one screen when there is history behind it, and up to the parent
 * screen when there is not — a screen opened from a link or a reload has no
 * history, and `navigate(-1)` there would leave the app instead of going up.
 *
 * A pop started here is shielded like any other: the flag goes up before
 * `navigate(-1)`, so a system back gesture arriving right behind the tap —
 * the tap and the gesture being one motion on Android — is absorbed by
 * handleBack instead of popping a second screen.
 */
export function popCurrentScreen(navigate: NavigateFunction, pathname: string): void {
  if (stack.length > 1 && historyBehind()) {
    beginPop();
    navigate(-1);
  } else {
    navigate(parentOf(pathname), { replace: true });
  }
}

export function useGoBack(): () => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(() => popCurrentScreen(navigate, pathname), [navigate, pathname]);
}
