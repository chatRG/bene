import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXIT_WINDOW_MS,
  backIntent,
  backStack,
  handleBack,
  isTabRoot,
  nextStack,
  parentOf,
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
