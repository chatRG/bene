# Health data sources (roadmap)

This first iteration is deliberately **fully offline**: it ships a deterministic demo dataset and manual logging. It does not read Apple Health or Health Connect yet. This document describes how to add those adapters without changing the scoring layer.

## The data contract

Everything the app needs is in `src/domain/types.ts`:

- `DayRecord` — one local day: sleep, metrics, workouts, meals, journal.
- `SleepSession` — start/end, stage blocks, overnight HRV/RHR/RR/SpO₂/temperature, alarm metadata.
- `Workout` — kind, times, duration, distance, HR, calories, zone minutes, optional strength exercises.
- `DayMetrics` — steps, energy, exercise minutes, hydration, caffeine, HR samples, stress samples, wear time.

An importer’s only job is to produce these objects. Scores recompute automatically.

## Recommended adapters

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
- Don’t reuse the demo seed in production once a real source is connected. Gate it behind onboarding’s “Explore demo” path or a developer flag.
- Don’t compute scores in the native layer. Keep one implementation in TypeScript so iOS, Android and web agree.
