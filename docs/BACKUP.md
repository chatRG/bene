# Backup format and restore rules

## Principles

1. **The file is the account.** There is no server copy.
2. **Raw data only.** Backups store observations (sleep stages, HR samples, meals, workouts, settings). They never store derived scores. A restore recalculates all values with the current algorithm.
3. **Validate the file before you replace the data.** A failed validation must leave existing data untouched.

## Location

| What | Where |
|---|---|
| Live app state | `localStorage["bene-v1"]` |
| Daily snapshot | `localStorage["bene-snapshot"]` |
| Downloaded file | `bene-backup-YYYY-MM-DD.json` |

Snapshots are a convenience, not a second account. Clearing site data or uninstalling the app removes the live state and the snapshot.

## Document shape

The document has this shape. The example lists a subset of the settings and of `dayOrder`.

```json
{
  "app": "bene",
  "version": 1,
  "exportedAt": "2026-11-14T14:00:00.000Z",
  "data": {
    "profile": { "name": "string", "email": "string", "birthDate": "string" },
    "settings": { "theme": "system", "units": "imperial" },
    "days": { "2026-11-14": { "sleep": {}, "metrics": {}, "workouts": [], "meals": [], "journal": [] } },
    "dayOrder": ["2026-09-16", "2026-11-14"],
    "journalTags": [],
    "journalEntries": [],
    "biomarkers": [],
    "healthRecords": [],
    "chats": [],
    "routines": [],
    "credits": {},
    "activityEvents": [],
    "seededAt": "string"
  }
}
```

## Validation

`parseBackup()` runs these steps in order:

1. The file contains valid JSON.
2. `app === "bene"`.
3. `version` is a number and is not newer than the running build.
4. `data.profile`, `data.days` and `data.dayOrder` exist. `dayOrder` is not empty.
5. `days` is an object with at least one day.

On any failure, `parseBackup()` returns a human-readable error and displays it in a toast. Restore has two steps in the UI: choose a file, then accept the replacement.

## Restore semantics

- Bene replaces profile, settings, days, journal, biomarkers, records, chats, routines, credits and activity events.
- Bene forces `settings.onboarded = true`, so the user lands in the app and not in onboarding.
- Bene writes a fresh snapshot of the restored state.
- Bene does **not** merge. Version 1 has no partial restore.

## Size and performance

The 60-day demo backup is approximately 1.5 MB. It contains 10-minute HR samples for each day. Browsers commonly limit local storage to approximately 5 MB. For a longer history, use one of these options:

- increase the sample interval before you extend the window (the interval is 10 minutes now)
- move the repository to IndexedDB in a future version
- trim `hrSamples` for days older than 90 days before you persist the data

The downloaded file is not subject to the localStorage limit. It can hold a larger history than the in-app store.

## Security

Backups are **plain, unencrypted JSON** with health information. Version 1 has no password protection. Store backups in a private folder. Treat them like any other medical document. A future version may add optional age-based encryption (WebCrypto). That change would make recovery impossible without the passphrase.

## Testing

`scripts/e2e-backup.mjs` covers:

- automatic snapshot creation,
- `lastBackupAt` persistence,
- a downloadable file with the correct schema,
- restore of the latest snapshot,
- import of a downloaded file after a reset,
- rejection of an invalid file with a toast,
- tab visibility removal (a related settings persistence test).
