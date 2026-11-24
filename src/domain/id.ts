/**
 * Unique ids for everything the store creates: chats, messages, journal
 * entries, custom tags, records, activity events, naps.
 *
 * A bare `Date.now()` timestamp collides the moment two records are made in
 * the same millisecond — two quick taps in one render, a message plus its
 * reply, an id followed by a second one in the same set() call. The counter
 * separates calls inside one millisecond; the random tail separates page
 * loads that happen to restart the counter within the same millisecond.
 */
let sequence = 0;

export function uid(prefix: string): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
