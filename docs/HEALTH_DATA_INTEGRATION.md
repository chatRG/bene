# Connecting wearable / health data to Bene (Capacitor 7, local-first)

Research date: 2026-11-14. Scope: research only, no app changes. Local clones inspected:
`/opt/data/cache/scratch/{open-wearables,ow-ios,ow-android,ow-flutter,ow-rn,healthchain}`.
App inspected at `/opt/data/bene` (package `bene`, Capacitor **7.6.10**, iOS target 14.0, Android
minSdk 23 / compileSdk 35 / AGP 8.7.2).

---

## 1. Bottom line

**Build a `HealthDataSource` abstraction, ship the zero-server Apple Health XML import first, then
add on-device HealthKit + Health Connect through one Capacitor plugin. Treat Open Wearables (or a
commercial aggregator) as an optional cloud connector for the wearables that never write to the
phone's health store — not as the core.**

Three conclusions drive this:

1. **Neither Open Wearables SDK runs inside a Capacitor app.** The Flutter SDK is Dart; the React
   Native SDK is an Expo Module (`requireNativeModule` from `expo-modules-core`, peer deps
   `expo`/`react-native`). Capacitor's bridge is a different runtime. The reusable assets are the
   **native** iOS/Android SDKs underneath, which would need a new Capacitor plugin wrapper.
2. **Open Wearables is a server product, not a library.** FastAPI + Postgres + Redis + Celery
   worker/beat + portal, one organization per deployment, plus a token-mint endpoint you must build.
   It contradicts "no accounts, no server" unless it is strictly opt-in. It is, however, the cheapest
   way to get Garmin/Oura/Whoop/Polar/Suunto/Withings/Ultrahuman without writing those OAuth
   integrations.
3. **Most wearables already land in Apple Health / Health Connect.** HealthKit alone covers Apple
   Watch plus (via companion apps) Oura, Whoop, Garmin, Polar, Suunto, Withings, Eight Sleep, CGM,
   smart scales and more — with caveats on data breadth. That makes the platform health store the
   highest-leverage integration and the natural first native step.

---

## 2. What the app actually needs

From `src/domain/types.ts` and `src/domain/scoring/recovery.ts`:

| App field | Where used | Mapping difficulty |
|---|---|---|
| `SleepSession.stages[]` (`awake/rem/core/deep`) | sleep + recovery scores | HealthKit has **no sleep-session object** — only category samples; session/night assembly is hand-written (OW does it server-side) |
| `hrvMs` (overnight SDNN), `rhrBpm`, `respiratoryRate`, `spo2`, `wristTempC`, `minHrBpm` | recovery score (`recovery.ts:28-33,143-147`) | direct quantity types, but "overnight" aggregation/window is yours |
| `Workout` (`kind`, `avgHr`, `maxHr`, `calories`, `strain`, `zoneMinutes[6]`) | strain score | workout object is easy; **avg/max HR and zone minutes require extra statistics queries**; `strain` must be computed locally |
| `DayMetrics` (`steps`, `activeCalories`, `exerciseMinutes`, `daylightMinutes`, `hydrationMl`, `caffeineMg`, `hrSamples[]`, `stressSamples[]`, `wearMinutes`) | home/fitness/biology | daily aggregates; daylight (`appleTimeInDaylight`) and caffeine are not in the OW SDK type list |
| `source: string`, `imported: boolean` on sleep/workout | provenance UI | already exists — good hook |
| `Biomarker[]`, `HealthRecord[]` | Biology / Records screens | clinical labs, not wearables (see HealthChain) |

Also relevant: the store is Zustand `persist` on **localStorage** (`src/store/useAppStore.ts`), and
backups are a single JSON with `BACKUP_VERSION = 1` (`src/domain/backup.ts:4`). A year of 1-minute
HR samples is ~525k points — the connector must keep the same granularity the app already uses and
prune, or the store must move to IndexedDB.

---

## 3. Option findings

### 3.1 Direct Apple HealthKit + Android Health Connect

**What it is:** read the OS health store on-device. No accounts, no cloud, no per-provider code.
HealthKit and Health Connect are the aggregation layer that OW and every commercial aggregator also
use for "on-device" sources. Two caveats shape expectations: on iOS this is the **only** way to get
Apple Watch data, and acting as a bridge is **lossy** — a device often writes a narrower metric set
into HealthKit than its own API exposes (OW's own docs warn about this). Health Connect's
third-party coverage is narrower still, since apps must opt in to writing.

**Off-the-shelf Capacitor plugins (checked Nov 2026):**

| Plugin | Capacitor | License | Coverage | Notes |
|---|---|---|---|---|
| `@capgo/capacitor-health` **8.13.0** | 8.x only | MPL-2.0 | 30 types incl. `sleep` (with stages), `heartRateVariability`, `restingHeartRate`, `respiratoryRate`, `oxygenSaturation`, `appleSleepingWristTemperature`, `workouts`, `queryAggregated` | best breadth; **no background sync**; `readSamples` default limit 100 → paginate |
| `@capgo/capacitor-health` **7.0.0** | 7.x ("on demand") | MIT | **only** steps, distance, calories, heartRate, weight | exists for Cap 7 but unusable for sleep/HRV/workouts |
| `@capacitor/health-fitness` 1.0.2 | ≥8.0.0 | MIT | HealthKit + Health Connect, background job, `READ_HEALTH_DATA_HISTORY`, workouts **iOS only** | now documented on capacitorjs.com; API is JSON-encoded strings (awkward); iOS entitlements incl. `healthkit.background-delivery` |
| `@capawesome-team/capacitor-health` 0.x | ≥8 | paid Capawesome Insiders | ~20 types, aggregation-first, writes | no background sync documented; strong permission model |

So on **Capacitor 7 today** the maintained plugin lines do not give you sleep stages: Capgo's v7
branch exposes five metrics, and the current Capgo/Capawesome/health-fitness releases all require
Capacitor 8. The realistic choices are (a) upgrade to Capacitor 8 and use Capgo/Capawesome/
health-fitness, or (b) write a small plugin (~400–700 LOC per platform) against HealthKit/Health
Connect directly.

**Platform constraints:**
- Android `minSdk` must rise **23 → 26** for Health Connect; iOS target 14 is fine for HealthKit
  basics but some types need iOS 16/17.
- Health Connect reads are limited to **30 days before the permission was first granted** unless
  `READ_HEALTH_DATA_HISTORY` is declared and justified (`developer.android.com` aggregate/read docs).
- Play Console "Health apps" declaration + privacy policy + per-type permissions; background reads
  need `READ_HEALTH_DATA_IN_BACKGROUND` and a foreground service type `health`.
- HealthKit does not run in the iOS Simulator; device testing required.
- Apple review: HealthKit capability, `NSHealthShareUsageDescription`, and Guideline 5.1.3 — no
  advertising/marketing use, no sale, no iCloud storage of HealthKit data.

**Effort (estimate):** Cap 8 upgrade + plugin wiring + mapping = **5–10 dev-days**; a hand-written
plugin instead = **8–12 dev-days** plus ongoing OS-version maintenance. No server, no vendor cost.

**Verdict:** the correct native baseline. Start here after the import path.

---

### 3.2 Open Wearables (self-hosted) + its mobile SDKs

**What it is (verified in repo):** MIT-licensed, self-hosted wearable data layer. Docker Compose
runs `app` (FastAPI, Python 3.14+), `db` (Postgres 18), `redis` 8, `celery-worker`,
`celery-beat`, `flower`, `frontend` (SvelteKit portal), optional `svix-server` and S3. One
organization per deployment (multi-tenancy is an Enterprise feature). See
`docs/architecture/system-overview.mdx`, `docker-compose.yml`, `openwearables.io/pricing`.

**Providers:** cloud OAuth — Garmin, Oura, Whoop, Polar, Suunto, Strava, Withings, Ultrahuman,
SensorBio, Google Health, Fitbit (legacy, deprecated); on-device — Apple Health, Health Connect,
Samsung Health; plus Apple Health XML import (`README.md`, `docs/providers/coverage.mdx`).

**Data:** daily summaries, sleep sessions with stages, workouts with samples/laps/routes/PRs,
timeseries (HR, HRV, SpO2, weight, steps, energy…), nutrition, women's health, provider metrics.
Unified model: `EventRecord` (sleep/workout details) + `SeriesSample` + descriptors
(`docs/architecture/unified-data-model.mdx`).

**Does the Flutter/RN SDK work from Capacitor? No.**
- Flutter: a Dart plugin using MethodChannel; no Dart runtime in a Capacitor WebView
  (`ow-flutter/lib/open_wearables_health_sdk_method_channel.dart`).
- React Native: Expo Module API — `import { NativeModule, requireNativeModule } from
  "expo-modules-core"` (`ow-rn/src/OpenWearablesModule.ts:1`), `expo-module.config.json`, peer
  deps `expo`/`react-native`/`react` (`ow-rn/package.json`). Not loadable by Capacitor.
- **What is needed:** a Capacitor plugin that wraps the *native* SDKs — Swift
  `OpenWearablesHealthSDK` (SPM/CocoaPods, 0.16.0, iOS 15+) and Kotlin
  `com.github.the-momentum.open_wearables_android_sdk:sdk:v0.13.1` via JitPack (as the Flutter
  plugin does), exposing `configure / signIn / requestAuthorization / startBackgroundSync /
  stopBackgroundSync / getSyncStatus` + auth-error events. ~300–500 LOC per platform plus TS defs.

**Android build burden (real):** OW SDK requires `compileSdk 36`, `minSdk 29`, Kotlin 2.1.0,
Java 17, AGP 8.9+ (`ow-android/README.md`, `sdk/build.gradle.kts`, `ow-flutter/android/build.gradle`).
The app is on compileSdk 35 / minSdk 23 / AGP 8.7.2. Distribution is also awkward: the Android
README tells you to clone and `publishReleasePublicationToMavenLocal`, while the Flutter plugin
consumes `com.github.the-momentum.open_wearables_android_sdk:sdk:v0.13.1` from JitPack — there is no
Maven Central artifact. It also bundles the Samsung Health AAR (524 KB) and pulls OkHttp,
WorkManager, security-crypto, kotlinx-serialization.

**Auth model:** your backend holds `app_id`/`app_secret`, calls
`POST /api/v1/users/{user_id}/token` → access token (60 min) + refresh token, forwards both to the
app; SDK stores them in Keychain / EncryptedSharedPreferences and auto-refreshes on 401. On refresh
failure it emits an auth error; the app fetches new tokens and calls `updateTokens()` — **not**
`signIn()` again, which clears sync state. API-key mode exists but is explicitly "internal tools"
only (`docs/sdk/integration.mdx`).

**Upload semantics:** `POST /api/v1/sdk/users/{user_id}/sync` → **202 Accepted**, body persisted then
processed asynchronously by Celery (`backend/app/api/routes/v1/sdk_sync.py`). Payload is
`{provider, sdkVersion, syncTimestamp, data:{records, sleep, workouts}}`
(`backend/app/schemas/providers/mobile_sdk/sync_request.py`). Anchored incremental queries; a
historical backfill on first sync controlled by `syncDaysBack`; **no client-side dedupe — the backend
deduplicates/upserts** (`ow-rn/README.md`); widening the backfill requires `resetAnchors()` while
sync is stopped.

**Background sync:** iOS HealthKit observer queries + `BGTaskScheduler` + background URLSession;
Android WorkManager (≥15 min) + foreground service with `foregroundServiceType="health"` and a visible
notification (Play requirement). The OS decides actual timing; an Apple Watch night typically lands
15–20 min after it reaches OW, which can be hours after waking (`docs/providers/apple-health.mdx`).

**Backend ops:** 6–8 containers, Postgres/Redis persistence, Celery tuning, S3 for payload offload
(recommended for large backfills), Svix for outgoing webhooks, upgrades pinned to release tags.
Telemetry is **on by default** (anonymous daily ping; disable with `TELEMETRY_ENABLED=false` or
`DO_NOT_TRACK=1`) — incompatible with a "no telemetry" product unless turned off.

**Cost/licensing:** Core self-hosted **$0, MIT**; Pro **from $999/mo per deployment**; Enterprise
custom with SLA, SSO, multi-region, **DPA and BAA** (`openwearables.io/pricing`).

**Architecture mismatch:** the app has no accounts. OW requires an OW `user_id` per person and a
server-side API key to read data back. A local-only app would have to (a) generate a device-local
pseudo-user, (b) run a backend just to mint tokens and proxy reads, or (c) accept that cloud
wearables require an account. There is no on-device OW runtime.

**Effort (estimate):** 3–5 days deploy + 5–10 days token service/user mapping + 10–15 days Capacitor
wrapper + 5–10 days API→`DayRecord` mapping + ongoing ops. **4–8 weeks** end to end for one dev.

---

### 3.3 HealthChain

**What it actually is:** Apache-2.0 **Python** library/server for **clinical FHIR**: a `FHIRGateway`
that unifies Epic/Cerner/Medplum and other FHIR R4 servers, typed FHIR build/validate helpers, CDS
Hooks/CDA/MCP/LangChain delivery (`healthchain/README.md`, `healthchain/fhir/r4b.py`,
`healthchain/gateway`). It is **not** a consumer wearable aggregator: no HealthKit, no Health
Connect, no Oura/Garmin/Whoop, no mobile SDK, no React/Capacitor surface.

**Could it help "Health Records/labs"?** Only in a future server-side phase:
- Apple Health's own clinical records are **FHIR JSON** (the export zip can contain a
  `clinical-records/` folder when the user has provider records set up), so labs can be ingested
  without HealthChain by parsing FHIR locally.
- HealthChain would add value if Bene later runs a backend that talks to EHRs via SMART on FHIR /
  backend services, needs validated `Observation`/`DiagnosticReport` normalization, or exposes an
  MCP/agent surface. That requires EHR app registration, patient/consent flows, HIPAA-grade ops, and
  is US-centric. Not a wearable path.

**Verdict:** do not use it for wearable data. Park it as an optional "clinical labs" connector, and
only if a server exists.

---

### 3.4 Commercial aggregators

All are hosted APIs: the vendor holds provider OAuth apps, normalizes data, and delivers it to
**your backend** via webhook/API. None offer a local-only mode. All charge per connected user or
credit and all add a sub-processor. Their mobile SDKs are native/React Native/Flutter — never
Capacitor — so **on-device Apple Health/Health Connect still needs a Capacitor wrapper**; their
web "Link" widgets can handle cloud-provider OAuth inside a Capacitor in-app browser.

Public list prices below are from vendor pages / a third-party compilation checked **Oct 2026**;
treat as **public but unverified at contract time**.

| Vendor | Sources claimed | Mobile SDKs | Entry public price | Compliance posture | Notes |
|---|---|---|---|---|---|
| **Terra** | 500+ wearables/sources | iOS, Android, React Native, Flutter | **$399/mo billed annually, $499 monthly**; 100k credits ≈ 500 active auths | HIPAA/GDPR/SOC 2 claims; EU default residency, optional US cluster; DPA published | Broadest fitness coverage; credits per auth + event |
| **Junction** (ex-Vital) | 300+ devices | iOS, Android, Flutter, RN Core SDK + Link widget | **$300/mo**, 1–500 connected users | HIPAA + **BAA on Enterprise**, SOC 2 Type 2, ISO 27001 | Cheapest entry; lab testing upsell; BAA not on Launch |
| **ROOK** | 500+ devices | iOS, Android, Flutter, RN | **$399/mo** up to 750 active users | HIPAA-aligned, BAA available, GDPR DPA; FHIR R4 for labs | Health scores/signals add-ons |
| **Spike** | 40+ providers / 500+ devices | iOS, Android, RN, Flutter | **from $450/mo** | "full GDPR, HIPAA, CCPA compliance" claim | Also CGM/medical IoT and nutrition-photo API |
| **Validic** (acquired by **ChartSpan**, June 2026) | RPM devices + wearables | native iOS, Android | **Inform developer tier free**; commercial pricing unpublished | HIPAA/RPM-focused | Enterprise sales; post-acquisition roadmap risk |
| **Thryve** | 500+ trackers | native/RN | **€499/mo** up to 500 users | EU-hosted, GDPR | Best fit if EU residency is the driver |
| **Human API** (now LexisNexis) | consumer-permissioned health network | — | no public pricing | enterprise/clinical | Not a fit for a consumer app |
| **Sahha** | 165 integrations | — | $299/mo annual (1k users) | — | Scores-first, narrower coverage |

**Capacitor effort:** client integration is real work — native SDK wrapper (if using on-device
sources) or in-app browser for Link, plus a backend webhook receiver, user mapping, consent and
disconnect. **5–10 dev-days** after contract, plus DPA/security review.

**When it wins:** you need Garmin/Oura/Whoop users who do **not** write to Apple Health/Health
Connect, you have no ops appetite, and $300–500/mo is cheaper than your engineering time.

---

### 3.5 Zero-server imports

**Apple Health XML export — viable, and the best Phase 0.**
iPhone Health → profile picture → **Export All Health Data** → `export.zip`
(`support.apple.com` "Share health and fitness data in Health on iPhone"; widely documented).
Contents: `apple_health_export/export.xml` (all samples/workouts), `export_cda.xml`,
`workout-routes/*.gpx`, and `clinical-records/` when Health Records is set up. Size: hundreds of MB
to >1 GB uncompressed; there is **no official import back into Health**, but third-party apps can
read it.
- Pros: no native code, no server, works on iOS **and** Android (user can transfer the zip), full
  history in one shot, includes HRV/RHR/respiratory/SpO2/wrist-temp/sleep stages/workouts.
- Cons: manual, one-time, no incremental sync, huge files → needs streaming unzip + SAX parsing
  (not `Filesystem.readFile` into a JS string), plus night assembly and dedupe against live data.
- Effort: **5–8 dev-days** (fflate streaming + sax in a worker; map ~40–60 HK identifiers).

**Android Health Connect export — not a practical import.** Settings → Health Connect → Manage data →
Backup and restore → Scheduled export writes `Health Connect.zip`, but it exists **for Health Connect
restore only**; Google documents no third-party format, and "export and import of health records
isn't supported" (`support.google.com/android/answer/15323271`). Don't build a parser on it.

**Google Health / Takeout — limited.** Google Health (formerly Fitbit) can be exported via Takeout
with activity, exercise, sleep and heart rate (`support.google.com/googlehealth/answer/14236615`).
Covers only data in the Google Health account — not Samsung Health, Oura, or other Health Connect
writers. Google Fit APIs are deprecated and supported only until **end of 2026**; do not build on
them (`developers.google.com/fit/android`).

---

## 4. Decision matrix

### 4.1 Architectures

| Criterion | HealthKit direct | Health Connect direct | Open Wearables self-hosted + wrapper | HealthChain | Apple XML import | Google Health/Takeout |
|---|---|---|---|---|---|---|
| **Providers covered** | Apple Watch + every app that writes HealthKit (Oura, Whoop, Garmin, Polar, Suunto, Withings, Eight Sleep, CGM, scales…) | Samsung, Fitbit/Google Health, Oura?, Withings, apps writing Health Connect (breadth varies by app) | Garmin, Oura, Whoop, Polar, Suunto, Strava, Withings, Ultrahuman, SensorBio, Google Health + Apple/Health Connect/Samsung on-device; Apple XML | none (EHR FHIR: Epic/Cerner/Medplum) | whatever the user's iPhone recorded | Google Health/Fitbit account only |
| **iOS** | ✅ native | — | ✅ via iOS SDK 0.16.0, iOS 15+ | ❌ (server) | ✅ (file) | ✅ (file) |
| **Android** | — | ✅ API 26+, built-in on 14+ | ✅ via Kotlin SDK, minSdk 29 | ❌ | ✅ (file, if user transfers) | ✅ (file) |
| **Offline / local-only** | ✅ fully on-device | ✅ fully on-device | ❌ uploads to your server | ❌ | ✅ file parsed on-device | ✅ file parsed on-device |
| **Server required** | no | no | **yes** (6–8 containers + token service) | yes (by definition) | no | no |
| **App size / SDK burden** | small (system frameworks; ~1 MB AndroidX) | small | **large**: Swift sources (~4.8k LOC) / AAR + OkHttp + WorkManager + Samsung AAR ≈ +2–4 MB APK (est.) | none | +30–60 KB JS | +20–40 KB JS |
| **Auth model** | OS permission sheet, per-type | OS permission sheet, per-type | app_id/secret server-side → 60-min user tokens; SDK keychain + refresh; API key only for internal | SMART/OAuth client credentials server-side | none (user-supplied file) | Google account export |
| **Background sync** | own BGTask/observer or plugin | own WorkManager/FGS or plugin | SDK handles it (HealthKit observer/BGTask; WorkManager ≥15 min + FGS) | n/a | no (manual) | no (manual) |
| **Incremental** | yes (anchors/statistics) | yes (change tokens) | yes (anchors, server-side dedupe) | n/a | no | no |
| **Effort with Capacitor 7** | **Medium** — no maintained Cap-7 plugin with sleep; upgrade to Cap 8 (~5–10 d) or write plugin (~8–12 d) | **Medium** — same, plus minSdk 26 + Play declaration | **High** — 4–8 weeks incl. plugin, backend, mapping, ops | **N/A** | **Low–Medium** — pure TS, 5–8 d | **Low** — pure TS, 2–4 d |
| **Licensing** | Apple platform terms | Google platform terms | MIT core; Pro $999/mo; Enterprise BAA | Apache-2.0 | user's own data | user's own data |
| **Privacy / regulatory** | best: data never leaves device; 5.1.3 still applies | best: on-device; Play Health declaration | you become controller; DPA/BAA needed; telemetry opt-out | HIPAA-heavy clinical | best; user-initiated | Google export terms |
| **Cost** | $0 | $0 | infra + eng; $0 licence core | infra + eng | $0 | $0 |

Legend: ✅ supported, ❌ not applicable/not supported, "?" = depends on the writing app.

### 4.2 Commercial aggregators (detail)

| Vendor | Coverage | iOS/Android SDK | Local-only | Server | Pricing (public, unverified) | Compliance | Capacitor effort |
|---|---|---|---|---|---|---|---|
| Terra | 500+ | ✅/✅ (+RN/Flutter) | ❌ | yes | $399/mo annual / $499 monthly | HIPAA/GDPR/SOC2 claims; EU default | Medium (native wrapper or Link) |
| Junction | 300+ | ✅/✅ (+RN/Flutter) | ❌ | yes | $300/mo ≤500 users | HIPAA, BAA Enterprise, SOC2, ISO27001 | Medium |
| ROOK | 500+ | ✅/✅ (+RN/Flutter) | ❌ | yes | $399/mo ≤750 users | HIPAA-aligned, BAA, GDPR DPA | Medium |
| Spike | 500+ devices | ✅/✅ (+RN/Flutter) | ❌ | yes | from $450/mo | HIPAA/GDPR/CCPA claims | Medium |
| Validic | RPM + wearables | ✅/✅ | ❌ | yes | free dev tier; enterprise quote | HIPAA/RPM | Medium–High (enterprise) |
| Thryve | 500+ | ✅/✅ | ❌ | yes | €499/mo ≤500 users | EU-hosted, GDPR | Medium |

---

## 5. Recommended architecture

### 5.1 Shape

```
┌────────────────────────────── Capacitor app (local-first) ──────────────────────────────┐
│  UI (Settings → Data sources, provenance badges, sync status)                            │
│                                                                                          │
│  HealthDataSource registry                                                               │
│   ├── AppleHealthExportSource   (zip + streaming XML, pure TS, no native)   ← Phase 0   │
│   ├── HealthKitSource           (Capacitor plugin)                          ← Phase 1   │
│   ├── HealthConnectSource       (same plugin)                               ← Phase 1   │
│   ├── ManualSource              (existing logging)                          ← already    │
│   └── CloudConnectorSource      (Open Wearables / aggregator, optional)     ← Phase 2   │
│                                                                                          │
│  Normalizer → Merger (priority + field-level) → Zustand store (persist)                  │
│  Scores (derive.ts / scoring/*) unchanged                                               │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                   │ optional, opt-in
                                   ▼
                    your connector service (token mint + read proxy)
                                   ▼
                 Open Wearables (self-hosted) ──or── commercial aggregator
```

### 5.2 The abstraction

```ts
// src/domain/health/source.ts
export type SourceId =
  | 'manual' | 'apple-health' | 'health-connect'
  | 'apple-export' | 'open-wearables' | 'aggregator';

export interface SourceCapabilities {
  sleepStages: boolean; hrv: boolean; restingHr: boolean; respiratoryRate: boolean;
  spo2: boolean; wristTemp: boolean; workouts: boolean; workoutRoutes: boolean;
  backgroundSync: boolean;
  /** null = unlimited, 0 = none */
  historyDays: number | null;
}

export interface PullRequest { since: string; until: string; cursor?: string }

export interface PullResult {
  days: NormalizedDay[];          // partial, date-keyed
  nextCursor?: string;
  warnings: { code: string; message: string }[];
}

export interface HealthDataSource {
  id: SourceId;
  label: string;
  capabilities: SourceCapabilities;
  isAvailable(): Promise<{ ok: boolean; reason?: string }>;
  connect(): Promise<{ ok: boolean; denied?: string[] }>;   // permissions / file pick
  pull(req: PullRequest): Promise<PullResult>;
  disconnect(): Promise<void>;                              // revoke + clear cursors
}
```

`NormalizedDay` mirrors `DayRecord` but carries provenance:

```ts
interface NormalizedSleep {
  externalId: string; sourceId: SourceId; sourceName?: string;
  date: string; start: string; end: string;
  stages: { stage: 'awake'|'rem'|'core'|'deep'; startMin: number; endMin: number }[];
  hrvMs?: number|null; rhrBpm?: number|null; respiratoryRate?: number|null;
  spo2?: number|null; wristTempC?: number|null; minHrBpm?: number|null;
}
interface NormalizedWorkout { externalId: string; sourceId: SourceId; /* …Workout fields… */ }
interface NormalizedDay { date: string; sleep?: NormalizedSleep; workouts?: NormalizedWorkout[];
  metrics?: Partial<DayMetrics>; }
```

### 5.3 Merge rules (the part most projects get wrong)

1. **Store source records separately** from the projected `DayRecord` (e.g. `healthSync.sources[sourceId].days[date]`).
   Re-project on every pull; never destroy user-entered data.
2. **Field-level priority**, default `manual > apple-health(sourceName=Watch) > health-connect > open-wearables > apple-export`.
   Expose "primary sleep device" and "primary activity device" toggles.
3. **Idempotency:** `(sourceId, externalId)` unique; re-import replaces, never duplicates.
4. **Do not overwrite** meals/journal/notes; health sources only write sleep, workouts, metrics.
5. **Bump `BACKUP_VERSION` to 2** and migrate; unknown fields must be dropped gracefully.
6. **Retention:** keep 90 days of 1-min HR samples, aggregates forever; otherwise localStorage quota
   will bite. If that's not enough, move the store to IndexedDB before Phase 1.

### 5.4 Plugin choice for Phase 1

- Upgrade to **Capacitor 8** (Cap 9 is already RC; staying on 7 is a dead end for health plugins).
- Use **`@capgo/capacitor-health` v8** as primary: 30 types, sleep stages on both platforms,
  workouts on both, aggregated queries, free/MPL-2.0, actively maintained.
- Keep **`@capacitor/health-fitness`** as the fallback if you need true background jobs or
  `READ_HEALTH_DATA_HISTORY`; its API is uglier but it is documented on capacitorjs.com and MIT.
- Do **not** take a dependency on Capawesome unless you are already an Insiders customer.

---

## 6. Phased plan

| Phase | Scope | Effort (est.) | Outcome |
|---|---|---|---|
| **0** | `HealthDataSource` + normalizer + merger + provenance UI + **Apple Health XML import** (streaming unzip/SAX, progress, dedupe) | 8–12 dev-days | Real wearable data on both platforms, zero server, zero native risk; validates the mapping against the scoring engine |
| **1** | Capacitor 8 upgrade; `@capgo/capacitor-health`; HealthKit + Health Connect permissions; incremental pull on launch/foreground; cursor persistence; Play Health declaration + privacy policy; iOS HealthKit capability | 8–12 dev-days | Automatic daily sync on the phone; app becomes genuinely useful without manual exports |
| **1.5** *(optional)* | Background refresh: `@capacitor/health-fitness` or own BGTask/WorkManager; visible notification Android | 3–5 dev-days | "Data is there when you wake up" (subject to OS scheduling) |
| **2** *(optional)* | Cloud connector: Open Wearables (deploy + token service + Capacitor wrapper + mapping) **or** a commercial aggregator | 4–8 weeks (OW) / 1–2 weeks (aggregator) | Garmin/Oura/Whoop users who don't write to the phone store |
| **3** *(optional)* | Labs/EHR: FHIR import (Apple `clinical-records/`), then HealthChain server-side if EHR connectivity is in scope | 2–6 weeks | Biomarkers from real labs, not just wearable proxies |

**Why this order:** Phase 0 delivers value with zero native/build risk and forces the hard part
(normalization + merge + provenance) to be built once, behind an interface. Phase 1 then swaps in a
live source without touching the UI or scoring. Phase 2 is a business decision, not a technical one:
**if it must ship within a quarter and eng time is the constraint, a commercial aggregator
(Junction at $300/mo is the cheapest entry); if data sovereignty is part of the product promise,
self-host Open Wearables.**

---

## 7. What still has to be hand-written (no option removes this)

1. **Night/session assembly** from HealthKit sleep samples (no session object) and from Health
   Connect `SleepSessionRecord` stages; gap thresholds, naps, multi-source writers.
2. **Mapping tables** from HK identifiers / Health Connect record types to `SleepSession`,
   `Workout`, `DayMetrics` (~40–60 types; OW's server does this for its own schema, not yours).
   Concrete example: Health Connect returns stages `awake | light | deep | rem`, while the app's
   `Stage` is `awake | rem | core | deep` — `light` must become `core`, and unknown stages dropped.
3. **Workout statistics**: avg/max HR, zone minutes, strain — HealthKit gives the workout object,
   not these; requires `HKStatisticsQuery`/`HKWorkoutRouteQuery` or equivalent Health Connect
   aggregates, then the app's own zone/strain math.
4. **Overnight aggregation windows** for HRV/RHR/respiratory/SpO2/wrist temp (the app's settings
   already expose `hrvWindow`, `rhrWindow`, `tempMethod` — honor them).
5. **Merge/priority/dedupe + provenance** across manual, Watch, Oura, Whoop, imports.
6. **Incremental cursors** (HK anchors / Health Connect change tokens) persisted across launches.
7. **Apple export ingestion**: streaming ZIP + SAX, memory ceiling, progress, cancellation,
   partial-import recovery.
8. **Permission UX and store compliance**: rationale screens, denial states, Play Health apps
   declaration, privacy policy, Apple 5.1.3 disclosures.
9. **Background scheduling** if you want it (Capgo doesn't provide it).
10. **Capacitor plugin** if you choose OW's native SDKs (thin, but real Swift/Kotlin + Gradle work).

What you **don't** hand-write: per-provider OAuth/token refresh/backfill for Garmin, Oura, Whoop,
Polar, Suunto, Strava, Withings, Ultrahuman (that's what OW/aggregators sell), and HealthKit/Health
Connect record plumbing if you use a plugin.

---

## 8. Open questions to settle before committing

1. **Does "no accounts" survive a cloud connector?** If not, Phase 2 must be a separate opt-in mode
   with its own consent, privacy policy and deletion path.
2. **Which devices matter?** If the audience is Apple Watch + Oura/Whoop-on-iOS, HealthKit alone may
   be 80% of value. If Android + Garmin is core, OW/aggregator moves up.
3. **Is background freshness a product requirement?** If yes, budget for `health-fitness` or a
   custom BGTask/WorkManager path.
4. **Data volume:** decide localStorage vs IndexedDB before importing years of history.
5. **Clinical labs:** if real lab PDFs/FHIR are in scope, that is a separate pipeline (and the only
   place HealthChain could matter).

---

## 9. Sources

**Repos (local clones):**
- `open-wearables/README.md`, `docs/architecture/system-overview.mdx`,
  `docs/architecture/unified-data-model.mdx`, `docs/providers/apple-health.mdx`,
  `docs/providers/coverage.mdx`, `docs/sdk/integration.mdx`, `docs/sdk/ios/integration.mdx`,
  `docker-compose.yml`, `backend/app/api/routes/v1/sdk_sync.py`,
  `backend/app/schemas/providers/mobile_sdk/sync_request.py`
- `ow-ios/README.md`, `OpenWearablesHealthSDK.podspec`, `Sources/.../Internal/Types.swift`
- `ow-android/README.md`, `sdk/build.gradle.kts`, `sdk/libs/maven/.../data-1.0.0.aar`
- `ow-flutter/README.md`, `lib/health_data_type.dart`, `ios/*.podspec`, `android/build.gradle`
- `ow-rn/README.md`, `package.json`, `expo-module.config.json`, `src/OpenWearablesModule.ts`
- `healthchain/README.md`, `LICENSE`, `pyproject.toml`
- App: `src/domain/types.ts`, `src/domain/scoring/recovery.ts`, `src/store/useAppStore.ts`,
  `src/domain/backup.ts`, `capacitor.config.ts`, `ios/App/Podfile`, `android/variables.gradle`

**Vendor / official docs:**
- Open Wearables pricing — https://openwearables.io/pricing
- Open Wearables mobile SDKs — https://openwearables.io/platform/mobile-sdks
- Open Wearables docs — https://openwearables.io/docs
- Terra pricing — https://docs.tryterra.co/unified-api/pricing ; https://tryterra.co/pricing
- Terra mobile-only sources — https://docs.tryterra.co/unified-api/mobile-only-sources
- Junction pricing — https://www.junction.com/pricing
- ROOK pricing — https://tryrook.io/pricing ; compliance — https://tryrook.io/compliance
- Spike pricing — https://spikeapi.com/pricing ; RN SDK — https://docs.spikeapi.com/sdk-docs/react-native/setup
- Validic Inform SDK — https://developer.validic.com/docs/using-the-inform-mobile-sdk
- ChartSpan acquires Validic — https://www.mobihealthnews.com/news/chartspan-acquires-validic-expand-remote-care-management-platform
- Human API (LexisNexis) — https://risk.lexisnexis.com/products/humanapi
- Capacitor 8 announcement — https://ionic.io/blog/announcing-capacitor-8
- `@capgo/capacitor-health` — https://github.com/Cap-go/capacitor-health ; https://capgo.app/docs/plugins/health/
- `@capacitor/health-fitness` — https://capacitorjs.com/docs/apis/health-fitness
- Capawesome Health — https://capawesome.io/docs/sdks/capacitor/health/
- Apple: share/export health data — https://support.apple.com/en-us/guide/iphone/iph27f6325b2/14.0/ios/14.0
- Apple HealthKit privacy — https://developer.apple.com/documentation/healthkit/protecting-user-privacy
- Apple Guideline 5.1.3 summary — https://aifitnessapi.com/compliance/app-store-guideline-5-1-3-health-research
- Health Connect read limits — https://developer.android.com/health-and-fitness/health-connect/aggregate-data
- Health Connect backup/restore — https://support.google.com/android/answer/15323271
- Google Health export — https://support.google.com/googlehealth/answer/14236615
- Google Fit deprecation — https://developers.google.com/fit/android
- Apple export contents (clinical-records, export_cda.xml, workout-routes) — https://johngoldin.com/blog/apple-health-export/2020-02-apple-health-export1
- Aggregator price compilation (secondary) — https://aifitnessapi.com/pricing/health-data-aggregator-pricing

**Confidence notes:** repo facts are verified by reading the code/docs. Vendor pricing and
compliance claims are public marketing pages, not contracts — mark as *public/unverified* and
re-check before signing. Effort estimates are engineering judgement, not measured.

---

## Appendix A — Why not just use the Open Wearables RN SDK in a Capacitor app?

Capacitor's JS layer calls native code through `@capacitor/core`'s plugin registry (a WKWebView
message handler / Android JS interface). React Native's Expo Modules use a JSI/TurboModule host and
`expo-modules-core`'s native module registry, and their own `expo-module.config.json` autolinking.
A Capacitor app has neither the Expo runtime nor React Native's bridge, so `requireNativeModule`
has nothing to resolve against. Likewise, the Flutter SDK's `MethodChannel` needs a Flutter engine.
The only portable layer is the native SDK below them — hence a Capacitor plugin.

## Appendix B — Minimum native config changes per path

| Path | iOS | Android |
|---|---|---|
| Apple XML import | none | none |
| HealthKit plugin | HealthKit capability; `NSHealthShareUsageDescription`; iOS 15+ for OW, 14+ for basic HealthKit | — |
| Health Connect plugin | — | `minSdk 26`; per-type `READ_*` permissions; rationale activity-alias; privacy policy; Play Health declaration |
| Background sync | `UIBackgroundModes: fetch, processing`; `BGTaskSchedulerPermittedIdentifiers` | `FOREGROUND_SERVICE_HEALTH`; `POST_NOTIFICATIONS`; `READ_HEALTH_DATA_IN_BACKGROUND`; FGS declaration in Play Console |
| OW native wrapper | iOS 15; `pod 'OpenWearablesHealthSDK', '~> 0.16.0'`; background modes + BGTask IDs | `minSdk 29`; `compileSdk 36`; Kotlin 2.1; Java 17; AGP 8.9+; JitPack repo; Samsung Health AAR |
