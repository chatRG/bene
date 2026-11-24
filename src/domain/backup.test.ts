import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSeed } from './seed';
import { stateWithWeekOfData } from './fixtures';
import { createBackup, parseBackup, saveSnapshot } from './backup';

function validBackup() {
  return JSON.parse(JSON.stringify(createBackup(stateWithWeekOfData(new Date('2026-11-14T13:20:00')))));
}

describe('backup validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a document with no days at all', () => {
    const result = parseBackup(JSON.stringify(createBackup(buildSeed(new Date()))));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty days object even when dayOrder is not empty', () => {
    const file = validBackup();
    file.data.days = {};
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(false);
  });

  it('rejects a dayOrder date with no matching day', () => {
    const file = validBackup();
    file.data.dayOrder = ['2026-01-01'];
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(false);
  });

  it('rejects a day that is missing workouts', () => {
    const file = validBackup();
    delete file.data.days[file.data.dayOrder[0]].workouts;
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(false);
  });

  it('reports a failed snapshot instead of a timestamp', () => {
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new Error('QuotaExceededError');
      },
    });
    const result = saveSnapshot(buildSeed(new Date()));
    expect(result.ok).toBe(false);
    expect(result.at).toBeNull();
  });
});

describe('entry-level validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Mutate the first day of an otherwise valid backup. */
  function withFirstDay(mutate: (day: Record<string, unknown>) => void) {
    const file = validBackup();
    mutate(file.data.days[file.data.dayOrder[0]] as unknown as Record<string, unknown>);
    return { file, result: parseBackup(JSON.stringify(file)) };
  }

  it('accepts a fully valid file: the fixture days are entry-complete', () => {
    const { result } = withFirstDay(() => {});
    expect(result.ok).toBe(true);
  });

  it('rejects a workout whose zoneMinutes are the wrong length, naming the day', () => {
    const { file, result } = withFirstDay((day) => {
      (day.workouts as Record<string, unknown>[])[0].zoneMinutes = [1, 2, 3];
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(file.data.dayOrder[0]);
  });

  it('rejects a workout missing its id', () => {
    const { result } = withFirstDay((day) => {
      delete (day.workouts as Record<string, unknown>[])[0].id;
    });
    expect(result.ok).toBe(false);
  });

  it('rejects metrics.steps that is not a number', () => {
    const { file, result } = withFirstDay((day) => {
      ((day.metrics as Record<string, unknown>).steps as unknown as string) = 'many';
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(file.data.dayOrder[0]);
  });

  it('rejects an hrSamples entry that is not a {minute, bpm} pair', () => {
    const { result } = withFirstDay((day) => {
      (day.metrics as Record<string, unknown>).hrSamples = [{ minute: 'ten' }];
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a meal missing a number the screens read', () => {
    const { result } = withFirstDay((day) => {
      delete (day.meals as Record<string, unknown>[])[0].calories;
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a journal entry whose value is neither yes/no/neutral nor a number', () => {
    const { result } = withFirstDay((day) => {
      (day.journal as Record<string, unknown>[]).push({ id: 'j1', tagId: 'energy', date: '2026-11-14', value: 'maybe', at: '2026-11-14T10:00:00.000Z' });
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a sleep session missing its window', () => {
    const { result } = withFirstDay((day) => {
      delete (day.sleep as Record<string, unknown>).start;
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a day present in days but missing from dayOrder', () => {
    // The restore replaces the whole days map, so an unlisted day would come
    // back as an invisible orphan — rejected rather than half-restored.
    const file = validBackup();
    file.data.days['2020-01-01'] = JSON.parse(JSON.stringify(file.data.days[file.data.dayOrder[0]]));
    file.data.days['2020-01-01'].date = '2020-01-01';
    const result = parseBackup(JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2020-01-01');
  });
});
