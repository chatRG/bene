/**
 * One connection to the phone's health store, shared by onboarding and
 * Settings so both surfaces ask the same question and say the same thing.
 *
 * Nothing here invents data. Every message is derived from what the bridge
 * actually returned: no health store, no permission, a store with nothing in
 * it, or N real days that were merged into the local store.
 */
import { differenceInCalendarDays, isValid } from 'date-fns';
import type { DayRecord } from '../domain/types';
import type { HealthPlatform, HealthStatus } from './health';
import { checkAccess, openSettings, platform, platformLabel, readDays, requestAccess } from './health';
import { storeGeneration } from '../store/useAppStore';

/** What the UI knows before anything has been read this session. */
export type HealthPhase = 'checking' | 'unavailable' | 'idle' | 'denied' | 'connected';

export interface HealthLink {
  phase: HealthPhase;
  platform: HealthPlatform;
  platformLabel: string;
  /** True only on a phone whose OS has a health store Bene can read. */
  available: boolean;
  /** Days merged into the local store by the last successful read. */
  days: number;
  /** When that read happened. */
  syncedAt: string | null;
  /** The honest sentence to show under the status row. */
  detail: string;
  readAuthorized: string[];
  readDenied: string[];
  /** The OS's own explanation for an unavailable store, when it gives one. */
  reason?: string;
}

/** How far back Bene reads when there is no previous successful sync. */
export const SYNC_DAYS = 30;

/**
 * Whole local calendar days to reread. The last sync's own day is included:
 * samples and daily totals can still change after Bene has read them.
 */
export function syncWindowDays(lastSyncedAt: string | null = null, now = new Date()): number {
  if (!lastSyncedAt) return SYNC_DAYS;
  const last = new Date(lastSyncedAt);
  if (!isValid(last)) return SYNC_DAYS;
  const elapsed = differenceInCalendarDays(now, last);
  // A clock-skewed future cursor must trigger a resync, never a zero-day read.
  // One whole day is the floor because last night's sleep starts before local
  // midnight; the app's supported history is the ceiling.
  if (elapsed < 0) return SYNC_DAYS;
  return Math.min(SYNC_DAYS, Math.max(1, elapsed));
}

const label = platformLabel.bind(null);

export function initialLink(p: HealthPlatform = platform()): HealthLink {
  return {
    phase: p === 'unavailable' ? 'unavailable' : 'checking',
    platform: p,
    platformLabel: label(p),
    /* Not yet known, and this used to claim otherwise: `p !== 'unavailable'`
       meant "this is an Android phone", so the status showed a connected dot
       before anything had been asked of Health Connect. Tapping it then probed
       the store, found nothing, and flipped to unavailable — the app asserting
       a connection it had never made. Availability is only true once
       Health.isAvailable() has said so. */
    available: false,
    days: 0,
    syncedAt: null,
    detail: p === 'unavailable' ? unavailableDetail(p) : 'Checking access…',
    readAuthorized: [],
    readDenied: [],
  };
}

function unavailableDetail(p: HealthPlatform, reason?: string): string {
  if (p === 'apple-health') {
    // iOS on a phone always has a store; this only happens if HealthKit is off.
    return 'Apple Health is not reachable on this device. You can log everything by hand.';
  }
  if (p === 'health-connect') {
    /* Health Connect reports two different failures and they need different
       advice. "Needs an update" means it is installed and an update fixes it;
       "unavailable" means it is not on the phone. Flattening both into one
       sentence leaves the user with no next step. */
    if (reason && /update/i.test(reason)) {
      return 'Health Connect is installed but needs an update. Update it from the Play Store, then connect again.';
    }
    if (reason) {
      return `Health Connect is not available on this phone (${reason}) Install it from the Play Store, then connect again.`;
    }
    return 'Health Connect is not available on this phone. Install or enable it from the Play Store, then connect again.';
  }
  return 'Bene opens on a phone to read Apple Health or Health Connect — until then everything here is logged by hand.';
}

function deniedDetail(p: HealthPlatform): string {
  return `${label(p)} read access was not granted, so no data was imported. Bene only reads — it never writes back.`;
}

/**
 * The subtitle under the store's name on the card.
 *
 * It used to be a fixed capability list ("Sleep, HRV, resting heart rate,
 * steps, workouts") whatever the state, so a store reporting unavailable still
 * advertised everything it could read, directly above a banner saying there was
 * nothing to read. It now says what is true for the current phase.
 */
export function storeRowSubtitle(phase: HealthPhase): string {
  if (phase === 'connected') return 'Read on this device · read-only';
  if (phase === 'unavailable') return 'Not available on this device';
  if (phase === 'denied') return 'Read access not granted';
  return 'Sleep, HRV, resting heart rate, steps, workouts';
}

/** The one sentence shown for a status result, whatever surface asked. */
export function describe(days: number): string {
  if (days > 0) {
    return `Connected — ${days} ${days === 1 ? 'day' : 'days'} of history read on this device.`;
  }
  return 'Connected — the health store is empty, so nothing has been imported yet. Data appears as your devices sync.';
}


function fromStatus(
  status: HealthStatus,
): Pick<HealthLink, 'available' | 'platform' | 'platformLabel' | 'readAuthorized' | 'readDenied' | 'reason'> {
  return {
    available: status.available,
    platform: status.platform,
    platformLabel: label(status.platform),
    readAuthorized: status.readAuthorized.map(String),
    readDenied: status.readDenied.map(String),
    reason: status.reason,
  };
}

/** Read the store and merge it, without prompting. Used by "Sync now". */
let readInFlight: Promise<HealthLink> | null = null;
let connectInFlight: Promise<HealthLink> | null = null;
const SYNC_TIMEOUT_MS = 60_000;

function withDeadline<T>(promise: Promise<T>, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out`)), SYNC_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function readAndImport(
  importDays: (records: DayRecord[], syncedAt: string) => void,
  lastSyncedAt: string | null = null,
): Promise<HealthLink> {
  // Startup and pull-to-refresh can arrive together. They write to the same
  // store, so one shared result is both sufficient and safer than competing
  // reads whose completion order could move the sync cursor backwards.
  if (readInFlight) return readInFlight;
  if (connectInFlight) return connectInFlight;
  const run = performReadAndImport(importDays, lastSyncedAt);
  readInFlight = run;
  const clear = () => {
    if (readInFlight === run) readInFlight = null;
  };
  void run.then(clear, clear);
  return run;
}

async function performReadAndImport(
  importDays: (records: DayRecord[], syncedAt: string) => void,
  lastSyncedAt: string | null,
): Promise<HealthLink> {
  let status: HealthStatus;
  try {
    status = await withDeadline(checkAccess(), 'Checking health access');
  } catch {
    return {
      ...initialLink(),
      phase: 'idle',
      detail: 'Could not check health access just now. Nothing was imported — try again.',
    };
  }
  const base = fromStatus(status);
  if (!status.available) {
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform, status.reason) };
  }
  if (!status.readAuthorized.length) {
    return { ...initialLink(), ...base, phase: 'denied', detail: deniedDetail(status.platform) };
  }
  const generation = storeGeneration();
  // Stamp the start, not the finish: if the read crosses midnight, the next
  // sync still includes the earlier day instead of leaving a gap at the edge.
  const syncedAt = new Date().toISOString();
  let records: DayRecord[];
  try {
    records = await withDeadline(readDays(syncWindowDays(lastSyncedAt)), 'Reading health data');
  } catch {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: `Could not read ${label(status.platform)} just now. Nothing was imported — try again.`,
    };
  }
  // The person may have deleted everything while the read was running. Those
  // days belong to an account that no longer exists, so drop them rather than
  // quietly writing health history back into a cleared store.
  if (generation !== storeGeneration()) {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: 'Everything was deleted while reading, so nothing was imported.',
    };
  }

  importDays(records, syncedAt);
  return {
    ...initialLink(),
    ...base,
    phase: 'connected',
    days: records.length,
    syncedAt,
    detail: records.length
      ? describe(records.length)
      : lastSyncedAt
        ? 'Connected — no new health data since the last sync.'
        : describe(0),
  };
}

/** Prompt for access, then read and merge. Used by "Connect". */
export function connectAndImport(
  importDays: (records: DayRecord[], syncedAt: string) => void,
): Promise<HealthLink> {
  if (connectInFlight) return connectInFlight;
  const run = (async () => {
    // Let any startup/manual read finish first. Two 30-day reads of the same
    // store would finish in an arbitrary order and both stamp the cursor.
    if (readInFlight) {
      try {
        await readInFlight;
      } catch {
        // The explicit Connect below retries with its own result.
      }
    }
    return performConnectAndImport(importDays);
  })();
  connectInFlight = run;
  const clear = () => {
    if (connectInFlight === run) connectInFlight = null;
  };
  void run.then(clear, clear);
  return run;
}

async function performConnectAndImport(
  importDays: (records: DayRecord[], syncedAt: string) => void,
): Promise<HealthLink> {
  let status: HealthStatus;
  try {
    status = await withDeadline(requestAccess(), 'Opening health permission');
  } catch {
    const p = platform();
    return {
      ...initialLink(p),
      phase: p === 'unavailable' ? 'unavailable' : 'idle',
      detail:
        p === 'unavailable'
          ? unavailableDetail(p)
          : `The ${label(p)} permission sheet could not be opened. Nothing was imported — try again in Settings.`,
    };
  }
  const base = fromStatus(status);
  if (!status.available) {
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform, status.reason) };
  }
  if (!status.readAuthorized.length) {
    return { ...initialLink(), ...base, phase: 'denied', detail: deniedDetail(status.platform) };
  }
  const generation = storeGeneration();
  const syncedAt = new Date().toISOString();
  let records: DayRecord[];
  try {
    records = await withDeadline(readDays(SYNC_DAYS), 'Reading health history');
  } catch {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: `Access was granted but ${label(status.platform)} could not be read. Nothing was imported — try again.`,
    };
  }
  // The person may have deleted everything while the read was running. Those
  // days belong to an account that no longer exists, so drop them rather than
  // quietly writing health history back into a cleared store.
  if (generation !== storeGeneration()) {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: 'Everything was deleted while reading, so nothing was imported.',
    };
  }

  importDays(records, syncedAt);
  return {
    ...initialLink(),
    ...base,
    phase: 'connected',
    days: records.length,
    syncedAt,
    detail: describe(records.length),
  };
}

/** Ask the OS what access Bene already has, without showing a prompt. */
export async function probeAccess(): Promise<HealthLink> {
  let status: HealthStatus;
  try {
    status = await withDeadline(checkAccess(), 'Checking health access');
  } catch {
    return {
      ...initialLink(),
      phase: 'idle',
      detail: 'Could not check health access just now. Try again.',
    };
  }
  const base = fromStatus(status);
  if (!status.available) {
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform, status.reason) };
  }
  if (!status.readAuthorized.length) {
    return {
      ...initialLink(),
      ...base,
      phase: 'denied',
      detail: `Not connected. ${label(status.platform)} read access has not been granted, so no data has been imported.`,
    };
  }
  return {
    ...initialLink(),
    ...base,
    phase: 'connected',
    detail: `Connected to ${label(status.platform)}. No days read yet this session — tap Sync now.`,
  };
}

/** Short status word for a pill or row. */
export function statusWord(link: HealthLink): string {
  switch (link.phase) {
    case 'unavailable':
      return 'Unavailable';
    case 'connected':
      return 'Connected';
    case 'denied':
      return 'No access';
    case 'checking':
      return 'Checking…';
    default:
      return 'Not connected';
  }
}

export { openSettings };
