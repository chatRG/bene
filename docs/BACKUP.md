# Backup format and restore rules

## Principles

1. **The file is the account.** There is no server copy.
2. **Raw data only.** Backups store observations (sleep stages, HR samples, meals, workouts, settings), never derived scores. Restoring recomputes everything with the current algorithm.
3. **Validate before replacing.** A failed validation must leave existing data untouched.

## Location

| What | Where |
|---|---|
| Live app state | `localStorage["bevel-community-v1"]` (web) or the WebView's local storage inside the native app |
| Daily snapshot | `localStorage["bevel-community-snapshot"]` |
| Downloaded file | `bevel-backup-YYYY-MM-DD.json` |

Snapshots are a convenience, not a second account. Clearing site data or uninstalling the app removes both the live state and the snapshot.

## Document shape

```json
{
  "app": "bevel-community",
  "version": 1,
  "exportedAt": "2026-11-14T14:00:00.000Z",
  "data": {
    "profile": { "name": "…", "email": "…", "birthDate": "…" },
    "settings": { "theme": "system", "units": "imperial", "…": "…" },
    "days": { "2026-11-14": { "sleep": {}, "metrics": {}, "workouts": [], "meals": [], "journal": [] } },
    "dayOrder": ["2026-09-16", "…", "2026-11-14"],
    "journalTags": [],
    "journalEntries": [],
    "biomarkers": [],
    "healthRecords": [],
    "chats": [],
    "routines": [],
    "credits": {},
    "activityEvents": [],
    "seededAt": "…"
  }
}
```

## Validation

`parseBackup()` checks, in order:

1. Valid JSON.
2. `app === "bevel-community"` — rejects foreign files.
3. `version` is a number and not newer than the running build.
4. `data.profile`, `data.days`, `data.dayOrder` exist and `dayOrder` is non-empty.
5. `days` is an object with at least one day.

Any failure returns a human-readable error and is surfaced as a toast. Restore is a two-step UI: choose a file, then confirm replacement.

## Restore semantics

- Replaces profile, settings, days, journal, biomarkers, records, chats, routines, credits and activity events.
- Forces `settings.onboarded = true` so the user lands in the app instead of onboarding.
- Writes a fresh snapshot of the restored state.
- Does **not** merge. There is no partial restore in v1.

## Size and performance

The 60-day demo backup is roughly 1.5 MB because it contains 10-minute HR samples for every day. Browser local storage is commonly capped at ~5 MB. For longer histories:

- increase the sample interval before extending the window (already 10 minutes),
- or move the repository to IndexedDB in a future version,
- or trim `hrSamples` for days older than 90 days before persisting.

The downloaded file is not subject to the localStorage cap, so it can hold a larger history than the in-app store.

## Security

Backups are **plain, unencrypted JSON** containing health information. There is no password protection in v1. Store them in a private folder and treat them like any other medical document. A future version may add optional age-based encryption (WebCrypto), but that would make recovery impossible without the passphrase.

## Testing

`scripts/e2e-backup.mjs` covers:

- automatic snapshot creation,
- `lastBackupAt` persistence,
- downloadable file with correct schema,
- restore of the latest snapshot,
- import of a downloaded file after a reset,
- rejection of an invalid file with a toast,
- tab visibility removal (a related settings persistence check).
