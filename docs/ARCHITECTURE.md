# Architecture

## Overview

Bene is a single TypeScript application rendered by React, packaged by Capacitor for iOS and Android and by Vite for the web/PWA.

```
┌─────────────────────────────────────────────────────┐
│  Screens (React)                                    │
│  Home · Recovery · Sleep · Strain · Fitness · …     │
└───────────────▲─────────────────────┬───────────────┘
                │ derived values      │ user actions
┌───────────────┴─────────────────────▼───────────────┐
│  Zustand store (persisted data + actions)           │
│  profile, settings, days, meals, workouts, chats    │
└───────────────▲─────────────────────┬───────────────┘
                │ pure functions      │ atomic writes
┌───────────────┴─────────────────────▼───────────────┐
│  domain/                                            │
│  types · scoring · derive · seed · backup · coach   │
└───────────────▲─────────────────────┬───────────────┘
                │                     │
        localStorage / app container  │  JSON backup file
```

There is no API client, no auth, and no background sync. “Sync” is the backup file.

## Layers

### `src/domain/`

Pure TypeScript. No React, no DOM except in `backup.ts` (localStorage snapshot helpers) and `seed.ts` (date construction).

- `types.ts` — the data model: profile, settings, day records, sleep sessions, workouts, meals, journal, biomarkers, chats, routines, credits.
- `scoring/` — one file per score family: `zones`, `sleep`, `recovery`, `strain`, `load`, `nutrition`, `biology`.
- `derive.ts` — composes per-day values (baselines, score gates, nutrition, stress, sleep bank) from the raw store. Called by screens; never stored.
- `seed.ts` — deterministic 60-day demo dataset anchored to the run date.
- `backup.ts` — versioned JSON export, validation and on-device snapshot.
- `coach.ts` — deterministic, offline reply generator for the coach UI.
- `math.ts` — shared helpers (clamp, mean, SD, stage totals, age).

### `src/store/useAppStore.ts`

A single Zustand store. The persisted slice contains **data only**; actions are re-created by the store initializer. Hydration is shallow-merged, so new settings defaults survive schema evolution. `version` is reserved for explicit migrations.

Actions mutate data atomically and never compute scores. This keeps scoring deterministic and testable and prevents stale derived values from being persisted.

### `src/components/`

- `ui.tsx` — rings, headers, tab bar, bottom sheets, list rows, avatar.
- `charts.tsx` — hand-built SVG: line chart with gradient/area/band/average/pill, hypnogram, semi gauge, dot matrix, range bar, energy bar, sparkline.
- `glyphs.tsx` — maps semantic emoji names from seeded data to Lucide icons so the UI never depends on a system emoji font.
- `toast.tsx` — tiny imperative toast host.

### `src/screens/`

One file per surface. Screens read the store, call `deriveDay`/`derive` helpers, and dispatch actions. They contain no business rules beyond presentation branching.

### `src/styles/`

- `base.css` — tokens (light/dark/night), typography, cards, buttons, nav, sheets, inputs, animation primitives.
- `screens.css` — layout primitives for each surface.

Design tokens are CSS variables. The night theme is scoped with `[data-night]` so the sleep detail stays dark even in light mode.

## Data flow for a score

1. Raw samples live in `DayRecord` (sleep stages, HR samples, workouts, meals).
2. `deriveDay(state, date)` selects a 28-day baseline window, applies gates, calls the pure scoring function, and returns display-ready values plus a reason when the score is unavailable.
3. Screens render the derived value. Nothing derived is written back to the store.
4. When the user logs something, only raw data changes; the next render derives again.

This is why backup files contain raw data only: restoring a backup from last month recomputes scores with the current algorithm, rather than importing stale derived values.

## Persistence and schema

- Store key: `bene-v1` (migrates from `bevel-community-v1`).
- Snapshot key: `bene-snapshot` (falls back to `bevel-community-snapshot`).
- Settings include a schema-relevant `version` in the backup document, not in localStorage.
- Dates are local `yyyy-MM-dd`; timestamps are ISO 8601.
- The demo dataset is generated once and persisted. `resetDemo()` rebuilds it around the current date.

## Native packaging

`capacitor.config.ts` sets:

- `appId: health.bene.community`
- `appName: Bene`
- `webDir: dist`
- mobile content mode and safe-area handling

`npx cap sync` copies `dist/` into both native shells. No native plugin is required for the current feature set; haptics, HealthKit and Health Connect are future adapters (see `docs/HEALTH_SOURCES.md`).

## Testing

- `vitest` runs pure-domain tests: published invariants, gates, calibration, contributor points, backup validation.
- `scripts/screenshots.mjs` drives Playwright at 430×932, captures the main screens into `docs/screenshots/`, and reports horizontal overflow or console errors.
- `scripts/e2e.mjs` exercises navigation, scoring display, meal logging, journal sheets, coach replies, workout start/finish, theme switching and Home edit mode.
- `scripts/e2e-empty.mjs` covers onboarding without demo data and the empty dashboard.
- `scripts/e2e-import.mjs` covers the Apple Health export importer.
- `scripts/e2e-backup.mjs` exercises snapshot creation, download, restore, file import, invalid-file rejection and tab visibility.
- `scripts/e2e-pwa.mjs` checks the service worker and an offline reload of the production build.

The screenshot suite is intentionally part of the repository so UI changes can be reviewed visually in CI artifacts (or locally) without a native simulator.

## Adding a screen

1. Add the route in `src/App.tsx`.
2. Create `src/screens/YourScreen.tsx`; use existing `DetailHeader`, `Sheet`, `Ring`, `ListRow` primitives.
3. Add layout classes to `src/styles/screens.css`.
4. Add it to `scripts/screenshots.mjs` so it is covered by the visual pass.
5. If it introduces a metric, add a pure function under `src/domain/scoring/` and a test.

## Adding a score

1. Define inputs and output in `types.ts` if new raw data is needed.
2. Implement a pure function in `scoring/`, with explicit gates and a reason string.
3. Wire it in `deriveDay` and expose it through `DayDerived`.
4. Add invariants to `scoring.test.ts`.
5. Document weights and gates in `docs/SCORING.md`.
