// Deterministic app state for the Playwright scripts.
//
// A fresh install starts empty, so every script that needs scores, history or
// a routine has to plant one. The state is written straight into the persisted
// store before the app boots instead of clicking through onboarding, which
// keeps the run independent of onboarding copy and of whatever the browser
// already holds.
//
// The shape and values mirror `scripts/screenshots.mjs`, so screenshots and
// tests look at the same app. Two runs on the same date must produce identical
// state: every value below is fixed, nothing comes from Math.random.

export const STORE_KEY = 'bene-v1';

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Fixed, hand-checked per-day variation (asleep minutes, deep, rem, HRV, RHR).
// Seven nights: enough for Recovery (2 nights plus a 5-night baseline) without
// the 35-day set the screenshots need for calibration copy.
const NIGHTS = [
  { asleep: 452, deep: 88, rem: 96, hrv: 58.4, rhr: 51 },
  { asleep: 471, deep: 104, rem: 101, hrv: 61.2, rhr: 50 },
  { asleep: 418, deep: 74, rem: 88, hrv: 49.8, rhr: 54 },
  { asleep: 489, deep: 112, rem: 108, hrv: 64.7, rhr: 49 },
  { asleep: 463, deep: 96, rem: 99, hrv: 57.1, rhr: 52 },
  { asleep: 502, deep: 118, rem: 112, hrv: 66.9, rhr: 48 },
  { asleep: 441, deep: 82, rem: 92, hrv: 53.6, rhr: 53 },
];

const PHENO_AGE_MARKERS = ['albumin', 'creatinine', 'glucose', 'crp', 'lymphocyte', 'mcv', 'rdw', 'alp', 'wbc'];

// Stage blocks in order; each night is split so the hypnogram has shape.
function nightBlocks(p) {
  const core = Math.max(120, p.asleep - p.deep - p.rem);
  const blocks = [
    ['awake', 7],
    ['core', Math.round(core * 0.3)],
    ['deep', Math.round(p.deep * 0.6)],
    ['core', Math.round(core * 0.24)],
    ['rem', Math.round(p.rem * 0.35)],
    ['core', Math.round(core * 0.26)],
    ['deep', p.deep - Math.round(p.deep * 0.6)],
    ['rem', Math.round(p.rem * 0.33)],
    ['awake', 6],
    ['core', core - Math.round(core * 0.8)],
    ['rem', p.rem - Math.round(p.rem * 0.68)],
    ['core', Math.round(core * 0.2)],
    ['awake', 5],
  ].filter(([, min]) => min > 0);
  let cursor = 0;
  return blocks.map(([stage, min]) => {
    const block = { stage, startMin: cursor, endMin: cursor + min };
    cursor += min;
    return block;
  });
}

// Heart rate through a wake day: sleeping, a low morning, a mid-morning run and
// an easy evening. Feeds the strain day curve and the hourly chart.
function hrSamples(idx) {
  const samples = [];
  const lift = idx % 3;
  for (let m = 0; m < 1440; m += 5) {
    let bpm;
    if (m < 390) bpm = 50 + lift;
    else if (m < 420) bpm = 62 + lift;
    else if (m < 440) bpm = 74 + lift;
    else if (m >= 440 && m < 495) bpm = 148 + Math.round(14 * Math.sin((m - 440) / 9));
    else if (m < 510) bpm = 96 + lift;
    else if (m < 720) bpm = 68 + lift + (m % 30 === 0 ? 6 : 0);
    else if (m < 780) bpm = 64 + lift;
    else if (m < 1140) bpm = 71 + lift + (m % 60 === 0 ? 5 : 0);
    else bpm = 60 + lift;
    samples.push({ minute: m, bpm });
  }
  return samples;
}

function stressSamples() {
  const out = [];
  for (let m = 390; m < 1380; m += 15) {
    const wave = Math.sin((m - 390) / 120) * 18 + Math.sin((m - 390) / 37) * 6;
    out.push({ minute: m, score: Math.max(4, Math.min(88, Math.round(38 + wave))) });
  }
  return out;
}

function mealsFor(date) {
  const meals = [
    { name: 'Oats, berries and yogurt', time: '08:10', calories: 520, proteinG: 32, carbsG: 66, fatG: 14, fiberG: 9, vegGrams: 0, fruitCups: 1.5, wholeGrainServings: 1, healthyOilPctOfCalories: 10, nutsGrams: 15, omega3Mg: 300, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 420, addedSugarG: 6, emoji: '🥣' },
    { name: 'Chicken, rice and greens', time: '13:05', calories: 890, proteinG: 68, carbsG: 92, fatG: 24, fiberG: 11, vegGrams: 190, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 25, nutsGrams: 0, omega3Mg: 150, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 780, addedSugarG: 2, emoji: '🍗' },
    { name: 'Salmon, potatoes and salad', time: '19:40', calories: 894, proteinG: 84, carbsG: 82, fatG: 26, fiberG: 10, vegGrams: 210, fruitCups: 0.5, wholeGrainServings: 0, healthyOilPctOfCalories: 30, nutsGrams: 10, omega3Mg: 2200, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 640, addedSugarG: 3, emoji: '🐟' },
  ];
  return meals.map((meal, i) => ({ ...meal, source: 'bene', loggedVia: 'search', id: `meal-${date}-${i}`, date }));
}

function strengthBlock(date, at) {
  return {
    id: `w-strength-${date}`,
    kind: 'strength',
    name: 'Lower body strength',
    date,
    start: at(date, '17:30'),
    durationMin: 54,
    distanceKm: null,
    avgHr: 118,
    maxHr: 158,
    calories: 410,
    strain: 11.4,
    source: 'Bene Ring',
    imported: false,
    zoneMinutes: [8, 22, 6, 2, 0, 0],
    exercises: [
      {
        id: `ex-${date}-1`,
        name: 'Back squat',
        muscle: 'quads',
        sets: [
          { id: `s-${date}-1a`, reps: 8, weightKg: 90, rpe: 7, type: 'warmup', completed: true },
          { id: `s-${date}-1b`, reps: 5, weightKg: 120, rpe: 8, type: 'normal', completed: true },
          { id: `s-${date}-1c`, reps: 5, weightKg: 120, rpe: 8.5, type: 'normal', completed: true },
          { id: `s-${date}-1d`, reps: 5, weightKg: 120, rpe: 9, type: 'normal', completed: true },
        ],
      },
      {
        id: `ex-${date}-2`,
        name: 'Romanian deadlift',
        muscle: 'hamstrings',
        sets: [
          { id: `s-${date}-2a`, reps: 8, weightKg: 80, rpe: 7, type: 'normal', completed: true },
          { id: `s-${date}-2b`, reps: 8, weightKg: 90, rpe: 8, type: 'normal', completed: true },
          { id: `s-${date}-2c`, reps: 8, weightKg: 90, rpe: 9, type: 'normal', completed: true },
        ],
      },
    ],
    notes: 'Bar speed fine on the last set.',
  };
}

const RUNS = [
  { kind: 'run', name: 'Threshold run', durationMin: 52, distanceKm: 9.4, avgHr: 154, maxHr: 172, calories: 610, zones: [6, 22, 14, 10, 0, 0] },
  { kind: 'run', name: 'Easy zone 2 run', durationMin: 45, distanceKm: 7.6, avgHr: 138, maxHr: 151, calories: 470, zones: [4, 18, 23, 0, 0, 0] },
  { kind: 'cycle', name: 'Tempo ride', durationMin: 61, distanceKm: 27.2, avgHr: 147, maxHr: 166, calories: 640, zones: [5, 16, 22, 18, 0, 0] },
];

const JOURNAL_TAGS = [
  { id: 'alcohol', label: 'Alcohol', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '🍷' },
  { id: 'caffeine', label: 'Caffeine after 2pm', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '☕' },
  { id: 'mood', label: 'Mood', kind: 'yesneutralno', pinned: true, category: 'mind', icon: '🙂' },
  { id: 'stretch', label: 'Stretching', kind: 'yesno', pinned: true, category: 'recovery', icon: '🧘' },
  { id: 'hydrated', label: 'Hydration', kind: 'numeric', unit: 'L', min: 0, max: 5, pinned: false, category: 'nutrition', icon: '💧' },
  { id: 'screen', label: 'Screen time', kind: 'numeric', unit: 'h', min: 0, max: 12, pinned: false, category: 'lifestyle', icon: '📱' },
  { id: 'vitamins', label: 'Vitamins', kind: 'yesno', pinned: false, category: 'nutrition', icon: '💊' },
  { id: 'lateMeal', label: 'Late meal', kind: 'yesno', pinned: false, category: 'nutrition', icon: '🌙' },
  { id: 'sauna', label: 'Sauna', kind: 'yesno', pinned: false, category: 'recovery', icon: '🔥' },
  { id: 'reading', label: 'Reading before bed', kind: 'yesno', pinned: false, category: 'mind', icon: '📖' },
  { id: 'daylight', label: 'Daylight', kind: 'yesno', pinned: false, category: 'lifestyle', icon: '☀️' },
  { id: 'energy', label: 'Energy', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '⚡' },
  { id: 'stress', label: 'Stress', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '😮‍💨' },
];

/**
 * Builds the state object. `today` is injectable so a caller can pin the
 * calendar; timestamps default to plain local ISO strings, the same convention
 * the store writes when it saves a day.
 */
export function fixtureState({
  today = new Date(),
  at = (date, hhmm) => new Date(`${date}T${hhmm}:00`).toISOString(),
  theme = 'light',
} = {}) {
  const dates = [];
  for (let i = NIGHTS.length - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - i);
    dates.push(dateKey(d));
  }
  const latest = dates[dates.length - 1];

  const days = {};
  const journalEntries = [];
  dates.forEach((date, i) => {
    const p = NIGHTS[i % NIGHTS.length];
    const isToday = date === latest;
    const run = RUNS[i % RUNS.length];
    const start = new Date(`${date}T23:04:00`);
    start.setDate(start.getDate() - 1);
    const stages = nightBlocks(p);
    const inBedMin = stages[stages.length - 1].endMin;
    const sleep = {
      id: `sleep-${date}`,
      date,
      start: start.toISOString(),
      end: new Date(start.getTime() + inBedMin * 60000).toISOString(),
      stages,
      source: 'Bene Ring',
      hrvMs: p.hrv,
      rhrBpm: p.rhr,
      respiratoryRate: 14.2,
      spo2: 96.8,
      wristTempC: 36.4,
      minHrBpm: p.rhr - 4,
      timeToFallAsleepMin: 9,
      alarm: { type: 'smart', time: '06:30', windowMin: 30, enabled: true },
    };

    const workouts = [
      {
        id: `w-${date}`,
        kind: run.kind,
        name: run.name,
        date,
        start: at(date, '06:40'),
        durationMin: run.durationMin,
        distanceKm: run.distanceKm,
        avgHr: run.avgHr,
        maxHr: run.maxHr,
        calories: run.calories,
        strain: Math.round((13 + (i % 4) * 1.3) * 10) / 10,
        source: 'Bene Ring',
        imported: false,
        zoneMinutes: run.zones,
      },
      ...(i % 3 !== 2 ? [strengthBlock(date, at)] : []),
    ];

    const steps = 8400 + (i % 5) * 900 + (i % 2) * 400;
    const journal = [
      { tagId: 'alcohol', value: i % 7 === 5 ? 'yes' : 'no' },
      { tagId: 'caffeine', value: i % 4 === 0 ? 'yes' : 'no' },
      { tagId: 'mood', value: i % 6 === 2 ? 'neutral' : 'yes' },
      { tagId: 'stretch', value: i % 3 === 0 ? 'yes' : 'no' },
      { tagId: 'hydrated', value: 2.2 + (i % 3) * 0.3 },
      { tagId: 'energy', value: 6 + (i % 4) },
      { tagId: 'stress', value: 3 + (i % 4) },
    ].map((entry, k) => ({
      id: `j-${date}-${k}`,
      tagId: entry.tagId,
      date,
      value: entry.value,
      at: at(date, '21:10'),
    }));
    journalEntries.push(...journal);

    days[date] = {
      date,
      sleep,
      metrics: {
        date,
        steps: isToday ? Math.round(steps * 0.62) : steps,
        activeCalories: isToday ? 430 : 640 + (i % 4) * 55,
        totalCalories: isToday ? 1680 : 2560 + (i % 3) * 90,
        exerciseMinutes: isToday ? 52 : workouts.reduce((sum, w) => sum + w.durationMin, 0),
        daylightMinutes: 34 + (i % 4) * 9,
        hydrationMl: isToday ? 1500 : 2350 + (i % 3) * 180,
        caffeineMg: i % 4 === 0 ? 260 : 150,
        alcoholGrams: i % 7 === 5 ? 14 : 0,
        hrSamples: hrSamples(i),
        daytimeHrvMs: Math.round((44 + (i % 5) * 3) * 10) / 10,
        stressSamples: stressSamples(),
        tempDeviationC: Math.round((0.05 + (i % 4) * 0.06) * 100) / 100,
        wearMinutes: isToday ? 600 : 930,
      },
      workouts,
      // Today is read mid-morning, so it only has the first two meals and the run.
      meals: isToday ? mealsFor(date).slice(0, 2) : mealsFor(date),
      journal,
    };
  });

  const biomarkers = [
    ['albumin', 'Albumin', 45.2, 'g/L', 40, 50, 'blood'],
    ['creatinine', 'Creatinine', 0.92, 'mg/dL', 0.7, 1.1, 'kidney'],
    ['glucose', 'Glucose', 88, 'mg/dL', 70, 95, 'metabolic'],
    ['crp', 'hs-CRP', 0.6, 'mg/L', 0, 1, 'inflammation'],
    ['lymphocyte', 'Lymphocyte %', 32, '%', 25, 40, 'blood'],
    ['mcv', 'MCV', 89, 'fL', 82, 95, 'blood'],
    ['rdw', 'RDW', 12.9, '%', 11.5, 13.5, 'blood'],
    ['alp', 'Alkaline phosphatase', 72, 'U/L', 44, 121, 'liver'],
    ['wbc', 'White blood cells', 5.8, '10³/µL', 4, 7.5, 'blood'],
    ['apob', 'ApoB', 72, 'mg/dL', 40, 80, 'lipids'],
    ['hba1c', 'HbA1c', 5.1, '%', 4.6, 5.3, 'metabolic'],
    ['vitd', 'Vitamin D', 38, 'ng/mL', 40, 60, 'vitamins'],
  ].map(([id, name, value, unit, optimalLow, optimalHigh, category]) => ({
    id,
    name,
    value,
    unit,
    optimalLow,
    optimalHigh,
    category,
    phenoAge: PHENO_AGE_MARKERS.includes(id),
    recordedAt: dates[0],
  }));

  const chats = [
    {
      id: 'chat-1',
      title: 'Why is my recovery low?',
      createdAt: at(dates[4], '07:40'),
      updatedAt: at(dates[4], '07:42'),
      ghost: false,
      pinned: true,
      model: 'standard',
      messages: [
        { id: 'm-1', role: 'user', text: 'Why is my recovery low?', at: at(dates[4], '07:40') },
        {
          id: 'm-2',
          role: 'assistant',
          text: 'Your HRV was 49.8 ms overnight, about 14% under your four-week baseline, and resting heart rate sat 3 bpm above it. Sleep scored 71% with only 74 minutes of deep sleep. Keep today at an easy pace and aim for lights out before 10:30.',
          at: at(dates[4], '07:41'),
          followUps: ['What should my session look like?', 'How do I get back to baseline faster?'],
        },
      ],
    },
  ];

  const routines = [
    {
      id: 'routine-tempo',
      name: 'Tempo Run',
      subtitle: '3 × 6 min at tempo',
      kind: 'run',
      durationMin: 42,
      blocks: [
        { id: 'b-1', kind: 'warmup', title: 'Warm-up', durationMin: 10, target: 'Zone 2' },
        { id: 'b-2', kind: 'repeat', title: 'Tempo', durationMin: 24, repeats: 3, target: 'Zone 3–4' },
        { id: 'b-3', kind: 'cooldown', title: 'Cool-down', durationMin: 8, target: 'Zone 1' },
      ],
      exercises: [],
      scheduledDates: [dates[dates.length - 2], latest],
      completedDates: [dates[dates.length - 2]],
      skippedDates: [],
    },
    {
      id: 'routine-strength',
      name: 'Lower body strength',
      subtitle: 'Squat and hinge focus',
      kind: 'strength',
      durationMin: 54,
      blocks: [
        { id: 'b-4', kind: 'warmup', title: 'Warm-up', durationMin: 8, target: 'RPE 4' },
        { id: 'b-5', kind: 'steady', title: 'Main lifts', durationMin: 46, target: 'RPE 7–9' },
      ],
      exercises: [
        {
          id: 'rex-1',
          name: 'Back squat',
          muscle: 'quads',
          sets: [
            { id: 'rs-1', reps: 5, weightKg: 120, type: 'normal' },
            { id: 'rs-2', reps: 5, weightKg: 120, type: 'normal' },
            { id: 'rs-3', reps: 5, weightKg: 120, type: 'normal' },
          ],
          restSec: 180,
        },
      ],
      scheduledDates: [latest],
      completedDates: [],
      skippedDates: [],
    },
  ];

  return {
    profile: {
      name: 'Alex Rivera',
      sex: 'male',
      birthDate: '1994-06-12',
      heightCm: 180,
      weightKg: 76.4,
      goal: 'performance',
      createdAt: at(dates[0], '07:00'),
    },
    settings: {
      theme,
      onboarded: true,
      activeTabs: { fitness: true, journal: true, biology: true },
      homeCards: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal', 'fitness'],
      homeOrder: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal', 'fitness'],
      sleepGoalMin: 480,
      calorieGoal: 2650,
      proteinGoalG: 180,
      aiPersonality: 'supportive',
      aiEnabled: true,
      ghostDefault: false,
      ghostRetentionMin: 60,
      aiModel: 'standard',
      expandedThinking: false,
      suggestedFollowUps: true,
      excludedContributors: [],
      nutritionUnits: 'percent',
      activityStatus: 'active',
      activityStatusUntil: null,
      activityStatusNote: '',
      autoBackup: true,
      lastBackupAt: null,
    },
    days,
    dayOrder: dates,
    journalTags: JOURNAL_TAGS.map((tag) => ({ ...tag })),
    journalEntries,
    biomarkers,
    healthRecords: [
      {
        id: 'rec-1',
        name: 'Bloodwork — full panel.pdf',
        kind: 'bloodwork',
        uploadedAt: at(dates[0], '08:30'),
        status: 'ready',
        sizeKb: 218,
        biomarkerCount: 12,
      },
    ],
    chats,
    routines,
    activityEvents: [],
    seededAt: at(latest, '06:30'),
  };
}

/** Writes the fixture into localStorage and reloads, so the app boots on it. */
export async function seed(page, { theme, today } = {}) {
  const state = fixtureState({ theme, today });
  await page.evaluate(
    ([key, payload]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(payload));
    },
    [STORE_KEY, { state, version: 1 }],
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return state;
}
