# Architecture

## Overview

Bene is one TypeScript application. React renders the UI. Capacitor packages the app for iOS and Android. Vite builds the web/PWA target.

```
┌─────────────────────────────────────────────────────┐
│  Screens (React)                                    │
│  Home · Recovery · Sleep · Strain · Fitness         │
│  Nutrition · Journal · Biology · Coach              │
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

The app has no API client, no authentication and no background sync. “Sync” is the backup file.

## Layers

### `src/domain/`

The domain layer is pure TypeScript. It has no React code. It uses the DOM only in `backup.ts` (localStorage snapshot helpers) and `seed.ts` (date construction).

- `types.ts` holds the data model: profile, settings, day records, sleep sessions, workouts, meals, journal, biomarkers, chats, routines and credits.
- `scoring/` holds one file for each score family: `zones`, `sleep`, `recovery`, `strain`, `load`, `nutrition` and `biology`.
- `derive.ts` composes each day's values (baselines, score gates, nutrition, stress, sleep bank) from the raw store. Screens call it. Bene never stores its output.
- `seed.ts` builds the deterministic 60-day demo dataset around the run date.
- `backup.ts` provides the versioned JSON export, the validation and the on-device snapshot.
- `coach.ts` generates deterministic offline replies for the coach UI.
- `math.ts` holds shared helpers (clamp, mean, SD, stage totals, age).

### `src/store/useAppStore.ts`

The app uses one Zustand store. The persisted slice contains **data only**. The store initializer re-creates the actions. Hydration is shallow-merged, so new settings defaults survive a schema change. Bene reserves `version` for explicit migrations.

Actions change data atomically and never calculate scores. This approach keeps scoring deterministic and testable. It also prevents the persistence of stale derived values.

### `src/components/`

- `ui.tsx` provides rings, headers, the tab bar, bottom sheets, list rows and the avatar.
- `charts.tsx` provides hand-built SVG: a line chart with gradient/area/band/average/pill, a hypnogram, a semi gauge, a dot matrix, a range bar, an energy bar and a sparkline.
- `glyphs.tsx` maps semantic emoji names from seeded data to Lucide icons. The UI thus does not use a system emoji font.
- `toast.tsx` is a small imperative toast host.

### `src/screens/`

Each surface has one file. Screens read the store, call the `deriveDay`/`derive` helpers and dispatch actions. They contain no business rules except presentation branching.

### `src/styles/`

- `base.css` holds tokens (light/dark/night), typography, cards, buttons, nav, sheets, inputs and animation primitives.
- `screens.css` holds the layout primitives for each surface.

Design tokens are CSS variables. Bene scopes the night theme with `[data-night]`, so the sleep detail stays dark in light mode.

## Data flow for a score

1. Raw samples live in `DayRecord` (sleep stages, HR samples, workouts, meals).
2. `deriveDay(state, date)` selects a 28-day baseline window and applies the gates. It calls the pure scoring function. It returns display-ready values and a reason when the score is unavailable.
3. Screens render the derived value. Bene never writes a derived value back to the store.
4. When the user logs an item, only raw data changes. The next render derives the values again.

Thus backup files contain raw data only. A restore from a backup of the previous month recalculates the scores with the current algorithm. It does not import stale derived values.

## Persistence and schema

- Store key: `bene-v1`.
- Snapshot key: `bene-snapshot`.
- The backup document has a schema-relevant `version`. The app does not store this `version` in localStorage.
- Dates are local `yyyy-MM-dd`. Timestamps are ISO 8601.
- Bene generates the demo dataset one time and persists it. `resetDemo()` rebuilds it around the current date.

## Native packaging

`capacitor.config.ts` sets:

- `appId: health.bene.community`
- `appName: Bene`
- `webDir: dist`
- mobile content mode and safe-area handling

`npx cap sync` copies `dist/` into both native shells. The current feature set needs no native plugin. Haptics, HealthKit and Health Connect are future adapters.

## Testing

- `vitest` runs the pure-domain tests: published invariants, gates, calibration, contributor points and backup validation.
- `scripts/screenshots.mjs` drives Playwright at 430×932. It captures the main screens into `docs/screenshots/` and reports horizontal overflow or console errors.
- `scripts/e2e.mjs` exercises navigation, scoring display, meal logging, journal sheets, coach replies, workout start/finish, theme switching and Home edit mode.
- `scripts/e2e-empty.mjs` covers onboarding without demo data and the empty dashboard.
- `scripts/e2e-backup.mjs` exercises snapshot creation, download, restore, file import, invalid-file rejection and tab visibility.
- `scripts/e2e-pwa.mjs` checks the service worker and an offline reload of the production build.

The repository includes the screenshot suite on purpose. You can then review UI changes visually in CI artifacts or locally without a native simulator.

## Adding a screen

1. Add the route in `src/App.tsx`.
2. Create `src/screens/YourScreen.tsx`. Use the existing `DetailHeader`, `Sheet`, `Ring` and `ListRow` primitives.
3. Add layout classes to `src/styles/screens.css`.
4. Add the screen to `scripts/screenshots.mjs`, so the visual pass covers it.
5. If the screen adds a metric, add a pure function under `src/domain/scoring/` and a test.

## Adding a score

1. Define the inputs and the output in `types.ts` if the score needs new raw data.
2. Implement a pure function in `scoring/` with explicit gates and a reason string.
3. Wire the score in `deriveDay` and expose it through `DayDerived`.
4. Add invariants to `scoring.test.ts`.
5. Document the weights and gates in `docs/SCORING.md`.
