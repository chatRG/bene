# AGENTS.md

Bene is a local-first health/recovery app: one TypeScript + React 19 app, packaged by Vite (web/PWA) and Capacitor (iOS/Android). No account, no telemetry, no network calls — data lives in `localStorage` and one JSON backup file. Source-available under PolyForm Noncommercial 1.0.0.

## Setup

```bash
bun install          # bun 1.4.5 (engines: bun >=1.2); lockfile is bun.lock — do not use npm/pnpm
```

## Commands (verbatim from package.json)

```bash
bun run dev          # vite on 0.0.0.0:5173
bun run build        # tsc -b && vite build
bun run preview      # vite preview on 0.0.0.0:4173
bun run test         # vitest run
bun run lint         # tsc -b --pretty false  (no ESLint — types are the linter)
bun run test:e2e     # playwright vs a running dev server
bun run test:backup | test:empty | test:pwa | test:a11y
bun run shots        # render every screen to docs/screenshots
bun run cap:sync     # cap sync (native)
```

CI (`.github/workflows/ci.yml`) runs, in order: `bun install --frozen-lockfile` → lint → test → build → e2e/empty/backup against `bun run dev`, then `bun run preview` + `test:pwa`. Match that before claiming a change works.

## Layout

- `src/domain/` — pure TS, no React: `types.ts` (data model), `derive.ts` (composes per-day values), `scoring/` (one file per score family), `backup.ts`, `seed.ts`, `coach.ts`, `math.ts`, `time.ts`. Tests co-located as `*.test.ts`.
- `src/store/useAppStore.ts` — single Zustand store; persisted slice holds data only, actions never compute scores.
- `src/screens/` — one file per surface; layout only. `src/components/` — shared primitives (`ui.tsx`, `charts.tsx`, `glyphs.tsx`).
- `src/styles/base.css` (tokens/themes) + `screens.css` (per-surface layout).
- `scripts/*.mjs` — Playwright harnesses driven by bun; `docs/ARCHITECTURE.md` and `docs/SCORING.md` are the design references.

## Conventions (observed)

- Scores are computed only in `src/domain/scoring/` and rendered via `derive.ts`; screens never recalculate. New weights need a `docs/SCORING.md` entry and an invariant test.
- Dates: local `yyyy-MM-dd` keys for day records, ISO strings for timestamps; build back-dated times with `dateAtTime()` in `src/domain/time.ts`, never `new Date()`.
- Styling: CSS variables from `base.css`; night theme scoped by `[data-night]`. No hard-coded palette, no emoji in UI chrome (system fonts differ) — use `lucide-react` via `glyphs.tsx`.
- Tests are plain vitest in node (no jsdom, no vitest config): stub globals with `vi.stubGlobal` and restore with `vi.unstubAllGlobals()`.
- Commit subjects are imperative, sentence case, no `feat:`/`fix:` prefix ("Fix the nav width and the Android status bar overlap"). `release.yml` builds release notes by `git log --pretty='* %s'`, so subjects are user-facing.
- Releases: `version` in `package.json` must equal `versionName` in `android/app/build.gradle`, and `versionCode` must increase; the workflow fails otherwise. `CHANGELOG.md` lags — do not treat it as the source of truth.

## Pitfalls

- `STORE_KEY = 'bene-v1'` and `BACKUP_VERSION = 1` are on-disk contracts. Rename the store key only by adding the old key to `LEGACY_STORE_KEYS` in `src/store/useAppStore.ts` (adoption moves the blob); bump `STORE_VERSION` or `BACKUP_VERSION` only with the matching migration (`STORE_MIGRATIONS` entry in the store, normalisation in `parseBackup`) — the store tests fail a bump that ships without one.
- Tests, lint and build are fast (~1s); the Playwright suites are not — they need a server already listening on 5173 (or `4173` for `test:pwa`) and fail with a connection error otherwise. Override with `BASE_URL`.
- `bun run shots` writes `docs/screenshots`; `shots-app/` and `dist/` are gitignored build output. Do not hand-edit `dist/sw.js` — Vite stamps `__BENE_RELEASE__` at build time.
- Android builds in this container: set `JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=$SCRATCH/tmp` (Room dies otherwise), gradle `-Xmx1280m --no-daemon --max-workers=1`, and `QEMU_LD_PREFIX=/opt/data/cache/scratch/x86_64-root` for the x86-64 `aapt2` under qemu. Signed releases need `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- `.agents/` holds local skills and is gitignored — not part of the repo.
