# Health data sources (roadmap)

This first iteration is deliberately **fully offline**: it ships a deterministic demo dataset, manual logging and a local **Apple Health export importer**. It does not read Apple Health or Health Connect directly yet. This document describes how to add those native adapters without changing the scoring layer.

## Decision: Open Wearables (evaluated November 2026)

We evaluated [Open Wearables](https://github.com/the-momentum/open-wearables) as a way to avoid writing every provider integration. Verdict: **not as the on-device data layer**.

- Its native SDKs are upload-only: they read HealthKit/Health Connect and push to a server; they never return samples to the host app.
- Its read API uses a global, org-wide API key, so a device cannot query it without a broker service.
- It requires 5+ containers (FastAPI, PostgreSQL, Redis, Celery worker + beat), accounts and OAuth app credentials.
- It computes sleep sessions server-side, typically 15–20 minutes after upload — too late for a morning readiness score.

Useful artefacts we can reuse: its sleep-sessionisation logic, `SeriesType` vocabulary, and documented HealthKit/Health Connect edge cases.

**Chosen direction:** native HealthKit and Health Connect adapters behind a custom Capacitor plugin (`BeneHealth`), local-only by default. An optional read-only connector to a user's own self-hosted Open Wearables instance can come later; it must be off by default and clearly disclose the destination host.


## The data contract

Everything the app needs is in `src/domain/types.ts`:

- `DayRecord` — one local day: sleep, metrics, workouts, meals, journal.
- `SleepSession` — start/end, stage blocks, overnight HRV/RHR/RR/SpO₂/temperature, alarm metadata.
- `Workout` — kind, times, duration, distance, HR, calories, zone minutes, optional strength exercises.
- `DayMetrics` — steps, energy, exercise minutes, hydration, caffeine, HR samples, stress samples, wear time.

An importer’s only job is to produce these objects. Scores recompute automatically.

## Apple Health XML import (available now)

Settings → Data Sources → **Import Apple Health export** accepts `export.zip` (the file the Health app shares) or a plain `export.xml`.

- Parses the last **365 days** (older records are skipped to keep the local store bounded).
- Assembles sleep nights from Apple's flat `HKCategoryTypeIdentifierSleepAnalysis` records, including Awake/REM/Core/Deep.
- Uses sleep-window samples for overnight HRV, resting HR, respiratory rate, SpO₂, wrist temperature and minimum HR.
- Imports workouts with duration, distance, energy, average/max HR and derived zone minutes; daily steps, active/basal energy, exercise minutes, daylight, water, caffeine and HR samples.
- Apple does not export meal context, so nutrition records become one imported meal per day and do **not** produce a Nutrition Score.
- Everything stays on-device; the parser is pure TypeScript and tested with a synthetic export.

The importer intentionally **replaces the dashboard days**, not the profile, settings, journal tags, chats or backups. Native HealthKit/Health Connect will feed the same `DayRecord` shape and reuse the same scoring layer.

## Native adapters (next milestone)

### Apple Health (iOS)

1. Add a Capacitor plugin (or a small Swift plugin) exposing:
   - `requestAuthorization(types)`
   - `readSamples({ type, start, end })`
   - `writeHeartRate(samples)` for live HR if you implement the sensor feature
2. Map HealthKit types:
   - `HKCategoryTypeIdentifierSleepAnalysis` → stage blocks (`asleepCore`, `asleepDeep`, `asleepREM`, `awake`, `inBed`)
   - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` → `SleepSession.hrvMs` (aggregate inside the sleep window)
   - `HKQuantityTypeIdentifierRestingHeartRate` → `rhrBpm`
   - `HKQuantityTypeIdentifierHeartRate` → `DayMetrics.hrSamples` (bucket to 5–10 minutes)
   - `HKQuantityTypeIdentifierStepCount`, `ActiveEnergyBurned`, `BasalEnergyBurned`, `AppleExerciseTime`
   - `HKQuantityTypeIdentifierOxygenSaturation`, `RespiratoryRate`, `AppleSleepingWristTemperature`
   - `HKWorkoutType` → `Workout` with `source: "Apple Watch"` and `imported: true`
   - `HKQuantityTypeIdentifierDietaryEnergyConsumed` and macros → meals with `source: "imported"` (score suppressed)
3. Respect the vendor-visible asymmetry: sleep entries (HealthKit-owned) are immutable and cannot be deleted or moved in the timeline; imported workouts cannot have their date edited.
4. Add usage descriptions to `ios/App/App/Info.plist` (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`).

### Health Connect (Android)

1. Add the Health Connect dependency and a Capacitor plugin exposing read/aggregate APIs.
2. Request permissions per record type (`SleepSessionRecord`, `HeartRateRecord`, `HeartRateVariabilityRmssdRecord`, `RestingHeartRateRecord`, `StepsRecord`, `ActiveCaloriesBurnedRecord`, `ExerciseSessionRecord`, `NutritionRecord`, `OxygenSaturationRecord`, `RespiratoryRateRecord`, `BodyTemperatureRecord`).
3. Map records into the same `DayRecord` shape. Health Connect sleep stages already use Awake/REM/Core/Deep-like categories; normalise to the four-stage model.
4. Health Connect has no “write heart rate” requirement for this feature set; skip live HR until the Strength Builder sensor work.

### CSV / JSON import (cross-platform)

A pragmatic first step that needs no native code:

- Accept a JSON file in the same shape as a partial `DayRecord[]`.
- Provide a simple CSV schema for sleep sessions and workouts.
- Run the same validation/confirm flow as backup restore.
- Mark imported entities `imported: true` so the UI can disable editing and suppress nutrition scores.

This is the recommended way to test with real data before native permissions work is complete.

## Sync and backup

Health data should remain local by default. If you add cloud sync:

- Make it opt-in and end-to-end encrypted.
- Never upload derived scores without the raw data needed to explain them.
- Keep the JSON backup format as the portable escape hatch.
- Do not silently create an account during onboarding.

## Safety

- Do not add health data to analytics or crash reports.
- Do not infer diagnosis. Keep the “not a medical device” disclaimer visible in About.
- Request the minimum read scope per feature; no “read all health data” prompts.
- Document every write (e.g. heart rate) and make revocation easy.

## What not to do

- Don’t fabricate Apple Health data when permission is denied. Show the feature-degraded state and manual logging instead.
- Don’t reuse the demo seed in production once a real source is connected. Gate it behind onboarding’s “See a sample day” path or a developer flag.
- Don’t compute scores in the native layer. Keep one implementation in TypeScript so iOS, Android and web agree.
