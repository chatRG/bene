/**
 * One connection to the phone's health store, shared by onboarding and
 * Settings so both surfaces ask the same question and say the same thing.
 *
 * Nothing here invents data. Every message is derived from what the bridge
 * actually returned: no health store, no permission, a store with nothing in
 * it, or N real days that were merged into the local store.
 */
import type { DayRecord } from '../domain/types';
import type { HealthPlatform, HealthStatus } from './health';
import { checkAccess, openSettings, platform, platformLabel, readDays, requestAccess } from './health';

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
}

/** How far back Bene reads on a connect or a manual sync. */
export const SYNC_DAYS = 30;

const label = platformLabel.bind(null);

export function initialLink(p: HealthPlatform = platform()): HealthLink {
  return {
    phase: p === 'unavailable' ? 'unavailable' : 'checking',
    platform: p,
    platformLabel: label(p),
    available: p !== 'unavailable',
    days: 0,
    syncedAt: null,
    detail: p === 'unavailable' ? unavailableDetail(p) : 'Checking access…',
    readAuthorized: [],
    readDenied: [],
  };
}

function unavailableDetail(p: HealthPlatform): string {
  if (p === 'apple-health') {
    // iOS on a phone always has a store; this only happens if HealthKit is off.
    return 'Apple Health is not reachable on this device. You can log everything by hand.';
  }
  if (p === 'health-connect') {
    return 'Health Connect is not reachable on this device. You can log everything by hand.';
  }
  return 'Bene opens on a phone to read Apple Health or Health Connect — until then everything here is logged by hand.';
}

function deniedDetail(p: HealthPlatform): string {
  return `${label(p)} read access was not granted, so no data was imported. Bene only reads — it never writes back.`;
}

/** The one sentence shown for a status result, whatever surface asked. */
export function describe(days: number): string {
  if (days > 0) {
    return `Connected — ${days} ${days === 1 ? 'day' : 'days'} of history read on this device.`;
  }
  return 'Connected — the health store is empty, so nothing has been imported yet. Data appears as your devices sync.';
}


function fromStatus(status: HealthStatus): Pick<HealthLink, 'available' | 'platform' | 'platformLabel' | 'readAuthorized' | 'readDenied'> {
  return {
    available: status.available,
    platform: status.platform,
    platformLabel: label(status.platform),
    readAuthorized: status.readAuthorized.map(String),
    readDenied: status.readDenied.map(String),
  };
}

/** Read the store and merge it, without prompting. Used by "Sync now". */
export async function readAndImport(
  importDays: (records: DayRecord[]) => void,
  days = SYNC_DAYS,
): Promise<HealthLink> {
  const status = await checkAccess();
  const base = fromStatus(status);
  if (!status.available) {
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform) };
  }
  if (!status.readAuthorized.length) {
    return { ...initialLink(), ...base, phase: 'denied', detail: deniedDetail(status.platform) };
  }
  let records: DayRecord[];
  try {
    records = await readDays(days);
  } catch {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: `Could not read ${label(status.platform)} just now. Nothing was imported — try again.`,
    };
  }
  importDays(records);
  return {
    ...initialLink(),
    ...base,
    phase: 'connected',
    days: records.length,
    syncedAt: new Date().toISOString(),
    detail: describe(records.length),
  };
}

/** Prompt for access, then read and merge. Used by "Connect". */
export async function connectAndImport(
  importDays: (records: DayRecord[]) => void,
  days = SYNC_DAYS,
): Promise<HealthLink> {
  let status: HealthStatus;
  try {
    status = await requestAccess();
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
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform) };
  }
  if (!status.readAuthorized.length) {
    return { ...initialLink(), ...base, phase: 'denied', detail: deniedDetail(status.platform) };
  }
  let records: DayRecord[];
  try {
    records = await readDays(days);
  } catch {
    return {
      ...initialLink(),
      ...base,
      phase: 'idle',
      detail: `Access was granted but ${label(status.platform)} could not be read. Nothing was imported — try again.`,
    };
  }
  importDays(records);
  return {
    ...initialLink(),
    ...base,
    phase: 'connected',
    days: records.length,
    syncedAt: new Date().toISOString(),
    detail: describe(records.length),
  };
}

/** Ask the OS what access Bene already has, without showing a prompt. */
export async function probeAccess(): Promise<HealthLink> {
  const status = await checkAccess();
  const base = fromStatus(status);
  if (!status.available) {
    return { ...initialLink(), ...base, phase: 'unavailable', detail: unavailableDetail(status.platform) };
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
