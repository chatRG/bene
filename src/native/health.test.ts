import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthSample, SleepStage, Workout as HealthWorkout } from '@capgo/capacitor-health';
import type { DayRecord, ISODate } from '../domain/types';
import { READ_TYPES, checkAccess, platform, platformLabel, requestAccess, toSleepSession } from './health';

/**
 * health.ts is the seam between the phone's health store and Bene's own shapes.
 * The plugin speaks ISO timestamps, sleep *states* and SI seconds/metres; Bene
 * speaks local dates, four sleep stages and minutes/kilometres. A wrong fold
 * here is silent: the app still renders, it just scores the wrong night.
 */

const DATE = '2026-11-14';

/**
 * One fake device, shared by the module mocks below and by the tests. It holds
 * what the store contains, which platform it is, what it was asked for, and
 * the platform Bene should see. `vi.hoisted` puts it above the imports so the
 * `vi.mock` factories can close over it.
 */
const device = vi.hoisted(() => ({
  platform: 'web' as 'ios' | 'android' | 'web',
  samples: [] as unknown[],
  workouts: [] as unknown[],
  readCalls: [] as { dataType: string; startDate?: string; endDate?: string; limit?: number; ascending?: boolean }[],
  workoutCalls: [] as { startDate?: string; endDate?: string; limit?: number; ascending?: boolean }[],
  fail: false,
  /** What the SDK status probe answers — the same status the plugin gates every call on. */
  available: true,
  /** Why the probe says no, when it says no. */
  reason: undefined as string | undefined,
  /** Whether the real read/write calls throw. */
  authFails: false,
  /** What Bene asked the store for, so tests can pin the ask itself. */
  authCalls: [] as { op: 'request' | 'check'; read?: string[] }[],
  /** The aggregate queries Bene asked for, and the buckets the store answered. */
  aggCalls: [] as { dataType: string; startDate?: string; endDate?: string; bucket?: string; aggregation?: string }[],
  aggSamples: [] as unknown[],
}));

/**
 * The plugin object Bene imports is a Capacitor proxy created at import time
 * for the browser, and that proxy does not tolerate `vi.spyOn` on its methods.
 * So the base URL is a stand-in here and each readDays test loads its own copy
 * of health.ts with `vi.resetModules`, after pointing the fake store at its
 * data — the way the app is wired on a device.
 */
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => device.platform } };
});

vi.mock('@capgo/capacitor-health', () => ({
  Health: {
    isAvailable: async () => ({ available: device.available, reason: device.reason }),
    requestAuthorization: async (opts: { read?: string[] }) => {
      device.authCalls.push({ op: 'request', read: opts.read });
      // The pinned Android plugin checks the SDK status before it builds a
      // client, so on a phone whose status says unavailable the ask is
      // refused with that same reason — the probe is the gate.
      if (device.platform === 'android' && !device.available) {
        throw new Error(device.reason ?? 'Health Connect is unavailable on this device.');
      }
      if (device.authFails) throw new Error('Health Connect is unavailable on this device.');
      return { readAuthorized: opts.read ?? [], readDenied: [] };
    },
    checkAuthorization: async (opts: { read?: string[] }) => {
      device.authCalls.push({ op: 'check', read: opts.read });
      if (device.platform === 'android' && !device.available) {
        throw new Error(device.reason ?? 'Health Connect is unavailable on this device.');
      }
      if (device.authFails) throw new Error('Health Connect is unavailable on this device.');
      return { readAuthorized: opts.read ?? [], readDenied: [] };
    },
    openHealthConnectSettings: async () => undefined,
    readSamples: async (opts: { dataType: string; startDate?: string; endDate?: string; limit?: number }) => {
      if (device.fail) throw new Error('permission revoked');
      device.readCalls.push({ ...opts });
      // Honour the window the caller asked for, the way a real health store
      // does. Without this every per-day read would return the whole range and
      // the day-splitting behaviour would be untestable.
      const from = opts.startDate ? Date.parse(opts.startDate) : -Infinity;
      const to = opts.endDate ? Date.parse(opts.endDate) : Infinity;
      const inWindow = (device.samples as HealthSample[]).filter((s) => {
        if (s.dataType !== opts.dataType) return false;
        // A record counts if any part of it falls in the window: a night of
        // sleep starts the evening before it is filed under.
        const starts = Date.parse(s.startDate);
        const ends = Date.parse(s.endDate ?? s.startDate);
        return ends >= from && starts <= to;
      });
      const limit = opts.limit ?? inWindow.length;
      return { samples: inWindow.slice(0, limit) };
    },
    queryWorkouts: async (opts: { startDate?: string; endDate?: string; limit?: number; ascending?: boolean }) => {
      if (device.fail) throw new Error('permission revoked');
      device.workoutCalls.push({ ...opts });
      // Honour the sort order and cap the caller asked for, the way the plugin
      // does: sort by start date, then take(limit) — so an ascending ask
      // really would drop the newest workouts once the cap hits.
      const sorted = [...(device.workouts as HealthWorkout[])].sort((a, b) => at(a.startDate) - at(b.startDate));
      const ordered = opts.ascending === false ? sorted.reverse() : sorted;
      const limit = opts.limit ?? ordered.length;
      return { workouts: ordered.slice(0, limit) };
    },
    queryAggregated: async (opts: { dataType: string; startDate?: string; endDate?: string; bucket?: string; aggregation?: string }) => {
      if (device.fail) throw new Error('permission revoked');
      device.aggCalls.push({ ...opts });
      return { samples: device.aggSamples };
    },
  },
}));

type HealthModule = typeof import('./health');
let readDays: HealthModule['readDays'];

/**
 * A fresh health.ts for one readDays test, so each starts from a clean module
 * with the current fake store behind it.
 */
async function loadHealth(): Promise<void> {
  readDays = (await import('./health')).readDays;
}

/**
 * readDays builds its own window from the wall clock and files samples under
 * *local* dates, so these tests pin "now" to a fixed instant on the runner's
 * own calendar day — never a UTC literal that would land elsewhere in another
 * timezone. Only Date is faked; everything else runs for real.
 */
const RUN_DAY = new Date(2026, 10, 22, 12, 0, 0);

function isoKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDays(n: number): Date {
  return new Date(RUN_DAY.getFullYear(), RUN_DAY.getMonth(), RUN_DAY.getDate() - n, 12, 0, 0);
}

/** Local date key for a day relative to the run day. */
const today = () => isoKey(RUN_DAY);
const yesterday = () => isoKey(shiftDays(1));
const twoAgo = () => isoKey(shiftDays(2));
const threeAgo = () => isoKey(shiftDays(3));
const fourAgo = () => isoKey(shiftDays(4));
const dayBefore = () => isoKey(shiftDays(5));

/**
 * A local wall-clock instant on `date` ('HH:mm' or 'HH:mm:ss').
 * `new Date('2026-11-21T23:00')` — no timezone suffix — is parsed as local
 * time, which is what "23:00 on the 21st" means to the health store.
 */
function day(date: string, hhmm: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, sec = 0] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, sec).toISOString();
}

function at(iso: string): number {
  return new Date(iso).getTime();
}

/** A sleep sample shaped like the plugin's: one block, optional stage segments. */
function sleepSample(start: string, end: string, stages?: SleepStage[], extra: Partial<HealthSample> = {}): HealthSample {
  return {
    dataType: 'sleep',
    value: 0,
    unit: 'minute',
    startDate: start,
    endDate: end,
    sleepState: 'asleep',
    stages,
    hasStageData: stages != null,
    ...extra,
  };
}

function stage(start: string, end: string, state: SleepStage['stage']): SleepStage {
  return { startDate: start, endDate: end, stage: state, durationMinutes: (at(end) - at(start)) / 60000 };
}

function sample(
  dataType: HealthSample['dataType'],
  value: number,
  startDate: string,
  unit: HealthSample['unit'] = 'count',
): HealthSample {
  return { dataType, value, unit, startDate: String(startDate), endDate: String(startDate) };
}

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    workoutType: 'running',
    duration: 0,
    startDate: '2026-11-14T07:00:00.000Z',
    endDate: '2026-11-14T07:00:00.000Z',
    ...overrides,
  };
}

/** Every readDays test starts the same way: a fresh module, a phone, a pinned clock. */
async function onDevice(p: 'ios' | 'android' | 'web' = 'ios'): Promise<void> {
  // The clock is faked before health.ts is imported, so the module and the
  // fixtures built after this call share one Date implementation and agree on
  // what "today" is.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(RUN_DAY);
  device.platform = p;
  await loadHealth();
}

afterEach(() => {
  vi.useRealTimers();
  device.platform = 'web';
  device.samples = [];
  device.workouts = [];
  device.readCalls = [];
  device.workoutCalls = [];
  device.aggCalls = [];
  device.aggSamples = [];
  device.fail = false;
});

describe('toSleepSession: stage folding', () => {
  it('maps every plugin sleep state onto one of Bene’s four stages', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T01:00:00.000Z', '2026-11-14T02:10:00.000Z', [
          stage('2026-11-14T01:00:00.000Z', '2026-11-14T01:10:00.000Z', 'light'),
          stage('2026-11-14T01:10:00.000Z', '2026-11-14T01:30:00.000Z', 'deep'),
          stage('2026-11-14T01:30:00.000Z', '2026-11-14T02:00:00.000Z', 'rem'),
          stage('2026-11-14T02:00:00.000Z', '2026-11-14T02:10:00.000Z', 'awake'),
        ]),
      ],
      DATE,
    )!;

    expect(session.stages.map((b) => b.stage)).toEqual(['core', 'deep', 'rem', 'awake']);
  });

  it('folds inBed and asleep into core, because they carry no stage information', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T01:00:00.000Z', '2026-11-14T02:00:00.000Z', [
          stage('2026-11-14T01:00:00.000Z', '2026-11-14T01:30:00.000Z', 'inBed'),
          stage('2026-11-14T01:30:00.000Z', '2026-11-14T02:00:00.000Z', 'asleep'),
        ]),
      ],
      DATE,
    )!;

    expect(session.stages.map((b) => b.stage)).toEqual(['core', 'core']);
    for (const block of session.stages) {
      expect(['awake', 'rem', 'core', 'deep']).toContain(block.stage);
    }
  });

  it('expresses block bounds as whole minutes from the session start', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T23:12:00.000Z', '2026-11-15T07:00:00.000Z', [
          stage('2026-11-14T23:12:00.000Z', '2026-11-14T23:42:00.000Z', 'light'),
          stage('2026-11-14T23:42:00.000Z', '2026-11-15T00:02:00.000Z', 'deep'),
          stage('2026-11-15T06:50:00.000Z', '2026-11-15T07:00:00.000Z', 'awake'),
        ]),
      ],
      DATE,
    )!;

    // 23:12 is minute 0; 23:42 → 30; 00:02 → 50; 06:50 → 458; 07:00 → 468.
    expect(session.stages).toEqual([
      { stage: 'core', startMin: 0, endMin: 30 },
      { stage: 'deep', startMin: 30, endMin: 50 },
      { stage: 'awake', startMin: 458, endMin: 468 },
    ]);
  });

  it('sorts blocks by start regardless of the order the store returned them', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T23:00:00.000Z', '2026-11-15T07:00:00.000Z', [
          stage('2026-11-15T01:00:00.000Z', '2026-11-15T02:00:00.000Z', 'rem'),
          stage('2026-11-14T23:00:00.000Z', '2026-11-15T01:00:00.000Z', 'light'),
        ]),
      ],
      DATE,
    )!;

    expect(session.stages.map((b) => b.stage)).toEqual(['core', 'rem']);
    expect(session.stages[0].startMin).toBe(0);
    const starts = session.stages.map((b) => b.startMin);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('carries the session metadata Bene expects', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T23:00:00.000Z', '2026-11-15T07:00:00.000Z', undefined, {
          platformId: 'hk-uuid-1',
          sourceName: 'Apple Watch',
        }),
      ],
      DATE,
    )!;

    expect(session.date).toBe(DATE);
    expect(session.id).toBe('hk-uuid-1');
    expect(session.source).toBe('Apple Watch');
    expect(session.imported).toBe(true);
    expect(session.start).toBe(new Date('2026-11-14T23:00:00.000Z').toISOString());
    expect(session.end).toBe(new Date('2026-11-15T07:00:00.000Z').toISOString());
    // Overnight metrics are filled in by readDays, never guessed here.
    expect(session.hrvMs).toBeNull();
    expect(session.rhrBpm).toBeNull();
    expect(session.timeToFallAsleepMin).toBeNull();
    expect(session.alarm).toBeNull();
  });

  it('falls back to a deterministic id and the platform label when the plugin gives neither', () => {
    device.platform = 'ios';
    expect(platform()).toBe('apple-health');
    const session = toSleepSession([sleepSample('2026-11-14T23:00:00.000Z', '2026-11-15T07:00:00.000Z')], DATE)!;

    expect(session.id).toBe(`hc-${DATE}`);
    expect(session.source).toBe('Apple Health');
  });
});

describe('toSleepSession: block-only nights', () => {
  it('produces one core block spanning the whole session when there is no stage data', () => {
    const session = toSleepSession(
      [sleepSample('2026-11-13T23:20:00.000Z', '2026-11-14T06:35:00.000Z', undefined, { hasStageData: false })],
      DATE,
    )!;

    expect(session.stages).toHaveLength(1);
    expect(session.stages[0]).toEqual({ stage: 'core', startMin: 0, endMin: 435 });
    // Sleep duration therefore still scores rather than reading as a zero night.
    const asleep = session.stages.reduce((n, b) => n + (b.stage === 'awake' ? 0 : b.endMin - b.startMin), 0);
    expect(asleep).toBe(435);
  });

  it('produces one core block when the stages array is present but empty', () => {
    const session = toSleepSession([sleepSample('2026-11-13T23:20:00.000Z', '2026-11-14T06:35:00.000Z', [])], DATE)!;

    expect(session.stages).toEqual([{ stage: 'core', startMin: 0, endMin: 435 }]);
  });

  it('drops zero-length and inverted stage segments instead of emitting them', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T01:00:00.000Z', '2026-11-14T03:00:00.000Z', [
          stage('2026-11-14T01:00:00.000Z', '2026-11-14T01:00:00.000Z', 'awake'),
          stage('2026-11-14T02:00:00.000Z', '2026-11-14T01:30:00.000Z', 'rem'),
          stage('2026-11-14T01:00:00.000Z', '2026-11-14T01:30:00.000Z', 'deep'),
        ]),
      ],
      DATE,
    )!;

    expect(session.stages).toEqual([{ stage: 'deep', startMin: 0, endMin: 30 }]);
  });

  it('falls back to one core block when every stage segment is unusable', () => {
    const session = toSleepSession(
      [
        sleepSample('2026-11-14T01:00:00.000Z', '2026-11-14T03:00:00.000Z', [
          stage('2026-11-14T01:00:00.000Z', '2026-11-14T01:00:00.000Z', 'light'),
        ]),
      ],
      DATE,
    )!;

    expect(session.stages).toEqual([{ stage: 'core', startMin: 0, endMin: 120 }]);
  });
});

describe('toSleepSession: choosing and rejecting nights', () => {
  it('returns null rather than an empty session when there is nothing to fold', () => {
    expect(toSleepSession([], DATE)).toBeNull();
  });

  it('returns null when the samples carry no sleep data at all', () => {
    const samples = [
      sample('steps', 1000, '2026-11-14T09:00:00.000Z'),
      sample('heartRate', 58, '2026-11-14T03:00:00.000Z', 'bpm'),
    ];
    expect(toSleepSession(samples, DATE)).toBeNull();
  });

  it('returns null when the night has no positive duration', () => {
    const zero = sleepSample('2026-11-14T07:00:00.000Z', '2026-11-14T07:00:00.000Z');
    expect(toSleepSession([zero], DATE)).toBeNull();
  });

  it('picks the longest session when one morning has several', () => {
    const samples = [
      // A nap that ends on the same morning but is far shorter.
      sleepSample('2026-11-14T06:00:00.000Z', '2026-11-14T06:20:00.000Z', undefined, { platformId: 'nap' }),
      // The real night.
      sleepSample(
        '2026-11-13T23:00:00.000Z',
        '2026-11-14T07:00:00.000Z',
        [
          stage('2026-11-13T23:00:00.000Z', '2026-11-14T02:00:00.000Z', 'deep'),
          stage('2026-11-14T02:00:00.000Z', '2026-11-14T07:00:00.000Z', 'light'),
        ],
        { platformId: 'night' },
      ),
      sleepSample('2026-11-14T04:00:00.000Z', '2026-11-14T05:00:00.000Z', undefined, { platformId: 'doze' }),
    ];

    const session = toSleepSession(samples, DATE)!;

    expect(session.id).toBe('night');
    expect(session.stages.reduce((n, b) => n + (b.endMin - b.startMin), 0)).toBe(480);
  });

  it('picks the longest session no matter what order the plugin returns them in', () => {
    const long = sleepSample('2026-11-13T22:30:00.000Z', '2026-11-14T06:30:00.000Z', undefined, { platformId: 'long' });
    const short = sleepSample('2026-11-14T05:00:00.000Z', '2026-11-14T06:00:00.000Z', undefined, { platformId: 'short' });

    expect(toSleepSession([long, short], DATE)!.id).toBe('long');
    expect(toSleepSession([short, long], DATE)!.id).toBe('long');
  });
});

describe('platform detection', () => {
  it('names the health store that each platform actually is', () => {
    device.platform = 'ios';
    expect(platform()).toBe('apple-health');
    expect(platformLabel()).toBe('Apple Health');

    device.platform = 'android';
    expect(platform()).toBe('health-connect');
    expect(platformLabel()).toBe('Health Connect');

    device.platform = 'web';
    expect(platform()).toBe('unavailable');
    expect(platformLabel()).toBe('Not available on this device');
  });

  it('labels a platform value it does not recognise as unavailable', () => {
    expect(platformLabel('unavailable')).toBe('Not available on this device');
  });
});

describe('readDays on the web', () => {
  it('resolves to an empty list instead of throwing', async () => {
    await onDevice();
    device.platform = 'web';
    const days = await readDays(14);
    expect(days).toEqual([]);
    // A store that cannot exist is not even queried.
    expect(device.readCalls).toHaveLength(0);
    expect(device.workoutCalls).toHaveLength(0);
  });
});

describe('readDays: queries', () => {
  it('asks for the requested window and every type Bene uses', async () => {
    await onDevice();
    await readDays(7);

    // Heart rate is read one day at a time so no single query can hit the
    // platform's sample cap and silently truncate the tail of the range.
    const types = new Set(device.readCalls.map((c) => c.dataType));
    expect([...types].sort()).toEqual(
      [
        'basalCalories',
        'bodyTemperature',
        'calories',
        'exerciseTime',
        'heartRate',
        'heartRateVariability',
        'oxygenSaturation',
        'respiratoryRate',
        'restingHeartRate',
        'sleep',
        'steps',
      ].sort(),
    );
    const hrCalls = device.readCalls.filter((c) => c.dataType === 'heartRate');
    expect(hrCalls).toHaveLength(8);
    for (const call of hrCalls) {
      // Calendar bounds, not elapsed time: a local day containing a DST
      // fall-back is 25 hours long, so a fixed 24-hour ceiling would fail a
      // correct read.
      const from = new Date(call.startDate!);
      const to = new Date(call.endDate!);
      expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
      expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59]);
      expect(isoKey(from)).toBe(isoKey(to));
      expect(at(call.endDate!)).toBeGreaterThan(at(call.startDate!));
    }
    expect(device.workoutCalls).toHaveLength(1);

    const first = device.readCalls.find((c) => c.dataType === 'sleep')!;
    const span = at(first.endDate!) - at(first.startDate!);
    // The window runs from local midnight `days` back to end-of-today: at
    // least `days` long, so last night's tail is never missed, and less than
    // `days + 1`.
    expect(span).toBeGreaterThanOrEqual(7 * 86400000);
    expect(span).toBeLessThan(8 * 86400000);
    const end = new Date(first.endDate!);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
    // The start is a local midnight, not a raw millisecond offset from
    // end-of-today — a raw offset lands an hour past the oldest local
    // midnight after a DST fall-back and drops that local day.
    const began = new Date(first.startDate!);
    expect([began.getHours(), began.getMinutes(), began.getSeconds()]).toEqual([0, 0, 0]);
    expect(isoKey(began)).toBe(isoKey(shiftDays(7)));
  });

  it('asks Health Connect nothing it cannot answer', async () => {
    await onDevice('android');
    await readDays(7);

    const types = new Set(device.readCalls.map((c) => c.dataType));
    // 'exerciseTime' is a HealthKit type with no Health Connect record: asking
    // the store for it rejects the whole permission list and made every Android
    // phone read as "no health store". 'basalCalories' is a BMR *rate* there,
    // so the total comes from 'totalCalories' instead. Nothing else may go.
    expect(types.has('exerciseTime')).toBe(false);
    expect(types.has('basalCalories')).toBe(false);
    for (const type of ['sleep', 'heartRate', 'heartRateVariability', 'restingHeartRate', 'respiratoryRate', 'oxygenSaturation', 'bodyTemperature', 'calories', 'totalCalories']) {
      expect(types.has(type)).toBe(true);
    }
    // Steps are not read sample by sample at all: the daily total comes from
    // the store's deduplicated aggregate, which cannot be emulated here.
    expect(types.has('steps')).toBe(false);

    const stepsAgg = device.aggCalls.find((c) => c.dataType === 'steps');
    expect(stepsAgg).toBeDefined();
    expect(stepsAgg!.bucket).toBe('day');
    expect(stepsAgg!.aggregation).toBe('sum');
    // The bucket window must start on a local midnight, or the plugin's
    // 24-hour day buckets drift off Bene's local dates and each day's steps
    // land under the neighbouring date.
    const from = new Date(stepsAgg!.startDate!);
    expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
    // The window covers the whole range: midnight of `days` ago to the end of
    // today, so no covered date — the oldest one included — is left unread.
    const span = at(stepsAgg!.endDate!) - at(stepsAgg!.startDate!);
    expect(span).toBeGreaterThanOrEqual(8 * 86400000 - 1000);
    expect(span).toBeLessThan(8 * 86400000);
    const to = new Date(stepsAgg!.endDate!);
    expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59]);
  });
});

/**
 * Health Connect applies source priority when it aggregates: a phone and a
 * watch recording the same walk produce one deduplicated daily total. Raw
 * StepsRecord reads carry no such priority, so summing them double-counts
 * every overlapped step — which is why Bene reads the aggregate instead.
 */
describe('readDays on Health Connect: overlapping step sources', () => {
  it('takes the store’s deduplicated daily total, not the sum of raw records', async () => {
    await onDevice('android');
    // Two sources each recorded the same 1,000-step walk; the aggregate is
    // what the store says the day's total actually is.
    device.samples = [
      sample('steps', 1000, day(today(), '09:00')),
      sample('steps', 1000, day(today(), '09:00')),
    ];
    device.aggSamples = [{ value: 1000, values: { sum: 1000 }, unit: 'count', startDate: day(today(), '00:00'), endDate: day(today(), '00:00') }];

    const record = (await readDays(2)).find((d) => d.date === today())!;

    expect(record.metrics.steps).toBe(1000);
  });

  it('files each aggregated bucket under the local date it belongs to', async () => {
    await onDevice('android');
    device.aggSamples = [
      { value: 700, values: { sum: 700 }, unit: 'count', startDate: day(yesterday(), '00:00'), endDate: day(yesterday(), '00:00') },
      { value: 300, values: { sum: 300 }, unit: 'count', startDate: day(today(), '00:00'), endDate: day(today(), '00:00') },
    ];

    const byDate = Object.fromEntries((await readDays(2)).map((d) => [d.date, d.metrics.steps]));

    expect(byDate[yesterday()]).toBe(700);
    expect(byDate[today()]).toBe(300);
  });
});

/**
 * 'calories' is active burn on Health Connect — the plugin maps it to
 * ActiveCaloriesBurnedRecord, the same record Bene's active-calorie permission
 * names — and total burn is its own record. Storing the active samples as the
 * day's total counted every active kilocalorie as resting burn.
 */
describe('readDays on Health Connect: energy burn', () => {
  it('files active-calorie samples under active burn and total burn separately', async () => {
    await onDevice('android');
    device.aggSamples = [{ value: 4000, values: { sum: 4000 }, unit: 'count', startDate: day(today(), '00:00'), endDate: day(today(), '00:00') }];
    device.samples = [
      sample('calories', 300, day(today(), '09:00'), 'kilocalorie'),
      sample('calories', 200, day(today(), '13:00'), 'kilocalorie'),
      sample('totalCalories', 1400, day(today(), '08:00'), 'kilocalorie'),
      sample('totalCalories', 800, day(today(), '12:00'), 'kilocalorie'),
    ];

    const record = (await readDays(2)).find((d) => d.date === today())!;

    expect(record.metrics.activeCalories).toBe(500);
    expect(record.metrics.totalCalories).toBe(2200);
  });

  it('keeps total burn unknown when the device records no total-calorie data', async () => {
    await onDevice('android');
    device.aggSamples = [{ value: 4000, values: { sum: 4000 }, unit: 'count', startDate: day(today(), '00:00'), endDate: day(today(), '00:00') }];
    device.samples = [sample('calories', 500, day(today(), '09:00'), 'kilocalorie')];

    const record = (await readDays(2)).find((d) => d.date === today())!;

    expect(record.metrics.activeCalories).toBe(500);
    expect(record.metrics.totalCalories).toBeNull();
  });
});

describe('readDays: unit conversion on workouts', () => {
  it('turns the plugin’s seconds into minutes and metres into kilometres', async () => {
    await onDevice();
    device.workouts = [
      workout({
        workoutType: 'running',
        duration: 2730, // 45.5 min → 46
        totalDistance: 10454, // 10.454 km → 10.5
        totalEnergyBurned: 612.4,
        startDate: day(today(), '07:00'),
        endDate: day(today(), '07:45:30'),
        platformId: 'w-1',
        sourceName: 'Apple Watch',
      }),
    ];

    const w = (await readDays(1)).flatMap((d) => d.workouts)[0];

    expect(w.durationMin).toBe(46);
    expect(w.distanceKm).toBe(10.5);
    expect(w.calories).toBe(612);
    expect(w.kind).toBe('run');
    expect(w.imported).toBe(true);
    expect(w.id).toBe('w-1');
    expect(w.source).toBe('Apple Watch');
    expect(w.date).toBe(today());
    expect(w.strain).toBe(0);
    expect(w.zoneMinutes).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('does not divide a sub-minute workout into a fractional duration', async () => {
    await onDevice();
    device.workouts = [workout({ duration: 90, totalDistance: 250, startDate: day(today(), '07:00'), endDate: day(today(), '07:01:30') })];

    const w = (await readDays(1)).flatMap((d) => d.workouts)[0];

    expect(Number.isInteger(w.durationMin)).toBe(true);
    expect(w.durationMin).toBe(2);
    expect(w.distanceKm).toBe(0.3); // 250 m → 0.25 → 0.3
  });

  it('crosses a kilometre boundary without losing the rounding', async () => {
    await onDevice();
    device.workouts = [
      workout({ duration: 600, totalDistance: 999, startDate: day(today(), '07:00'), endDate: day(today(), '07:10') }),
      workout({ duration: 600, totalDistance: 1000, startDate: day(today(), '08:00'), endDate: day(today(), '08:10'), platformId: 'b' }),
    ];

    const km = (await readDays(1)).flatMap((d) => d.workouts).map((w) => w.distanceKm);

    expect(km).toEqual([1, 1]);
  });

  it('leaves distance and calories null when the store did not record them', async () => {
    await onDevice();
    device.workouts = [workout({ duration: 600, startDate: day(today(), '07:00'), endDate: day(today(), '07:10') })];

    const w = (await readDays(1)).flatMap((d) => d.workouts)[0];

    expect(w.durationMin).toBe(10);
    expect(w.distanceKm).toBeNull();
    expect(w.calories).toBeNull();
  });

  it('falls back to the timestamps when the store reports a zero duration', async () => {
    await onDevice();
    device.workouts = [workout({ duration: 0, startDate: day(today(), '07:00'), endDate: day(today(), '07:32') })];

    const w = (await readDays(1)).flatMap((d) => d.workouts)[0];

    expect(w.durationMin).toBe(32);
  });

  it('maps the workout types Bene knows and keeps unknown ones inside WorkoutKind', async () => {
    await onDevice();
    const cases: [string, string][] = [
      // The names Bene's map was first written against.
      ['running', 'run'],
      ['walking', 'walk'],
      ['hiking', 'hike'],
      ['cycling', 'cycle'],
      ['swimming', 'swim'],
      ['functionalStrengthTraining', 'strength'],
      ['traditionalStrengthTraining', 'strength'],
      ['highIntensityIntervalTraining', 'hiit'],
      ['yoga', 'yoga'],
      // The names the plugin actually *emits* — Android's
      // WorkoutType.toWorkoutTypeString and iOS's fromHKWorkoutActivityType —
      // which used to fall through to 'walk' and inflate cardio-goal minutes.
      ['strengthTraining', 'strength'],
      ['weightlifting', 'strength'],
      ['crossTraining', 'hiit'],
      ['swimmingPool', 'swim'],
      ['swimmingOpenWater', 'swim'],
      ['waterFitness', 'swim'],
      ['bikingStationary', 'cycle'],
      ['elliptical', 'cycle'],
      ['rowing', 'cycle'],
      ['rowingMachine', 'cycle'],
      ['runningTreadmill', 'run'],
      // WorkoutKind is a closed set with no 'other'. An unrecognised type must
      // still land on a real member, or the bundle fails to type-check.
      ['rowingUnknownSport', 'walk'],
      ['unknownFutureType', 'walk'],
    ];
    device.workouts = cases.map(([type], i) =>
      workout({
        // A type the plugin's union does not name yet must still map cleanly.
        workoutType: type as HealthWorkout['workoutType'],
        duration: 600,
        startDate: day(today(), `0${i % 10}:${String(i).padStart(2, '0')}`),
        endDate: day(today(), `0${i % 10}:${String(i + 10).padStart(2, '0')}`),
        platformId: type,
      }),
    );

    const byId = Object.fromEntries(
      (await readDays(1)).flatMap((d) => d.workouts).map((w) => [w.id, w.kind]),
    );

    for (const [input, expected] of cases) {
      expect(byId[input], input).toBe(expected);
    }
  });

  it('files each workout under the local day it started', async () => {
    await onDevice();
    device.workouts = [
      workout({ duration: 1800, startDate: day(yesterday(), '23:30'), endDate: day(today(), '00:00'), platformId: 'late' }),
      workout({ duration: 1800, startDate: day(today(), '00:30'), endDate: day(today(), '01:00'), platformId: 'early' }),
    ];

    const days = await readDays(2);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.workouts.map((w) => w.id)]));

    expect(byDate[yesterday()]).toEqual(['late']);
    expect(byDate[today()]).toEqual(['early']);
  });
});

describe('readDays: daily aggregation', () => {
  it('sums steps and calories per local day and attributes sleep to the morning it ends', async () => {
    await onDevice();
    device.samples = [
      sample('steps', 1200, day(yesterday(), '09:00')),
      sample('steps', 800, day(yesterday(), '18:00')),
      sample('steps', 400, day(today(), '09:00')),
      sample('calories', 100.4, day(yesterday(), '12:00'), 'kilocalorie'),
      sample('calories', 50.4, day(yesterday(), '13:00'), 'kilocalorie'),
      // The night runs across midnight and ends on yesterday's morning.
      sleepSample(day(dayBefore(), '23:00'), day(yesterday(), '07:00')),
    ];

    const byDate = Object.fromEntries((await readDays(3)).map((d) => [d.date, d]));

    expect(byDate[yesterday()].metrics.steps).toBe(2000);
    // 'calories' is active energy, and with no basal samples total stays at
    // active rather than dropping to zero.
    expect(byDate[yesterday()].metrics.activeCalories).toBe(151);
    expect(byDate[yesterday()].metrics.totalCalories).toBe(151);
    expect(byDate[today()].metrics.steps).toBe(400);
    // Sleep is filed under the morning it ends on, not the evening it began.
    expect(byDate[yesterday()].sleep).not.toBeNull();
    expect(byDate[dayBefore()]).toBeUndefined();
    expect(byDate[today()].sleep).toBeNull();
  });

  it('keeps step samples from either side of local midnight on their own day', async () => {
    await onDevice();
    device.samples = [
      sample('steps', 700, day(yesterday(), '23:59:40')),
      sample('steps', 300, day(today(), '00:00:20')),
    ];

    const byDate = Object.fromEntries((await readDays(2)).map((d) => [d.date, d]));

    expect(byDate[yesterday()].metrics.steps).toBe(700);
    expect(byDate[today()].metrics.steps).toBe(300);
  });

  it('measures HRV and resting HR inside the sleep window only', async () => {
    await onDevice();
    const hrv = (value: number, startDate: string) => sample('heartRateVariability', value, startDate, 'millisecond');
    device.samples = [
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      // Overnight: inside the window.
      hrv(60, day(today(), '01:00')),
      hrv(50, day(today(), '04:00')),
      // Afternoon: outside the window, must not bleed into the overnight mean.
      hrv(100, day(today(), '15:00')),
      sample('restingHeartRate', 50, day(today(), '02:00'), 'bpm'),
      sample('restingHeartRate', 54, day(today(), '05:00'), 'bpm'),
    ];

    const sleep = (await readDays(2)).find((d) => d.date === today())!.sleep!;

    expect(sleep.hrvMs).toBe(55);
    expect(sleep.rhrBpm).toBe(52);
  });

  it('leaves overnight metrics null when the store recorded nothing in the window', async () => {
    await onDevice();
    device.samples = [
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      sample('heartRateVariability', 90, day(today(), '15:00'), 'millisecond'),
    ];

    const sleep = (await readDays(2)).find((d) => d.date === today())!.sleep!;

    expect(sleep.hrvMs).toBeNull();
    expect(sleep.rhrBpm).toBeNull();
    expect(sleep.respiratoryRate).toBeNull();
    expect(sleep.spo2).toBeNull();
  });

  it('reports the lowest overnight heart rate, not the day’s', async () => {
    await onDevice();
    device.samples = [
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      sample('heartRate', 58.4, day(today(), '01:00'), 'bpm'),
      sample('heartRate', 47.6, day(today(), '04:00'), 'bpm'),
      sample('heartRate', 131, day(today(), '18:00'), 'bpm'),
    ];

    const sleep = (await readDays(2)).find((d) => d.date === today())!.sleep!;

    expect(sleep.minHrBpm).toBe(48);
  });

  it('does not mistake an absolute body temperature for a deviation', async () => {
    await onDevice();
    device.samples = [
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      sample('bodyTemperature', 36.5, day(today(), '03:00'), 'celsius'),
    ];

    const sleep = (await readDays(2)).find((d) => d.date === today())!.sleep!;

    expect(sleep.wristTempC).toBeNull();
  });

  it('keeps a reading that is already a deviation-sized value', async () => {
    await onDevice();
    device.samples = [
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      sample('bodyTemperature', 0.4, day(today(), '03:00'), 'celsius'),
    ];

    const sleep = (await readDays(2)).find((d) => d.date === today())!.sleep!;

    expect(sleep.wristTempC).toBe(0.4);
  });
});

describe('readDays: never invents a day', () => {
  it('emits only days that carry at least one piece of evidence', async () => {
    await onDevice();
    device.samples = [
      sample('steps', 3000, day(threeAgo(), '12:00')),
      sample('heartRate', 64, day(twoAgo(), '12:00'), 'bpm'),
      // Ends this morning, so today has sleep and nothing else.
      sleepSample(day(yesterday(), '23:00'), day(today(), '07:00')),
      // Types Bene reads but does not yet fold into a day must not create one.
      sample('oxygenSaturation', 97, day(fourAgo(), '12:00'), 'percent'),
      sample('respiratoryRate', 14, day(fourAgo(), '12:00'), 'count'),
      sample('calories', 400, day(fourAgo(), '12:00'), 'kilocalorie'),
    ];
    device.workouts = [workout({ startDate: day(twoAgo(), '07:00'), endDate: day(twoAgo(), '07:30'), duration: 1800 })];

    const days = await readDays(5);

    expect(days.length).toBeGreaterThan(0);
    for (const record of days) {
      expect(hasEvidence(record), `day ${record.date} was emitted with no evidence`).toBe(true);
    }
    // Only days with evidence: the oxygen/respiratory/calorie-only day is gone.
    expect(days.map((d) => d.date)).toEqual([threeAgo(), twoAgo(), today()]);
    // The workout on its own keeps that day alive; a steps-only day too.
    expect(days[0].metrics.steps).toBe(3000);
    expect(days[1].workouts).toHaveLength(1);
    expect(days[1].metrics.steps).toBe(0);
    // Today is evidenced only by the night that ended this morning.
    expect(days[2].sleep).not.toBeNull();
    expect(days[2].metrics.steps).toBe(0);
  });

  it('returns nothing when the store is simply empty', async () => {
    await onDevice();
    expect(await readDays(30)).toEqual([]);
  });

  it('returns days in ascending date order', async () => {
    await onDevice();
    device.samples = [
      sample('steps', 100, day(today(), '09:00')),
      sample('steps', 100, day(twoAgo(), '09:00')),
      sample('steps', 100, day(yesterday(), '09:00')),
    ];

    const dates = (await readDays(3)).map((d) => d.date);

    expect(dates).toEqual([...dates].sort());
  });

  it('survives a store that throws on every read', async () => {
    await onDevice();
    device.fail = true;

    await expect(readDays(7)).resolves.toEqual([]);
  });
});

/** The invariant readDays promises its callers: a day exists only because it has data. */
describe('readDays: heart rate is never silently truncated', () => {
  it('reads heart rate in per-day windows rather than one capped range query', async () => {
    await onDevice();
    device.samples = [sample('heartRate', 60, day(twoAgo(), '12:00'), 'bpm')];

    await readDays(7);

    const hrCalls = device.readCalls.filter((c) => c.dataType === 'heartRate');
    expect(hrCalls).toHaveLength(8);
    for (const call of hrCalls) {
      // Calendar bounds, not elapsed time: a local day containing a DST
      // fall-back is 25 hours long, so a fixed 24-hour ceiling would fail a
      // correct read. Each window starts at a local midnight and ends on the
      // same local calendar day.
      const from = new Date(call.startDate!);
      const to = new Date(call.endDate!);
      expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
      expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59]);
      expect(isoKey(from)).toBe(isoKey(to));
      expect(at(call.endDate!)).toBeGreaterThan(at(call.startDate!));
    }
    // The windows must tile the range without gaps or overlap.
    for (let i = 1; i < hrCalls.length; i += 1) {
      expect(at(hrCalls[i].startDate!)).toBe(at(hrCalls[i - 1].endDate!) + 1);
    }
  });

  it('leaves worn time unknown for a day whose read hit the sample cap', async () => {
    await onDevice();
    // A day that returns exactly at the 4000-sample cap cannot be trusted to be
    // complete, so its worn time must not be presented as a real number.
    const fullDay: HealthSample[] = [];
    // 4,000 samples spread across the day, one every 21.6 seconds, so the day
    // genuinely reaches the per-day cap.
    for (let i = 0; i < 4000; i += 1) {
      const secs = Math.floor((i * 86400) / 4000);
      const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
      const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      fullDay.push(sample('heartRate', 60 + (i % 20), day(yesterday(), `${hh}:${mm}:${ss}`), 'bpm'));
    }
    device.samples = fullDay;

    const days = await readDays(7);
    const capped = days.find((d) => d.date === yesterday());
    // The capped day must actually have been read for the assertion to mean
    // anything; fail loudly instead of reporting "undefined".
    expect(days.map((d) => d.date)).toContain(yesterday());
    expect(capped).toBeDefined();
    expect(capped!.metrics.wearMinutes).toBe(0);
    // The samples themselves are still kept; only the inference is withheld.
    expect(capped!.metrics.hrSamples.length).toBeGreaterThan(0);
  });
});

function hasEvidence(record: DayRecord): boolean {
  const date: ISODate = record.date;
  expect(record.metrics.date).toBe(date);
  // Hand-logged surfaces are never filled in by an import.
  expect(record.meals).toEqual([]);
  expect(record.journal).toEqual([]);
  return (
    record.sleep !== null ||
    record.metrics.steps > 0 ||
    record.workouts.length > 0 ||
    record.metrics.hrSamples.length > 0
  );
}


/**
 * The pinned Android plugin gates every store call — authorization included —
 * on the SDK status that isAvailable() reports, refusing before a client is
 * ever built. So the probe is not a loose hint: when the status says the store
 * cannot be reached, the ask itself is refused with that same reason, and the
 * honest thing Bene can do is pass the store's own explanation on.
 */
describe('availability: the probe and the gate are the same status', () => {
  afterEach(() => {
    device.platform = 'web';
    device.available = true;
    device.reason = undefined;
    device.authFails = false;
  });

  it('refuses the prompt when the status probe says the store cannot be reached', async () => {
    device.platform = 'android';
    device.available = false;
    device.reason = 'Health Connect is unavailable on this device.';

    const status = await requestAccess();

    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/unavailable on this device/i);
  });

  it('reports the store’s own reason when the status gate refuses the check', async () => {
    device.platform = 'android';
    device.available = false;
    device.reason = 'Health Connect needs an update.';

    const status = await checkAccess();

    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/update/i);
  });

  it('reports unavailable only when the store itself refuses', async () => {
    device.platform = 'android';
    device.authFails = true;
    device.available = false;
    device.reason = 'Health Connect needs an update.';

    const status = await checkAccess();

    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/update/i);
  });

  it('still reports unavailable in a browser', async () => {
    device.platform = 'web';
    const status = await checkAccess();
    expect(status.available).toBe(false);
  });
});

/**
 * The ask itself. 'exerciseTime' is a HealthKit type the plugin has no Health
 * Connect record for, so putting it in the Android permission list rejects the
 * whole call with "Unsupported data type" — which Bene then reported as "no
 * health store" on a phone whose store was fine. Health Connect only shows the
 * permissions that are asked, so whatever reaches the store must be exactly
 * what the platform can grant — and it must also name the scopes the data
 * silently depends on ('distance' for imported workouts, 'totalCalories' for
 * total burn).
 */
describe('access: the ask matches what the store can answer', () => {
  afterEach(() => {
    device.platform = 'web';
    device.authCalls = [];
  });

  it('checks and prompts with one call each on Android, and the right one per surface', async () => {
    device.platform = 'android';
    device.authCalls = [];

    await checkAccess();
    await requestAccess();

    // Requiring "one recorded call" would also pass a bridge where
    // checkAccess skipped the native check or requestAccess skipped the
    // prompt, so pin both the op and the exact list, per call.
    expect(device.authCalls.map((c) => c.op)).toEqual(['check', 'request']);
    // The HealthKit-only 'exerciseTime' is out, the BMR *rate* 'basalCalories'
    // is out (a rate cannot be summed into a total), and 'distance' is in —
    // Health Connect only supplies what the ask names.
    const androidAsk = [
      'sleep',
      'heartRateVariability',
      'restingHeartRate',
      'respiratoryRate',
      'oxygenSaturation',
      'bodyTemperature',
      'steps',
      'calories',
      'totalCalories',
      'heartRate',
      'workouts',
      'distance',
    ];
    for (const call of device.authCalls) {
      expect(call.read).toEqual(androidAsk);
    }
  });

  it('checks and prompts with one call each on iOS, asking for basal and not the double-counting total', async () => {
    device.platform = 'ios';
    device.authCalls = [];

    await checkAccess();
    await requestAccess();

    expect(device.authCalls.map((c) => c.op)).toEqual(['check', 'request']);
    for (const call of device.authCalls) {
      expect(call.read).toEqual(READ_TYPES.filter((t) => t !== 'totalCalories'));
      expect(call.read).toContain('exerciseTime');
      expect(call.read).toContain('basalCalories');
    }
  });
});

describe('toSleepSession: the per-segment shape iOS emits', () => {
  it('merges many one-stage samples into the one night they compose', () => {
    const samples = [
      sleepSample('2026-11-13T23:00:00.000Z', '2026-11-14T01:00:00.000Z', [
        stage('2026-11-13T23:00:00.000Z', '2026-11-14T01:00:00.000Z', 'light'),
      ], { platformId: 'seg-1', sourceName: 'Apple Watch' }),
      sleepSample('2026-11-14T01:00:00.000Z', '2026-11-14T03:00:00.000Z', [
        stage('2026-11-14T01:00:00.000Z', '2026-11-14T03:00:00.000Z', 'deep'),
      ], { platformId: 'seg-2' }),
      sleepSample('2026-11-14T03:00:00.000Z', '2026-11-14T06:50:00.000Z', [
        stage('2026-11-14T03:00:00.000Z', '2026-11-14T06:50:00.000Z', 'rem'),
      ], { platformId: 'seg-3' }),
      sleepSample('2026-11-14T06:50:00.000Z', '2026-11-14T07:00:00.000Z', [
        stage('2026-11-14T06:50:00.000Z', '2026-11-14T07:00:00.000Z', 'awake'),
      ], { platformId: 'seg-4' }),
    ];

    const session = toSleepSession(samples, DATE)!;

    // One session whose bounds are the union, not the longest single segment.
    expect(session.start).toBe(new Date('2026-11-13T23:00:00.000Z').toISOString());
    expect(session.end).toBe(new Date('2026-11-14T07:00:00.000Z').toISOString());
    // Identity and provenance come from the first sample in the store's order.
    expect(session.id).toBe('seg-1');
    expect(session.source).toBe('Apple Watch');
    // Every stage survives, sorted by when it happened, in minutes from the
    // merged start.
    expect(session.stages).toEqual([
      { stage: 'core', startMin: 0, endMin: 120 },
      { stage: 'deep', startMin: 120, endMin: 240 },
      { stage: 'rem', startMin: 240, endMin: 470 },
      { stage: 'awake', startMin: 470, endMin: 480 },
    ]);
  });

  it('keeps the longest-sample behaviour when the samples are not all per-segment', () => {
    // A Health Connect morning: a stage-less nap and a stage-bearing night.
    const nap = sleepSample('2026-11-14T06:00:00.000Z', '2026-11-14T06:20:00.000Z', undefined, { platformId: 'nap' });
    const night = sleepSample('2026-11-13T23:00:00.000Z', '2026-11-14T07:00:00.000Z', [
      stage('2026-11-13T23:00:00.000Z', '2026-11-14T03:00:00.000Z', 'deep'),
      stage('2026-11-14T03:00:00.000Z', '2026-11-14T07:00:00.000Z', 'light'),
    ], { platformId: 'night' });

    const session = toSleepSession([nap, night], DATE)!;

    expect(session.id).toBe('night');
    expect(session.start).toBe(new Date('2026-11-13T23:00:00.000Z').toISOString());
  });
});

describe('readDays: the energy split', () => {
  it('reads active and basal energy separately on iOS and adds them', async () => {
    await onDevice('ios');
    device.samples = [
      sample('steps', 100, day(yesterday(), '09:00')),
      sample('calories', 710, day(yesterday(), '12:00'), 'kilocalorie'),
      sample('basalCalories', 1900, day(yesterday(), '00:00'), 'kilocalorie'),
    ];

    const d = (await readDays(2)).find((x) => x.date === yesterday())!;

    expect(d.metrics.activeCalories).toBe(710);
    expect(d.metrics.totalCalories).toBe(2610);
  });

  it('keeps totalCalories at active when the store has no basal samples', async () => {
    await onDevice('ios');
    device.samples = [
      sample('steps', 100, day(yesterday(), '09:00')),
      sample('calories', 710, day(yesterday(), '12:00'), 'kilocalorie'),
    ];

    const d = (await readDays(2)).find((x) => x.date === yesterday())!;

    expect(d.metrics.activeCalories).toBe(710);
    expect(d.metrics.totalCalories).toBe(710);
  });

  it('reads the total directly from Health Connect on Android', async () => {
    await onDevice('android');
    // Android steps arrive as aggregate buckets, and a day needs at least one
    // piece of evidence to be emitted at all.
    device.aggSamples = [{ value: 100, values: { sum: 100 }, unit: 'count', startDate: day(yesterday(), '00:00'), endDate: day(yesterday(), '00:00') }];
    device.samples = [
      sample('calories', 710, day(yesterday(), '12:00'), 'kilocalorie'),
      sample('totalCalories', 2610, day(yesterday(), '12:00'), 'kilocalorie'),
    ];

    const d = (await readDays(2)).find((x) => x.date === yesterday())!;

    expect(d.metrics.activeCalories).toBe(710);
    expect(d.metrics.totalCalories).toBe(2610);
  });
});

describe('readDays: a capped page is re-read, not summed as complete', () => {
  it('falls back to per-day reads when a single query hits its cap', async () => {
    await onDevice();
    // A heavy month of steps: the range query returns exactly its 2000-sample
    // cap, which is the only signal Bene gets that days were dropped.
    const heavy: HealthSample[] = [];
    for (let d = 0; d < 30; d += 1) {
      for (let k = 0; k < 67; k += 1) {
        const minute = k * 20;
        heavy.push(sample('steps', 100, day(isoKey(shiftDays(d)), `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`)));
      }
    }
    device.samples = heavy;

    const days = await readDays(30);
    const byDate = Object.fromEntries(days.map((x) => [x.date, x]));

    // The fallback re-reads each local day, so no single query is at the cap.
    const stepCalls = device.readCalls.filter((c) => c.dataType === 'steps');
    expect(stepCalls.length).toBeGreaterThan(1);
    for (const call of stepCalls.slice(1)) {
      // Calendar bounds, not elapsed time — see the note in the window test.
      const from = new Date(call.startDate!);
      const to = new Date(call.endDate!);
      expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
      expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59]);
      expect(isoKey(from)).toBe(isoKey(to));
    }
    // And the day sums are complete: 67 samples × 100 each.
    expect(byDate[yesterday()].metrics.steps).toBe(6700);
  });

  it('re-reads the oldest requested day when the range query hits its cap', async () => {
    await onDevice();
    // A heavy month of steps, plus one sample on the very first requested
    // date. The fallback windows must cover it too, or that day silently
    // vanishes whenever the single range read is discarded at the cap.
    const heavy: HealthSample[] = [sample('steps', 700, day(isoKey(shiftDays(30)), '12:00'))];
    for (let d = 0; d < 30; d += 1) {
      for (let k = 0; k < 67; k += 1) {
        const minute = k * 20;
        heavy.push(sample('steps', 100, day(isoKey(shiftDays(d)), `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`)));
      }
    }
    device.samples = heavy;

    const days = await readDays(30);
    const byDate = Object.fromEntries(days.map((x) => [x.date, x]));

    expect(byDate[isoKey(shiftDays(30))].metrics.steps).toBe(700);
  });

  it('keeps the single-query fast path when the cap is not reached', async () => {
    await onDevice();
    device.samples = [sample('steps', 100, day(yesterday(), '09:00'))];

    await readDays(7);

    expect(device.readCalls.filter((c) => c.dataType === 'steps')).toHaveLength(1);
  });
});

describe('readDays: sleep survives its own cap', () => {
  it('re-reads per morning and dedupes the overlapping windows', async () => {
    await onDevice('ios');
    // iOS emits one sample per stage segment. Nights of 80 segments each are
    // enough that the whole month overruns the 2000-sample cap.
    const nights: HealthSample[] = [];
    for (let i = 0; i < 30; i += 1) {
      const morning = shiftDays(i);
      for (let k = 0; k < 80; k += 1) {
        const start = new Date(morning.getFullYear(), morning.getMonth(), morning.getDate() - 1, 23, 0, 0);
        start.setMinutes(k * 6);
        const end = new Date(start.getTime() + 6 * 60000);
        nights.push(sleepSample(start.toISOString(), end.toISOString(), [stage(start.toISOString(), end.toISOString(), 'light')], { platformId: `n${i}-s${k}` }));
      }
    }
    device.samples = nights;

    const days = await readDays(30);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));

    // The single capped query alone would have kept only the oldest nights.
    const sleepCalls = device.readCalls.filter((c) => c.dataType === 'sleep');
    expect(sleepCalls.length).toBeGreaterThan(1);

    // Last night is whole: bounds span the full night and every one of its 80
    // segments is present exactly once — the re-read windows overlap by a
    // night, so without deduping the merged session would double them.
    const session = byDate[yesterday()].sleep!;
    expect(session.stages).toHaveLength(80);
    // The whole night sits on one day record: it starts the evening before
    // yesterday and every segment of it is present, not split across two days.
    expect(session.start).toBe(new Date(day(isoKey(shiftDays(2)), '23:00')).toISOString());
    expect(session.stages.reduce((n, b) => n + (b.endMin - b.startMin), 0)).toBe(480);
  });
});

describe('readDays: sleep clusters stay separate', () => {
  it('does not merge a daytime nap into the overnight session', async () => {
    await onDevice('ios');
    device.samples = [
      // The night, as iOS emits it: one sample per segment.
      sleepSample(day(twoAgo(), '23:00'), day(yesterday(), '01:00'), [stage(day(twoAgo(), '23:00'), day(yesterday(), '01:00'), 'light')], { platformId: 'n1' }),
      sleepSample(day(yesterday(), '01:00'), day(yesterday(), '07:00'), [stage(day(yesterday(), '01:00'), day(yesterday(), '07:00'), 'deep')], { platformId: 'n2' }),
      // A separate nap that ends on the same morning's date.
      sleepSample(day(yesterday(), '14:00'), day(yesterday(), '15:00'), undefined, { platformId: 'nap' }),
      // A resting reading inside the daytime gap: it belongs to neither block.
      sample('restingHeartRate', 50, day(yesterday(), '12:00'), 'bpm'),
    ];

    const session = (await readDays(3)).find((d) => d.date === yesterday())!.sleep!;

    // The session is the night, not a 16-hour stretch through the nap.
    expect(session.start).toBe(day(twoAgo(), '23:00'));
    expect(session.end).toBe(day(yesterday(), '07:00'));
    expect(session.stages).toHaveLength(2);
    // The overnight metric windows do not reach across the daytime gap.
    expect(session.rhrBpm).toBeNull();
  });

  it('keeps the longer cluster when two end on the same morning', async () => {
    await onDevice('ios');
    device.samples = [
      // A short doze ending in the small hours...
      sleepSample(day(yesterday(), '00:30'), day(yesterday(), '01:00'), undefined, { platformId: 'doze' }),
      // ...and the real night, ending on the same date.
      sleepSample(day(yesterday(), '02:00'), day(yesterday(), '08:00'), undefined, { platformId: 'night' }),
    ];

    const session = (await readDays(2)).find((d) => d.date === yesterday())!.sleep!;

    expect(session.start).toBe(day(yesterday(), '02:00'));
    expect(session.end).toBe(day(yesterday(), '08:00'));
  });
});

describe('readDays: a sleep window that is still capped after splitting', () => {
  it('withholds the session rather than scoring a shortened night', async () => {
    await onDevice('ios');
    // One night whose segment count is so high that even a slice a few hours
    // wide still fills the 500-sample per-window cap after the full splitting
    // depth: the read cannot vouch for the night's completeness.
    const segments: HealthSample[] = [];
    const nightStart = new Date(shiftDays(1).getFullYear(), shiftDays(1).getMonth(), shiftDays(1).getDate() - 1, 21, 0, 0);
    for (let k = 0; k < 6000; k += 1) {
      const start = new Date(nightStart.getTime() + k * 6000);
      const end = new Date(start.getTime() + 6000);
      segments.push(sleepSample(start.toISOString(), end.toISOString(), [stage(start.toISOString(), end.toISOString(), 'light')], { platformId: `s${k}` }));
    }
    device.samples = segments;

    const days = await readDays(3);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));

    // The read ran the fallback (the single range query was capped)...
    expect(device.readCalls.filter((c) => c.dataType === 'sleep').length).toBeGreaterThan(1);
    // ...and still could not complete the night, so no session is claimed.
    expect(byDate[yesterday()].sleep).toBeNull();
  });
});

describe('readDays: the workout ask', () => {
  it('sorts descending so a capped query keeps the newest workouts', async () => {
    await onDevice();
    device.workouts = [
      workout({ workoutType: 'running', duration: 600, startDate: day(threeAgo(), '07:00'), endDate: day(threeAgo(), '07:10'), platformId: 'old' }),
      workout({ workoutType: 'running', duration: 600, startDate: day(yesterday(), '07:00'), endDate: day(yesterday(), '07:10'), platformId: 'newest' }),
    ];

    await readDays(3);

    // The plugin sorts then take(limit): ascending would have dropped
    // 'newest' once the cap hit, so Bene must ask for descending.
    expect(device.workoutCalls).toHaveLength(1);
    expect(device.workoutCalls[0].ascending).toBe(false);
    expect(device.workoutCalls[0].limit).toBe(200);
    // And the newest one is what came back and was filed.
    expect((await readDays(3)).flatMap((d) => d.workouts).map((w) => w.id)).toContain('newest');
  });
});
