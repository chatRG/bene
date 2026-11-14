import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractAppleHealthXml, parseAppleHealthXml } from './appleHealth';

const NOW = new Date('2026-11-14T13:20:00');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-13 23:30:00 +0000" endDate="2026-11-13 23:45:00 +0000" value="HKCategoryValueSleepAnalysisAwake"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-13 23:45:00 +0000" endDate="2026-11-14 02:30:00 +0000" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-14 02:30:00 +0000" endDate="2026-11-14 03:30:00 +0000" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-14 03:30:00 +0000" endDate="2026-11-14 04:40:00 +0000" value="HKCategoryValueSleepAnalysisAsleepREM"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-11-14 04:40:00 +0000" endDate="2026-11-14 07:00:00 +0000" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" startDate="2026-11-14 03:10:00 +0000" endDate="2026-11-14 03:10:00 +0000" value="60" unit="ms"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" startDate="2026-11-14 06:00:00 +0000" endDate="2026-11-14 06:00:00 +0000" value="52" unit="count/min"/>
  <Record type="HKQuantityTypeIdentifierRespiratoryRate" sourceName="Apple Watch" startDate="2026-11-14 04:00:00 +0000" endDate="2026-11-14 04:00:00 +0000" value="14" unit="count/min"/>
  <Record type="HKQuantityTypeIdentifierOxygenSaturation" sourceName="Apple Watch" startDate="2026-11-14 04:05:00 +0000" endDate="2026-11-14 04:05:00 +0000" value="0.97" unit="%"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" startDate="2026-11-13 18:00:00 +0000" endDate="2026-11-13 18:00:00 +0000" value="150" unit="count/min"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" startDate="2026-11-13 18:10:00 +0000" endDate="2026-11-13 18:10:00 +0000" value="155" unit="count/min"/>
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" startDate="2026-11-13 09:00:00 +0000" endDate="2026-11-13 10:00:00 +0000" value="8000" unit="count"/>
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" startDate="2026-11-13 09:00:00 +0000" endDate="2026-11-13 10:00:00 +0000" value="500" unit="kcal"/>
  <Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="MyFitnessPal" startDate="2026-11-13 12:00:00 +0000" endDate="2026-11-13 12:00:00 +0000" value="2200" unit="kcal"/>
  <Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="MyFitnessPal" startDate="2026-11-13 12:00:00 +0000" endDate="2026-11-13 12:00:00 +0000" value="150" unit="g"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Apple Watch" startDate="2026-11-13 18:00:00 +0000" endDate="2026-11-13 18:30:00 +0000" duration="30" durationUnit="min" totalDistance="5" totalDistanceUnit="km" totalEnergyBurned="350" totalEnergyBurnedUnit="kcal">
    <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" average="350" maximum="350"/>
    <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="150" maximum="170"/>
  </Workout>
</HealthData>`;

describe('Apple Health export importer', () => {
  it('assembles sleep, metrics, workouts and imported meals', () => {
    const result = parseAppleHealthXml(XML, NOW);
    expect(result.summary.days).toBeGreaterThanOrEqual(2);
    expect(result.dayOrder).toContain('2026-11-14');
    expect(result.dayOrder).toContain('2026-11-13');

    const wake = result.days.find((d) => d.date === '2026-11-14')!;
    expect(wake.sleep).not.toBeNull();
    expect(wake.sleep?.imported).toBe(true);
    expect(wake.sleep?.hrvMs).toBe(60);
    expect(wake.sleep?.rhrBpm).toBe(52);
    expect(wake.sleep?.respiratoryRate).toBe(14);
    expect(wake.sleep?.spo2).toBe(97);
    expect(wake.sleep?.stages.map((s) => s.stage)).toEqual(['awake', 'core', 'deep', 'rem', 'core']);

    const training = result.days.find((d) => d.date === '2026-11-13')!;
    expect(training.metrics.steps).toBe(8000);
    expect(training.workouts).toHaveLength(1);
    expect(training.workouts[0].kind).toBe('run');
    expect(training.workouts[0].imported).toBe(true);
    expect(training.workouts[0].calories).toBe(350);
    expect(training.meals[0].source).toBe('imported');
    expect(training.meals[0].calories).toBe(2200);
  });

  it('reads export.xml from an Apple Health ZIP', () => {
    const zipped = zipSync({ 'apple_health_export/export.xml': strToU8(XML) });
    const xml = extractAppleHealthXml(zipped.buffer, 'export.zip');
    expect(xml).toContain('<HealthData');
    expect(parseAppleHealthXml(xml, NOW).summary.sleepSessions).toBe(1);
  });

  it('rejects a ZIP without export.xml', () => {
    const zipped = zipSync({ 'other.txt': strToU8('no health data') });
    expect(() => extractAppleHealthXml(zipped.buffer, 'export.zip')).toThrow(/does not contain/);
  });
});
