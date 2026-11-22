import { describe, expect, it } from 'vitest';
import { isPushed } from './native';

/**
 * isPushed decides whether Android's back button walks back a screen or closes
 * the app, so it is the one piece of this behaviour that can be tested without
 * a device.
 */
describe('back navigation', () => {
  it('treats the five tabs as the last screen', () => {
    for (const tab of ['/', '/fitness', '/journal', '/biology', '/intelligence']) {
      expect(isPushed(tab)).toBe(false);
    }
  });

  it('treats anything the user navigated into as a pushed screen', () => {
    for (const path of ['/settings', '/settings/goals', '/recovery', '/sleep', '/records', '/workout/r1']) {
      expect(isPushed(path)).toBe(true);
    }
  });

  it('treats a chat thread as pushed, because it sits inside the chat tab', () => {
    expect(isPushed('/chat/abc')).toBe(true);
  });
});
