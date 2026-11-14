# Open Wearables as a data-source layer for Bene

Decision-grade research report. Sources: shallow clones at
`/opt/data/cache/scratch/open-wearables` (v1.0.0, commit 7ca121d, 2026-11-06),
`/opt/data/cache/scratch/ow-ios` (0.16.0), `/opt/data/cache/scratch/ow-android` (0.13.1),
`/opt/data/cache/scratch/ow-rn` (0.2.0), plus `/opt/data/bene`.

---

## 0. Verdict

Open Wearables (OW) is a **self-hosted server** that ingests wearable data and serves it through one
REST API. It is not a mobile data-source library.

It **cannot** serve as the on-device data-source layer for our app, for three independent reasons:

1. Its native SDKs are **upload-only**. Their public API has no read/query call — no method returns
   samples to the host app (`ow-ios/.../OpenWearablesHealthSDK.swift` exposes `configure`, `signIn`,
   `requestAuthorization`, `startBackgroundSync`, `getSyncStatus`, `resetAnchors`,
   `getStoredCredentials` — and nothing else; the Android facade is identical in shape).
2. Their job is to move bytes from HealthKit/Health Connect **to a server**. Our scoring layer needs
   bytes **in the WebView**. Those are opposite directions.
3. A server is mandatory for every OW path. Its read API is authenticated with a **global**,
   org-wide API key (`app/models/api_key.py:9` — *"Global API key for external service access"*),
   and the docs forbid putting app credentials on a device (`docs/sdk/integration.mdx:31`). So a
   device cannot read from OW without a broker service we would have to build and operate.

**Recommendation: Option A (native HealthKit / Health Connect adapters behind a custom Capacitor 7
plugin), then Option B1 (optional read-only connector to a user's own self-hosted OW) if cloud-wearable
demand appears. Do not adopt Option C.**

OW is still worth studying: its HealthKit sleep-sessionisation logic and its bug history are the most
valuable artefacts for us, and both are MIT and copyable.

---

## 1. What Open Wearables provides, and does not

### Provides (verified in code)

| Capability | Where |
|---|---|
| Cloud-provider OAuth connectors: Garmin, Oura, Whoop, Polar, Suunto, Strava, Withings, Ultrahuman, SensorBio, Google Health, Fitbit (deprecated) | `README.md:44`, `backend/app/services/providers/` |
| Token storage, polling (`SYNC_INTERVAL_SECONDS`, hourly default) and provider webhooks, historical backfill | `docs/architecture/data-flow.mdx:24-42` |
| Unified PostgreSQL model + one REST API: timeseries, daily summaries, events | `backend/app/api/routes/v1/{timeseries,summaries,events}.py` |
| Resolution control: `raw`, `1min`, `5min`, `15min`, `1hour`, `1day`, `1week`, `1month`, with per-source `stats` and `computed_by` | `docs/architecture/data-types.mdx:351-377` |
| Multi-source reconciliation and provider/device **priority** rules | `timeseries.py` `source_selection=reconcile`; `portal/settings/priorities` |
| Sleep sessions built server-side from raw stage samples, with nap detection, efficiency, interruptions, overnight HRV/RHR/SpO2/RR averages | `docs/providers/apple-health.mdx:93-106`; `schemas/responses/activity/summaries.py:90-131` |
| Workouts with samples, laps, segments, optional GPS route | `docs/architecture/data-types.mdx:239`; iOS CHANGELOG "Workout routes" |
| Meals/nutrition, menstrual cycles, body composition, blood pressure | `docs/architecture/data-types.mdx:334-349` |
| Outgoing webhooks via Svix (off by default), SSE sync-progress stream | `README.md:116`; `docs/api-reference/guides/webhooks.mdx:30` |
| Developer portal (SvelteKit), users CRUD, API keys, SDK "applications" (`app_id`/`app_secret`), data lifecycle/archival, raw payload capture to S3 | `README.md:139-152`; `models/application.py` |
| Apple Health XML import (one-off migration path) | `docs/api-reference/guides/apple-xml-import.mdx` |
| MCP server (beta) for LLM access | `README.md:133-137` |
| OpenAPI 3.1.0 spec, 107 paths, committed | `docs/openapi.json` |

Scale: ~79.8k Python LOC across 528 files, 295 test files, 47 Alembic migrations, ~24k frontend LOC.

### Does not provide

- **Any local read path.** The SDKs read HealthKit/Health Connect and POST to
  `/api/v1/sdk/users/{user_id}/sync` (`sdk_sync.py:28`). No sample ever comes back to the app.
- **A Capacitor or plain-JS bridge.** The RN SDK is an Expo module
  (`ow-rn/src/OpenWearablesModule.ts` → `requireNativeModule` from `expo-modules-core`;
  `package.json` peer-depends on `expo`; ships `expo-module.config.json`).
- **Offline / embedded mode.** No SQLite mode, no WASM build, no "lite" profile. Grepping the docs
  for "offline" returns only the OAuth `offline` scope.
- **Consumer identity.** Single-tenant per deployment (`README.md:170`, `system-overview.mdx:157`),
  developer/admin accounts only. "Users" are records, not accounts.
- **Our scoring model.** See §6.
- **A per-user read credential.** Only the global API key or a write-only SDK JWT
  (`scope="sdk"`, accepted only by `/sdk/*`, `app/utils/auth.py:107-141`).
- **Push to device / delta protocol.** Reads are range queries with cursor pagination.

---

## 2. Architecture and data-flow requirements

### Docker services (`docker-compose.yml`)

| Service | Image | Needed for |
|---|---|---|
| `db` | `postgres:18` | everything (init script also creates the `svix` DB) |
| `app` | built `./backend` (FastAPI, Python **3.14**) | API on :8000 |
| `redis` | `redis:8`, AOF | Celery broker, cache, Svix queue |
| `celery-worker` | same image | SDK upload processing, provider pulls |
| `celery-beat` | same image | scheduled provider sync, sleep-session closing every 5 min |
| `svix-server` | `svix/svix-server:v1.101.0` | outgoing webhooks (:8071) |
| `frontend` | SvelteKit/Bun dev build | portal (:3000) |
| `flower` | same image | Celery monitoring (:5555) |

Minimum for "device uploads + we read back": **app, db, redis, worker, beat** = 5 containers.
Portal and Svix are optional for us; beat is not (it closes sleep sessions).

Runtime floor is aggressive: Python **3.14+** (`backend/pyproject.toml` `requires-python`),
PostgreSQL **18**, Redis **8**. This is Docker-only in practice — no distro packages, no sidecar
you can `pip install` into an existing service.

Startup runs `alembic upgrade head` (47 migrations), a provider-split data migration, provider
settings/priorities/series-type seeds and an admin seed (`backend/scripts/start/app.sh`).

### Auth planes (four, and they do not compose)

1. **Developer/admin** — email+password → Bearer JWT. Portal only.
2. **API key** — `X-Open-Wearables-API-Key`, global, SHA-256 at rest (`models/api_key.py`).
   Grants full read **and** `POST /users` (`routes/v1/users.py:63`). Server-side only.
3. **SDK user token** — `POST /api/v1/users/{user_id}/token` with `app_id`+`app_secret`
   (or admin Bearer) → 60-min JWT, `scope="sdk"`, plus refresh token (`sdk_token.py:15-71`).
   Write-only, and 403 if the path `user_id` differs from the token subject (`sdk_sync.py:73`).
4. **Invitation code** — `POST /users/{user_id}/invitation-code` → public redeem. Docs:
   *"a niche mechanism, not a co-equal second option … aimed primarily at individual users
   self-hosting Open Wearables for their own data … not at multi-user production integrations"*
   (`docs/sdk/index.mdx:80`).

Consequence: creating a user needs the global API key; minting a device token needs
`app_id`/`app_secret`. Both must live on a server we operate. **OW does not remove the need for a
backend — it *is* one more backend.**

### Webhooks / background sync

Outgoing webhooks need a **publicly reachable HTTPS endpoint** (`webhooks.mdx:30`) and are off by
default. For a local-first app they are irrelevant; we would pull.

Background sync is entirely **device-side** in OW's design (BGTaskScheduler / HealthKit background
delivery on iOS, WorkManager + foreground service on Android, `docs/sdk/integration.mdx:147-152`).
If we do not use their SDK, we write that engine ourselves. See §6.

---

## 3. Can the mobile SDKs be used from a Capacitor 7 app?

**No.** Three independent blockers:

1. **No bridge.** Capacitor only invokes plugins registered through its own contracts —
   iOS `CAPBridgedPlugin` with `identifier` / `jsName` / `pluginMethods`
   (`node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgedPlugin.h:16-20`) and Android
   `@CapacitorPlugin(name=…)` + `@PluginMethod`
   (`node_modules/@capacitor/android/.../annotation/CapacitorPlugin.java`).
   The OW RN SDK is an Expo module (`requireNativeModule`), which needs the Expo Modules runtime
   inside the native app. There is no supported way to call an Expo module from a Capacitor bridge.
2. **Wrong shape.** Even fully bridged, `startBackgroundSync()` uploads to a server and returns
   nothing. Our scorer needs samples.
3. **Version lockstep + platform floors.** iOS CHANGELOG repeatedly states
   *"Requires Open Wearables 0.11.0 or later"* and warns that mis-stored data *"is not corrected by a
   later backend upgrade."* Android forces `minSdk 29` (ours is 23), `compileSdk 36` (ours 35),
   Kotlin 2.1.0, and bundles the **proprietary** Samsung Health Data SDK AAR
   (`ow-android/sdk/build.gradle.kts`, `sdk/libs/maven/com/samsung/android/health/data/1.0.0/`).

### What a custom Capacitor plugin must wrap (Option A)

**iOS** (`ios/App/App/Plugins/BeneHealthPlugin.swift`, `@objc`, `CAPPlugin & CAPBridgedPlugin`):

- `requestAuthorization(types)` → `HKHealthStore.requestAuthorization(toShare:read:)`
- `readSamples({type, start, end})` → `HKAnchoredObjectQuery` (incremental) per type
- `readDailyStats({types, start, end})` → `HKStatisticsCollectionQuery` (`.cumulativeSum`)
- `readSleep({start, end})` → `HKCategoryTypeIdentifierSleepAnalysis` samples → stage blocks
- `readWorkouts({start, end})` → `HKWorkout` + `HKWorkoutRoute` (optional) + per-workout HR samples
- `enableBackgroundDelivery()` → `HKObserverQuery` + `BGTaskScheduler` (phase 3, optional)

Type mapping to our contract (`src/domain/types.ts`):

| HealthKit identifier | Our field |
|---|---|
| `SleepAnalysis` (asleepCore/Deep/REM/awake/inBed) | `SleepSession.stages[]` (`core` ← `asleepCore`), `start`, `end` |
| `HeartRateVariabilitySDNN` | `SleepSession.hrvMs` (avg inside sleep window), `DayMetrics.daytimeHrvMs` |
| `RestingHeartRate` | `SleepSession.rhrBpm` |
| `HeartRate` | `DayMetrics.hrSamples[]` (5–10 min buckets), `SleepSession.minHrBpm` |
| `OxygenSaturation` | `SleepSession.spo2` |
| `RespiratoryRate` | `SleepSession.respiratoryRate` |
| `AppleSleepingWristTemperature` (iOS 16+) | `SleepSession.wristTempC`, `DayMetrics.tempDeviationC` |
| `StepCount`, `ActiveEnergyBurned`, `BasalEnergyBurned`, `AppleExerciseTime` | `DayMetrics.steps/activeCalories/totalCalories/exerciseMinutes` |
| `TimeInDaylight` (iOS 17+) | `DayMetrics.daylightMinutes` |
| `HKWorkout` + HR samples | `Workout` (+ `zoneMinutes` computed locally) |
| `Dietary*` | `MealEntry` (`source: 'imported'`) |

Requires: HealthKit entitlement, `NSHealthShareUsageDescription` in `ios/App/App/Info.plist`
(absent today), and **Podfile `platform :ios, '16.0'`** — four-stage sleep needs iOS 16; today it is
`14.0` (`ios/App/Podfile`), which would only yield `inBed`/`asleep`.

**Android** (`@CapacitorPlugin(name = "BeneHealth")`, `@PluginMethod`):
`androidx.health.connect:connect-client:1.1.0`, `HealthConnectClient.getOrCreate`,
`PermissionController.createRequestPermissionResultContract()`, then `readRecords` /
`aggregate` for `SleepSessionRecord`, `HeartRateRecord`, `HeartRateVariabilityRmssdRecord`,
`RestingHeartRateRecord`, `StepsRecord`, `ActiveCaloriesBurnedRecord`,
`TotalCaloriesBurnedRecord`, `ExerciseSessionRecord`, `OxygenSaturationRecord`,
`RespiratoryRateRecord`, `BodyTemperatureRecord`, `NutritionRecord`.
Requires `minSdkVersion 26` (raise from 23 in `android/variables.gradle`), `READ_*` permissions plus
`READ_HEALTH_DATA_IN_BACKGROUND`, the two `activity-alias` rationale entries in
`android/app/src/main/AndroidManifest.xml` (currently only `INTERNET`), and a Play Console
**Health apps declaration** + privacy policy.

**TS side:** `registerPlugin<BeneHealthPlugin>('BeneHealth')`, a mapper module, idempotent upsert
into the Zustand store keyed on source sample IDs, `imported: true` provenance, and a settings
toggle. `src/domain/types.ts` does not change — the contract already anticipates this.

---

## 4. Can any part run fully on-device?

**No — a server is mandatory.** The backend is FastAPI + PostgreSQL 18 + Redis 8 + Celery. There is
no embedded build, no SQLite mode, no serverless/edge target.

What *is* usable on-device from OW, at zero runtime cost:

- The **data model as a spec**: `SeriesType` enum, unit conventions, sleep-stage vocabulary
  (`in_bed/awake/sleeping/light/deep/rem`, `backend/app/constants/sleep.py`), workout type list.
- The **payload schema** (`provider`, `sdkVersion`, `syncTimestamp`, `data.{records,sleep,workouts}`)
  as a normalisation target if we ever add optional sync.
- The **hard-won field notes**: server-side sleep sessionisation with a 15-minute Apple Watch quiet
  window because the watch uploads a whole night at once; HealthKit "condensed workout samples" that
  double-count if not dropped; percent-vs-fraction scaling bugs (SpO2 97 vs body fat 0.304);
  Health Connect change tokens expiring after 30 days; Samsung watch step aggregates for the last
  48 h being re-read because hours are not frozen. This is the best part of the project for us, and
  it is MIT.

---

## 5. Integration options

### A — Direct native adapters only (custom Capacitor plugin)

*What it replaces:* nothing; it adds the missing data source. Scoring, storage, backup and UI are
untouched.

- **Effort:** ~5–8 weeks for one engineer; ~3–4 weeks with iOS and Android in parallel.
  iOS 2–3 wks, Android 2–3 wks, shared TS mapping/import/settings 1 wk, background refresh +1 wk.
  Play Console health review adds 1–2 weeks of calendar time, not engineering.
- **Ops:** zero. No server, no accounts, no TLS, no backups beyond the existing file.
- **Coverage:** Apple Health is already the iOS aggregator — Oura, Whoop, Garmin, Ultrahuman,
  Polar, Withings, Eight Sleep and Dexcom all write into it (OW's own bridge table,
  `docs/providers/apple-health.mdx:128-246`), with reduced scope. Health Connect covers
  Samsung/Pixel/Fitbit/Garmin on Android.
- **Risk:** two native codebases to maintain; background delivery is best-effort; HealthKit cannot
  be exercised in the Simulator; App Review scrutinises health data.
- **Promise:** fully intact — offline, no account, no network call.

### B1 — Local-first + optional **read-only** connector to a self-hosted OW

*What it replaces:* nothing in the app; it gives iOS/Android access to cloud-provider depth that
HealthKit/Health Connect truncate (e.g. Oura's full HRV, Whoop recovery, Garmin training load).

- Flow: user runs OW themselves (Docker, `make init && docker compose up -d`), creates a user record,
  and pastes **host + their own API key** into our settings. We pull
  `GET /users/{id}/summaries/{activity,sleep,recovery}`, `GET /users/{id}/events/sleep?include=stages`,
  `GET /users/{id}/timeseries?types=…&resolution=1day`, map into `DayRecord`.
- **It works precisely because it is single-user:** the global API key is acceptable only when the
  key holder *is* the data subject. This is not a multi-user design and must never be presented as one.
- **Effort:** 1–2 weeks after A (client generated from `docs/openapi.json`, secure credential storage,
  mapper, conflict policy vs native sources, a "data leaves this device" consent screen), plus ~2 days
  of self-hosting docs.
- **Ops:** borne by the user, not us. That is the point.
- **Promise:** intact by default; OW is opt-in, off, and explicitly labelled.

### B2 — B1 plus upload (two-way)

Adds pushing phone data into OW so a portal/MCP/clinician can see it. Requires a **token broker** we
host (holds `app_id`/`app_secret`, creates OW users via the global key, mints 60-min SDK tokens), or
the invitation-code flow the docs call niche. **+3–5 weeks** and permanent ops. Only justified by a
coach/clinician feature.

### C — Make OW the backend/data layer

*What it replaces:* a hypothetical future sync backend (auth, storage, dedup, webhooks). Not the
native adapters — we still need data on-device to score, so we would write the same HealthKit/Health
Connect reads *plus* a broker.

- **Effort:** 8–12 weeks. Broker 3–5 wks; Capacitor bridge around their upload-only SDKs 1–2
  wks/platform; a sync-down engine (their API has no device delta protocol) 2–3 wks.
- **Ops:** permanent — 5–6 containers, PG18/Redis8 upgrades, 47 migrations, TLS, backups, monitoring,
  SDK↔server version lockstep, security patching.
- **Cost:** licence $0 (MIT). Infra bill is ours (a small VM is the realistic floor; OW publishes no
  sizing guidance — unknown). Pro is **from $999/month per deployment** for health scores, health
  agent, medical-grade integrations and observability; Enterprise custom; unbranded Connect App
  $5,000/platform (openwearables.io/pricing).
- **Promise:** broken on every axis — accounts, server, network dependency, health data off-device,
  and a community deployment that is single-tenant by design.

### Side-by-side

| | A | B1 | B2 | C |
|---|---|---|---|---|
| HealthKit / Health Connect data | ✅ | ✅ | ✅ | ✅ (via upload+download) |
| Cloud wearables (Oura/Whoop/Garmin native APIs) | ❌ (HealthKit relay only) | ✅ | ✅ | ✅ |
| Works offline | ✅ | ✅ (OW off) | ⚠️ | ❌ |
| No account | ✅ | ✅ (user's own instance) | ❌ | ❌ |
| New servers we operate | 0 | 0 | 1 broker | 5–6 containers |
| Engineering | 5–8 wks | +1–2 wks | +3–5 wks | 8–12 wks |
| Ongoing ops | none | none | high | high |
| Recurring cost | $0 | $0 (user pays their VPS) | $ + on-call | $ + on-call (+$999/mo for Pro) |

---

## 6. Effort, burden, privacy, and the offline promise

### What OW would *not* replace — our scoring layer

`src/domain/scoring/{sleep,recovery,strain,load,nutrition,zones,biology}.ts` needs inputs OW does not
produce: a 6-band `zoneMinutes` tuple, `strain`, `wearMinutes`, `stressSamples` (daytime HRV
pipeline), `tempDeviationC` against a personal baseline, `daylightMinutes`, and nutrition
sub-scores (veg grams, fruit cups, whole-grain servings, healthy-oil %, nuts, omega-3, red/processed
meat, sodium, added sugar). OW's `SleepSummary` gives `avg_hrv_sdnn_ms`, `avg_hrv_rmssd_ms`,
`avg_spo2_percent`, `avg_respiratory_rate`, `stages`, `efficiency_percent`, `interruptions_count` —
useful, but no temperature and no min-HR.

OW's own scores are **deprecated in the open-source core**: *"Scores computed by Open Wearables
(`provider: internal`) are deprecated: no new ones are computed starting November 6, 2026"*
(`backend/app/api/routes/v1/health_scores.py:33-35`). Health scores are a paid Pro module. So OW
cannot replace our scoring even in principle.

The reverse risk is real too: adopting OW's sleep-score semantics would fork our documented
`docs/SCORING.md` contract and make iOS/Android/web disagree — exactly what `docs/HEALTH_SOURCES.md:74`
forbids.

### Latency — the deal-breaker for a morning-readiness app

OW builds sleep sessions **server-side**, closing an Apple Watch night 15 minutes after the last
upload and *"usually available 15 to 20 minutes after it reaches Open Wearables, which can be hours
after waking up"* (`docs/providers/apple-health.mdx:95-106`). Our home screen is a morning readiness
score. Routing sleep through a server sessioniser inserts an unbounded delay into the core loop.
Reading HealthKit directly gives us the night as soon as the watch syncs to the phone.

### Privacy / regulatory

- **GDPR:** health data is Art. 9 special category. A server makes us controller (or processor for
  B2), requiring a lawful basis (explicit consent), a DPIA, retention limits, DSAR/erasure and breach
  process. OW helps with configurable archival/retention and raw-payload capture **off by default**
  (`README.md:149-152`) but I found no verified self-service export/erasure workflow — **unknown**.
- **HIPAA:** not applicable to a consumer wellness app; OW Enterprise offers a BAA if we ever do
  clinician features.
- **Apple:** Guideline 5.1.3 — HealthKit data may not be used for advertising, may not be written to
  iCloud, and access may not be a condition of use. Uploading it to a user-supplied server is
  permissible with disclosure and consent, but it is review surface we do not need.
- **Google Play:** Health Connect requires the Health apps declaration, a privacy policy, a separate
  justification for `READ_HEALTH_DATA_IN_BACKGROUND`, and consent for third-party sharing.
- **Samsung Health:** production use needs Samsung partner approval; the bundled Data SDK AAR is
  proprietary with no licence file in the repo — legal review required if we ship that path.
- **Telemetry:** the OW backend sends an anonymous daily ping by default; a self-hoster must set
  `TELEMETRY_ENABLED=false` (or `DO_NOT_TRACK=1`) to honour our "no telemetry" claim
  (`README.md:176-181`). Worth putting in the B1 setup guide.

### Conflicts with "fully offline, no account"

Our README promises: *"No accounts, no telemetry, no network calls"* (`README.md:21`) and
*"There is no server, so a backup file **is** your account"* (`README.md:98`).

| Promise | A | B1 | B2 | C |
|---|---|---|---|---|
| No accounts | kept | kept (user's own OW instance, no signup with us) | broken | broken |
| No network calls | kept (native reads are local) | opt-in only | broken | broken |
| All state on-device | kept | kept (cache + provenance) | broken | broken |
| Backup file is the account | kept | kept | broken | broken |

Only A and B1 are compatible with the project's stated identity. B1 stays honest **if and only if**
it is off by default, requires an explicit "this sends your health data to <host>" confirmation, and
never gates any feature behind it.

---

## 7. Recommended phased plan

**Phase 0 — mine OW, write nothing (1–2 days).** Read
`docs/providers/apple-health.mdx:93-116` (sessionisation, condensed samples) and the iOS/Android
CHANGELOGs; encode their failure modes as test cases in our own mapper. Adopt their `SeriesType`
naming for provenance strings so a future B1 mapper is trivial.

**Phase 1 — iOS HealthKit plugin (2–3 weeks).** Foreground sync only. Authorization, sleep stages,
overnight HRV/RHR/SpO2/RR/temp, day metrics, workouts. Raise `ios/App/Podfile` to 16.0, add the
HealthKit entitlement and `NSHealthShareUsageDescription`. Import into `DayRecord` with `imported`
provenance and idempotent upserts; gate the demo seed so real and synthetic data never mix
(`docs/HEALTH_SOURCES.md:70-74`).

**Phase 2 — Android Health Connect plugin (2–3 weeks, parallel).** Same TS contract. `minSdk 26`,
manifest permissions + rationale aliases, Play health declaration started on day 1 (calendar risk).
Skip Samsung Health: proprietary SDK, partner approval, `minSdk 29` — not worth it while Health
Connect covers Samsung devices.

**Phase 3 — background refresh (1 week, optional).** iOS `HKObserverQuery` + `BGTaskScheduler`;
Android `WorkManager`. Keep it opt-in and accept that the OS decides when it runs.

**Phase 4 — optional read-only OW connector, B1 (1–2 weeks).** Settings → "Connect Open Wearables
(self-hosted)": host + API key in secure storage, pull summaries/events/timeseries, map into
`DayRecord`, show source per metric. Document the 5-container self-host. Never required, never
default, explicit consent screen.

**Phase 5 — only on demonstrated demand (B2/C).** A separate `bevel-connector` service holding
`app_id`/`app_secret`, creating OW users, minting SDK tokens. Never in the app repo, never a
prerequisite.

### Concrete touchpoints

| Layer | File | Change |
|---|---|---|
| iOS | `ios/App/Podfile` | `platform :ios, '16.0'` |
| iOS | `ios/App/App/Info.plist` | `NSHealthShareUsageDescription`, `UIBackgroundModes`, `BGTaskSchedulerPermittedIdentifiers` |
| iOS | `ios/App/App/*.entitlements` | `com.apple.developer.healthkit` |
| iOS | new `Plugins/BeneHealthPlugin.swift` | `CAPBridgedPlugin`, `CAPPluginMethod` |
| Android | `android/variables.gradle` | `minSdkVersion = 26` |
| Android | `android/app/src/main/AndroidManifest.xml` | `READ_*`, `READ_HEALTH_DATA_IN_BACKGROUND`, rationale aliases |
| Android | `android/app/build.gradle` | `androidx.health.connect:connect-client:1.1.0` |
| Android | new `…/BeneHealthPlugin.java` | `@CapacitorPlugin`, `@PluginMethod` |
| TS | new `src/domain/health/{types,map,import}.ts` | mapper + idempotent importer |
| TS | `src/store/useAppStore.ts` | `importDayRecords`, `setHealthSource` actions |
| TS | `src/screens/SettingsScreen.tsx` | connect / revoke UI, source badges |
| B1 | generated client from `docs/openapi.json` | `GET /users/{id}/summaries/*`, `/events/sleep`, `/timeseries`, `/events/workouts` |

---

## 8. Unknowns (stated honestly)

- No independent benchmarks for OW at scale; it is 1.0.0 and the SDKs are 0.13–0.16 with documented
  breaking changes and hard server-version coupling.
- OW publishes no infrastructure sizing guidance. A 2–4 vCPU / 4–8 GB VM is the plausible floor for
  the 5-container minimum — **unverified**.
- Whether a Capacitor app that uploads HealthKit data to a user-supplied server survives App Review
  is untested; I would not bet a launch on it.
- Health Connect availability on Android 13 and below depends on the standalone Play app; OEM/region
  coverage should be measured before promising Android parity.
- OW has no per-user *read* token. B1 is therefore single-user by construction, and a multi-user
  read path would require an upstream feature or a broker. Verified in `app/utils/auth.py`, not
  documented as a limitation by OW.
- I did not verify OW's GDPR export/erasure completeness, nor audit its crypto for provider-token
  storage (`cryptography` + `SECRET_KEY`, details unread).
