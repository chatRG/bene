import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router-dom';
import {
  EXIT_WINDOW_MS,
  backIntent,
  backStack,
  handleBack,
  isTabRoot,
  nextStack,
  parentOf,
  popCurrentScreen,
  recordNavigation,
  registerOverlay,
  removeOverlay,
  resetBackStack,
} from './native';

/**
 * The back gesture is the app's, not the browser's.
 *
 * Two rules are tested here, because they are the two that made the app feel
 * like a web page:
 *
 * 1. A tab is the top of its own stack. Switching tabs must not leave the old
 *    tab behind, or back from Home returns to whatever tab was open before it
 *    instead of closing the app.
 * 2. A sheet is dismissed by back before the screen under it is left.
 */
describe('screen stack', () => {
  it('treats every tab as a root', () => {
    for (const path of ['/', '/fitness', '/journal', '/biology', '/intelligence']) {
      expect(isTabRoot(path)).toBe(true);
    }
    expect(isTabRoot('/recovery')).toBe(false);
    expect(isTabRoot('/chat/chat-1')).toBe(false);
  });

  it('does not stack tabs on top of each other', () => {
    let stack = nextStack([], '/', 'POP');
    stack = nextStack(stack, '/fitness', 'PUSH');
    stack = nextStack(stack, '/journal', 'PUSH');
    stack = nextStack(stack, '/intelligence', 'PUSH');
    expect(stack).toEqual(['/intelligence']);
    expect(nextStack(stack, '/', 'REPLACE')).toEqual(['/']);
  });

  it('stacks a screen opened from a tab, and unwinds it', () => {
    let stack = nextStack([], '/', 'POP');
    stack = nextStack(stack, '/recovery', 'PUSH');
    expect(stack).toEqual(['/', '/recovery']);
    stack = nextStack(stack, '/recovery', 'POP');
    expect(stack).toEqual(['/']);
  });

  it('keeps a chain of screens, not only one level', () => {
    let stack = nextStack([], '/profile', 'PUSH');
    expect(stack).toEqual(['/', '/profile']);
    stack = nextStack(stack, '/settings/general', 'PUSH');
    expect(stack).toEqual(['/', '/profile', '/settings/general']);
    stack = nextStack(stack, '/settings/general', 'POP');
    expect(stack).toEqual(['/', '/profile']);
  });

  it('swaps the screen on a replace instead of adding one', () => {
    const stack = nextStack(['/', '/profile'], '/settings', 'REPLACE');
    expect(stack).toEqual(['/', '/settings']);
  });

  it('does not treat a trailing slash as a different screen', () => {
    expect(nextStack(['/', '/fitness'], '/recovery/', 'PUSH')).toEqual(['/', '/fitness', '/recovery']);
    expect(nextStack(['/'], '/journal/', 'PUSH')).toEqual(['/journal']);
  });

  it('ignores a repeat of the screen already on top', () => {
    expect(nextStack(['/', '/profile'], '/profile', 'PUSH')).toEqual(['/', '/profile']);
  });

  it('stays put when there is nothing to pop', () => {
    expect(nextStack(['/'], '/', 'POP')).toEqual(['/']);
  });

  it('seeds the stack when the app opens on a screen, not on the root', () => {
    expect(nextStack([], '/sleep', 'POP')).toEqual(['/', '/sleep']);
    expect(nextStack([], '/chat/chat-1', 'POP')).toEqual(['/intelligence', '/chat/chat-1']);
    expect(nextStack([], '/', 'POP')).toEqual(['/']);
  });
});

describe('parent screen', () => {
  it('is the section root a screen belongs to', () => {
    expect(parentOf('/chat/chat-1')).toBe('/intelligence');
    expect(parentOf('/workout/routine-1')).toBe('/fitness');
    expect(parentOf('/settings/general')).toBe('/settings');
    expect(parentOf('/recovery')).toBe('/');
    expect(parentOf('/')).toBe('/');
  });
});

describe('back intent', () => {
  beforeEach(() => resetBackStack());

  it('never reports a tab as a screen to go back to', () => {
    recordNavigation('/', 'POP');
    recordNavigation('/fitness', 'PUSH');
    recordNavigation('/journal', 'PUSH');
    expect(backStack()).toEqual(['/journal']);
    expect(backIntent()).toBe('exit');
  });

  it('counts the same navigation twice as one', () => {
    recordNavigation('/sleep', 'POP');
    recordNavigation('/sleep', 'POP');
    expect(backStack()).toEqual(['/', '/sleep']);
  });

  it('goes back a screen when one is stacked', () => {
    recordNavigation('/', 'POP');
    recordNavigation('/sleep', 'PUSH');
    expect(backIntent()).toBe('screen');
  });

  it('closes an open sheet first, then leaves the screen alone', () => {
    recordNavigation('/', 'POP');
    recordNavigation('/timeline', 'PUSH');
    const token = Symbol('sheet');
    let closed = 0;
    registerOverlay(token, () => {
      closed += 1;
    });
    expect(backIntent()).toBe('overlay');
    removeOverlay(token);
    expect(backIntent()).toBe('screen');
    expect(closed).toBe(0);
  });

  it('exits from a tab even with a sheet open once the sheet is gone', () => {
    recordNavigation('/', 'POP');
    const token = Symbol('sheet');
    registerOverlay(token, () => undefined);
    expect(backIntent()).toBe('overlay');
    removeOverlay(token);
    expect(backIntent()).toBe('exit');
  });
});

/**
 * The top of the app asks before it closes: one press is too easy to make by
 * accident, because it is the same gesture as leaving a screen.
 */
describe('closing the app', () => {
  beforeEach(() => resetBackStack());

  it('asks on the first press and closes on the second', () => {
    recordNavigation('/', 'POP');
    expect(handleBack(1_000)).toBe('handled');
    expect(handleBack(1_000 + EXIT_WINDOW_MS)).toBe('exit');
  });

  it('asks again when the second press came too late', () => {
    recordNavigation('/', 'POP');
    expect(handleBack(1_000)).toBe('handled');
    expect(handleBack(1_000 + EXIT_WINDOW_MS + 1)).toBe('handled');
    expect(handleBack(1_000 + EXIT_WINDOW_MS + 2)).toBe('exit');
  });

  it('asks again after a confirmed exit had been asked twice', () => {
    recordNavigation('/', 'POP');
    expect(handleBack(1_000)).toBe('handled');
    expect(handleBack(1_100)).toBe('exit');
    expect(handleBack(1_200)).toBe('handled');
  });

  it('forgets the ask once the person moves to another screen', () => {
    recordNavigation('/', 'POP');
    expect(handleBack(1_000)).toBe('handled');
    recordNavigation('/sleep', 'PUSH');
    recordNavigation('/', 'POP');
    expect(handleBack(1_100)).toBe('handled');
  });
});

/**
 * One pop at a time. A pop is asynchronous — the web view has to walk its own
 * history — so the shell absorbs any press that arrives while one is in
 * flight, and releases the shield when the pop lands or its watchdog expires.
 */
describe('pops in flight', () => {
  beforeEach(() => {
    resetBackStack();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A web view that has history behind it and a spy where back() lands. */
  function stubHistory(idx: number): { back: ReturnType<typeof vi.fn> } {
    const back = vi.fn();
    vi.stubGlobal('window', { history: { state: { idx }, back } });
    return { back };
  }

  function seedStack(): void {
    recordNavigation('/', 'POP');
    recordNavigation('/sleep', 'PUSH');
  }

  it('absorbs a second press while a pop is in flight', () => {
    const win = stubHistory(2);
    seedStack();

    expect(handleBack(1_000)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(1);
    expect(handleBack(1_100)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(1);

    // Once the pop has landed, the next press goes through again.
    recordNavigation('/', 'POP');
    recordNavigation('/sleep', 'PUSH');
    expect(handleBack(1_200)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(2);
  });

  it('releases the shield when a pop never lands', () => {
    const win = stubHistory(2);
    seedStack();

    handleBack(0);
    vi.advanceTimersByTime(400);

    expect(handleBack(1)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(2);
  });

  it('a stale watchdog does not release while a newer pop is still in flight', () => {
    const win = stubHistory(3);
    recordNavigation('/', 'POP');
    recordNavigation('/sleep', 'PUSH');
    recordNavigation('/deep', 'PUSH');

    handleBack(0); // pop 1, watchdog armed for t=400
    vi.advanceTimersByTime(100);
    recordNavigation('/sleep', 'POP'); // pop 1 lands at t=100
    handleBack(100); // pop 2, watchdog armed for t=500
    vi.advanceTimersByTime(300); // t=400: pop 1's watchdog fires

    // Still pop 2's flight: this press must be absorbed, not popped.
    expect(handleBack(400)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(2);

    // t=500: pop 2's own watchdog releases, and the next press goes through.
    vi.advanceTimersByTime(100);
    expect(handleBack(500)).toBe('handled');
    expect(win.back).toHaveBeenCalledTimes(3);
  });

  it('a header back tap shields the system gesture that follows it', () => {
    const win = stubHistory(2);
    seedStack();

    const navigate = vi.fn() as unknown as NavigateFunction;
    popCurrentScreen(navigate, '/sleep');
    expect(navigate).toHaveBeenCalledWith(-1);
    expect(win.back).not.toHaveBeenCalled();

    // The gesture right behind the tap is the second half of one motion.
    expect(handleBack(1_000)).toBe('handled');
    expect(win.back).not.toHaveBeenCalled();
  });

  it('a header back tap with no history behind goes up to the parent instead', () => {
    stubHistory(0);
    seedStack();

    const navigate = vi.fn() as unknown as NavigateFunction;
    popCurrentScreen(navigate, '/sleep');
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
