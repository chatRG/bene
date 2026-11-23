import { describe, expect, it } from 'vitest';
import { canGoBackInRouter } from './native';

/**
 * The back gesture asks one question: is there a screen behind this one?
 * React Router records its position in history.state.idx, so the answer comes
 * from there and not from the web view's own canGoBack() — which reports true
 * for the entry the router is already on, and so ate the first press.
 *
 * A stub history is passed in because the suite runs without a DOM.
 */
const historyWith = (state: unknown) => ({ state }) as History;

describe('back navigation', () => {
  it('says no on the first entry, so the press closes the app', () => {
    expect(canGoBackInRouter(historyWith({ idx: 0 }))).toBe(false);
  });

  it('says yes one level deep', () => {
    expect(canGoBackInRouter(historyWith({ idx: 1 }))).toBe(true);
  });

  it('says yes several levels deep', () => {
    expect(canGoBackInRouter(historyWith({ idx: 3 }))).toBe(true);
  });

  it('says no when the router has recorded no position at all', () => {
    expect(canGoBackInRouter(historyWith({}))).toBe(false);
    expect(canGoBackInRouter(historyWith(null))).toBe(false);
  });

  it('says no rather than throwing when idx is not a number', () => {
    expect(canGoBackInRouter(historyWith({ idx: '2' }))).toBe(false);
  });
});
