import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayRecord } from '../domain/types';

/**
 * The connect flow must never invent data: every result below is what the
 * bridge returned. The bridge is mocked here; the real one is exercised in a
 * browser and on device.
 */
const bridge = vi.hoisted(() => ({
  platform: vi.fn<() => 'apple-health' | 'health-connect' | 'unavailable'>(() => 'unavailable'),
  requestAccess: vi.fn(),
  checkAccess: vi.fn(),
  readDays: vi.fn(),
}));

vi.mock('./health', () => ({
  platform: bridge.platform,
  platformLabel: (p: string) =>
    p === 'apple-health' ? 'Apple Health' : p === 'health-connect' ? 'Health Connect' : 'Not available on this device',
  requestAccess: bridge.requestAccess,
  checkAccess: bridge.checkAccess,
  readDays: bridge.readDays,
  openSettings: vi.fn(),
}));

const { connectAndImport, describe: sentence, initialLink, probeAccess, readAndImport, statusWord, storeRowSubtitle } = await import('./link');

const day = (date: string): DayRecord => ({
  date,
  sleep: null,
  metrics: {
    date,
    steps: 1000,
    activeCalories: 0,
    totalCalories: 0,
    exerciseMinutes: 0,
    daylightMinutes: 0,
    hydrationMl: 0,
    caffeineMg: 0,
    alcoholGrams: 0,
    hrSamples: [],
    daytimeHrvMs: null,
    stressSamples: [],
    tempDeviationC: null,
    wearMinutes: 0,
  },
  workouts: [],
  meals: [],
  journal: [],
});

const ok = (readAuthorized: string[]) => ({ available: true, platform: 'apple-health' as const, readAuthorized, readDenied: [] });
const none = () => ({ available: false, platform: 'unavailable' as const, readAuthorized: [], readDenied: [] });

describe('health link flow', () => {
  beforeEach(() => {
    bridge.platform.mockReturnValue('apple-health');
    bridge.requestAccess.mockReset();
    bridge.checkAccess.mockReset();
    bridge.readDays.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('reads nothing and says so in a browser', async () => {
    bridge.platform.mockReturnValue('unavailable');
    // In a browser the bridge answers without prompting: no store, no access.
    bridge.requestAccess.mockResolvedValue(none());
    const importDays = vi.fn();
    const link = await connectAndImport(importDays);
    expect(bridge.readDays).not.toHaveBeenCalled();
    expect(importDays).not.toHaveBeenCalled();
    expect(link.phase).toBe('unavailable');
    expect(link.available).toBe(false);
    expect(link.detail).toMatch(/opens on a phone/);
    expect(statusWord(link)).toBe('Unavailable');
  });

  it('reports a denied permission without importing', async () => {
    bridge.requestAccess.mockResolvedValue(ok([]));
    const importDays = vi.fn();
    const link = await connectAndImport(importDays);
    expect(importDays).not.toHaveBeenCalled();
    expect(link.phase).toBe('denied');
    expect(link.detail).toMatch(/not granted/);
    expect(statusWord(link)).toBe('No access');
  });

  it('imports real days and counts them', async () => {
    bridge.requestAccess.mockResolvedValue(ok(['sleep', 'steps']));
    bridge.readDays.mockResolvedValue([day('2026-11-20'), day('2026-11-21')]);
    const importDays = vi.fn();
    const link = await connectAndImport(importDays);
    expect(importDays).toHaveBeenCalledWith([day('2026-11-20'), day('2026-11-21')]);
    expect(link.phase).toBe('connected');
    expect(link.days).toBe(2);
    expect(sentence(link.days)).toBe('Connected — 2 days of history read on this device.');
    expect(link.detail).toBe('Connected — 2 days of history read on this device.');
    expect(link.syncedAt).not.toBeNull();
  });

  it('says the store is empty rather than inventing a day', async () => {
    bridge.requestAccess.mockResolvedValue(ok(['sleep']));
    bridge.readDays.mockResolvedValue([]);
    const importDays = vi.fn();
    const link = await connectAndImport(importDays);
    expect(importDays).toHaveBeenCalledWith([]);
    expect(link.days).toBe(0);
    expect(link.detail).toMatch(/health store is empty/);
  });

  it('does not claim success when the read throws', async () => {
    bridge.requestAccess.mockResolvedValue(ok(['sleep']));
    bridge.readDays.mockRejectedValue(new Error('boom'));
    const importDays = vi.fn();
    const link = await connectAndImport(importDays);
    expect(importDays).not.toHaveBeenCalled();
    expect(link.phase).toBe('idle');
    expect(link.detail).toMatch(/Nothing was imported/);
  });

  it('sync now checks access without prompting', async () => {
    bridge.checkAccess.mockResolvedValue(ok(['sleep']));
    bridge.readDays.mockResolvedValue([day('2026-11-21')]);
    const importDays = vi.fn();
    const link = await readAndImport(importDays);
    expect(bridge.requestAccess).not.toHaveBeenCalled();
    expect(bridge.checkAccess).toHaveBeenCalled();
    expect(link.days).toBe(1);
  });

  it('distinguishes granted-but-not-yet-synced from not connected', async () => {
    bridge.checkAccess.mockResolvedValue(ok(['sleep']));
    const granted = await probeAccess();
    expect(granted.phase).toBe('connected');
    expect(granted.syncedAt).toBeNull();
    expect(statusWord(granted)).toBe('Connected');

    bridge.checkAccess.mockResolvedValue(ok([]));
    const missing = await probeAccess();
    expect(missing.phase).toBe('denied');
    expect(statusWord(missing)).toBe('No access');
  });

  it('starts unavailable in a browser, checking on a phone', () => {
    expect(initialLink('unavailable').phase).toBe('unavailable');
    expect(initialLink('health-connect').phase).toBe('checking');
    expect(initialLink('health-connect').platformLabel).toBe('Health Connect');
  });

  it('never claims a connection before the store has answered', () => {
    /* Being on Android is not evidence that Health Connect exists. The status
       used to report available on platform alone, which showed a connected dot
       and then flipped to unavailable when the user tapped it. */
    expect(initialLink('health-connect').available).toBe(false);
    expect(initialLink('apple-health').available).toBe(false);
  });

  it('tells an Android user the store may need installing, not that the app is broken', () => {
    const detail = initialLink('unavailable').detail;
    expect(detail).not.toMatch(/build/i);
  });

  it('turns "needs an update" into advice to update, not to install', async () => {
    /* Health Connect reports two different failures. "Needs an update" means it
       is installed; "unavailable" means it is not. Telling someone to install
       something they already have leaves them with no next step. */
    bridge.requestAccess.mockResolvedValue({
      available: false,
      platform: 'health-connect',
      readAuthorized: [],
      readDenied: [],
      reason: 'Health Connect needs an update.',
    });
    const link = await connectAndImport(vi.fn());
    expect(link.phase).toBe('unavailable');
    expect(link.detail).toMatch(/update/i);
    expect(link.detail).not.toMatch(/install it from the play store, then connect again/i);
  });

  it('repeats the OS reason when the store is simply missing', async () => {
    bridge.requestAccess.mockResolvedValue({
      available: false,
      platform: 'health-connect',
      readAuthorized: [],
      readDenied: [],
      reason: 'Health Connect is unavailable on this device.',
    });
    const link = await connectAndImport(vi.fn());
    expect(link.phase).toBe('unavailable');
    expect(link.detail).toMatch(/install/i);
    expect(link.detail).toMatch(/unavailable on this device/i);
  });

  it('never advertises readable data for a store that is unavailable', () => {
    /* The card used to say "Sleep, HRV, resting heart rate, steps, workouts"
       under an unavailable store, contradicting the banner right below it. */
    expect(storeRowSubtitle('unavailable')).toBe('Not available on this device');
    expect(storeRowSubtitle('unavailable')).not.toMatch(/sleep|hrv|steps/i);
  });

  it('describes the row by what the row is actually in', () => {
    expect(storeRowSubtitle('connected')).toMatch(/read-only/);
    expect(storeRowSubtitle('denied')).toMatch(/not granted/);
  });

  it('uses the same sentence for one day and many', () => {
    expect(sentence(1)).toBe('Connected — 1 day of history read on this device.');
    expect(none().available).toBe(false);
  });
});