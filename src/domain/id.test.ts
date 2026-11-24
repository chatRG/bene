import { describe, expect, it } from 'vitest';
import { uid } from './id';

describe('uid', () => {
  it('keeps the caller’s prefix', () => {
    expect(uid('msg-')).toMatch(/^msg-/);
  });

  it('stays unique across rapid successive calls', () => {
    // The failure this guards: two ids minted inside one millisecond used to
    // share a bare Date.now() timestamp.
    const ids = new Set(Array.from({ length: 5000 }, () => uid('x-')));
    expect(ids.size).toBe(5000);
  });
});
