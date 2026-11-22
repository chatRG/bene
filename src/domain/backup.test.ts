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
