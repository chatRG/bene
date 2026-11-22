import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const STORE_KEY = 'bene-v1';
const out = 'docs/screenshots';
fs.mkdirSync(out, { recursive: true });

// A new install starts empty, so the shots need a deterministic fixture. It is
// written straight into the persisted store before the first paint, which keeps
// the run independent of onboarding copy and of whatever is in the browser.
// Five weeks: Recovery needs 5 baseline nights, Stress needs 30 days of
// baseline and the training-load models need 10 days of qualification, so a
// shorter fixture would shoot "Calibrating" placeholders instead of scores.
const DAYS_BACK = 35;

function seedState(at = (date, hhmm) => new Date(`${date}T${hhmm}:00`).toISOString()) {
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const today = new Date();
  const dates = [];
  for (let i = DAYS_BACK - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - i);
    dates.push(dateKey(d));
  }
  const latest = dates[dates.length - 1];

  // Fixed, hand-checked per-day variation. No Math.random — two runs on the
  // same date must produce identical state.
  const plan = [
    { asleep: 452, deep: 88, rem: 96, hrv: 58.4, rhr: 51 },
    { asleep: 471, deep: 104, rem: 101, hrv: 61.2, rhr: 50 },
    { asleep: 418, deep: 74, rem: 88, hrv: 49.8, rhr: 54 },
    { asleep: 489, deep: 112, rem: 108, hrv: 64.7, rhr: 49 },
    { asleep: 463, deep: 96, rem: 99, hrv: 57.1, rhr: 52 },
    { asleep: 502, deep: 118, rem: 112, hrv: 66.9, rhr: 48 },
    { asleep: 441, deep: 82, rem: 92, hrv: 53.6, rhr: 53 },
  ];
  const nightFor = (i) => plan[i % plan.length];

  // Stage blocks in order; each night is split so the hypnogram has shape.
  function night(date, p) {
    const awake = 18;
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
      ['awake', awake - 13],
    ].filter(([, min]) => min > 0);
    let cursor = 0;
    const stages = blocks.map(([stage, min]) => {
      const block = { stage, startMin: cursor, endMin: cursor + min };
      cursor += min;
      return block;
    });
    const start = new Date(`${date}T23:04:00`);
    start.setDate(start.getDate() - 1);
    return {
      id: `sleep-${date}`,
      date,
      start: start.toISOString(),
      end: new Date(start.getTime() + cursor * 60000).toISOString(),
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
  }

  // Heart rate through a wake day: sleeping, a low morning, a mid-morning run
  // and an easy evening. Used by the Strain day curve and the hourly chart.
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

  function meals(date) {
    return [
      {
        name: 'Oats, berries and yogurt',
        time: '08:10',
        calories: 520,
        proteinG: 32,
        carbsG: 66,
        fatG: 14,
        fiberG: 9,
        vegGrams: 0,
        fruitCups: 1.5,
        wholeGrainServings: 1,
        healthyOilPctOfCalories: 10,
        nutsGrams: 15,
        omega3Mg: 300,
        redMeatGrams: 0,
        processedMeatGrams: 0,
        alcoholGrams: 0,
        sodiumMg: 420,
        addedSugarG: 6,
        emoji: '🥣',
      },
      {
        name: 'Chicken, rice and greens',
        time: '13:05',
        calories: 890,
        proteinG: 68,
        carbsG: 92,
        fatG: 24,
        fiberG: 11,
        vegGrams: 190,
        fruitCups: 0,
        wholeGrainServings: 0,
        healthyOilPctOfCalories: 25,
        nutsGrams: 0,
        omega3Mg: 150,
        redMeatGrams: 0,
        processedMeatGrams: 0,
        alcoholGrams: 0,
        sodiumMg: 780,
        addedSugarG: 2,
        emoji: '🍗',
      },
      {
        name: 'Salmon, potatoes and salad',
        time: '19:40',
        calories: 894,
        proteinG: 84,
        carbsG: 82,
        fatG: 26,
        fiberG: 10,
        vegGrams: 210,
        fruitCups: 0.5,
        wholeGrainServings: 0,
        healthyOilPctOfCalories: 30,
        nutsGrams: 10,
        omega3Mg: 2200,
        redMeatGrams: 0,
        processedMeatGrams: 0,
        alcoholGrams: 0,
        sodiumMg: 640,
        addedSugarG: 3,
        source: 'bene',
        loggedVia: 'search',
        emoji: '🐟',
      },
    ].map((meal, i) => ({ ...meal, source: 'bene', id: `meal-${date}-${i}`, date }));
  }

  function strengthBlock(date) {
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

  const runs = [
    { kind: 'run', name: 'Threshold run', durationMin: 52, distanceKm: 9.4, avgHr: 154, maxHr: 172, calories: 610, zones: [6, 22, 14, 10, 0, 0] },
    { kind: 'run', name: 'Easy zone 2 run', durationMin: 45, distanceKm: 7.6, avgHr: 138, maxHr: 151, calories: 470, zones: [4, 18, 23, 0, 0, 0] },
    { kind: 'cycle', name: 'Tempo ride', durationMin: 61, distanceKm: 27.2, avgHr: 147, maxHr: 166, calories: 640, zones: [5, 16, 22, 18, 0, 0] },
  ];

  const days = {};
  const dayOrder = [];
  const journalEntries = [];

  dates.forEach((date, i) => {
    const p = nightFor(i);
    const isToday = date === latest;
    const run = runs[i % runs.length];
    // Two strength days a week. The muscular-load model needs 10 qualifying
    // days before it stops reporting "Calibrating".
    const strength = i % 3 !== 2;
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
      ...(strength ? [strengthBlock(date)] : []),
      ...(i % 9 === 4
        ? [
            {
              id: `w-hiit-${date}`,
              kind: 'hiit',
              name: 'Kettlebell conditioning',
              date,
              start: at(date, '18:10'),
              durationMin: 28,
              distanceKm: null,
              avgHr: 141,
              maxHr: 168,
              calories: 320,
              strain: 9.8,
              source: 'Bene Ring',
              imported: false,
              zoneMinutes: [3, 8, 11, 6, 0, 0],
            },
          ]
        : []),
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
      sleep: night(date, p),
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
      // Today is shot mid-morning, so it only has the first meal and the run.
      meals: isToday ? meals(date).slice(0, 2) : meals(date),
      journal,
    };
    dayOrder.push(date);
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
    phenoAge: MARKERS.includes(id),
    recordedAt: dates[0],
  }));

  const journalTags = [
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
    {
      id: 'chat-2',
      title: 'Plan my training week',
      createdAt: at(dates[9], '18:20'),
      updatedAt: at(dates[9], '18:24'),
      ghost: false,
      pinned: false,
      model: 'standard',
      messages: [
        { id: 'm-3', role: 'user', text: 'Plan my training week', at: at(dates[9], '18:20') },
        {
          id: 'm-4',
          role: 'assistant',
          text: 'You averaged 23 minutes of zone 2 a day this week. Add one 45-minute easy run on Wednesday and keep the threshold session on Saturday. Strength on Tuesday and Friday lines up with your best recovery days.',
          at: at(dates[9], '18:23'),
          followUps: ['Move the threshold session', 'Add a rest day'],
        },
      ],
    },
  ];

  const workoutsRoutine = {
    id: 'routine-1',
    name: 'Threshold intervals',
    subtitle: '4 × 8 min at threshold',
    kind: 'run',
    durationMin: 46,
    blocks: [
      { id: 'b-1', kind: 'warmup', title: 'Warm-up', durationMin: 10, target: 'Zone 2' },
      { id: 'b-2', kind: 'repeat', title: 'Threshold', durationMin: 32, repeats: 4, target: 'Zone 4' },
      { id: 'b-3', kind: 'cooldown', title: 'Cool-down', durationMin: 4, target: 'Zone 1' },
    ],
    exercises: [],
    scheduledDates: [dates[dates.length - 2], latest],
    completedDates: [dates[dates.length - 2]],
    skippedDates: [],
  };

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
      theme: 'system',
      onboarded: true,
      demoMode: false,
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
      autoBackup: false,
      lastBackupAt: null,
    },
    days,
    dayOrder,
    journalTags,
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
      {
        id: 'rec-2',
        name: 'VO2 max test.pdf',
        kind: 'document',
        uploadedAt: at(dates[6], '11:05'),
        status: 'ready',
        sizeKb: 96,
        biomarkerCount: 0,
      },
    ],
    chats,
    routines: [workoutsRoutine],
    activityEvents: [],
    seededAt: at(latest, '06:30'),
  };
}

const MARKERS = ['albumin', 'creatinine', 'glucose', 'crp', 'lymphocyte', 'mcv', 'rdw', 'alp', 'wbc'];

const screens = [
  ['home', '/'],
  ['recovery', '/recovery'],
  ['sleep', '/sleep'],
  ['strain', '/strain'],
  ['fitness', '/fitness'],
  ['journal', '/journal'],
  ['biology', '/biology'],
  ['nutrition', '/nutrition'],
  ['intelligence', '/intelligence'],
];

// SHOT_THEME=light|dark captures one theme; unset captures both in one run.
const THEME_FILTER = process.env.SHOT_THEME;
const themes = THEME_FILTER ? [THEME_FILTER] : ['light', 'dark'];

const errors = [];

// Everything the app prints as "now" is read from the real clock, so a run at
// 12:08 and one at 12:12 differ in "Last updated at" text. Pinning the clock
// (same way the fixture is pinned) makes two runs on the same day identical.
const HHMM = process.env.SHOT_TIME || '09:42';

const clockSource = (hhmm) => `(() => {
  const [h, m] = ${JSON.stringify(hhmm)}.split(':').map(Number);
  const RealDate = Date;
  class PinnedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        const now = new RealDate();
        super(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      } else {
        super(...args);
      }
    }
    static now() {
      return new PinnedDate().getTime();
    }
  }
  window.Date = PinnedDate;
})();`;

async function seed(page, theme) {
  const state = seedState((date, hhmm) => new Date(`${date}T${hhmm}:00`));
  state.settings.theme = theme;
  await page.evaluate(
    ([key, payload]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(payload));
    },
    [STORE_KEY, { state, version: 1 }],
  );
  await page.addInitScript(clockSource(HHMM));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const applied = await page.evaluate(() => document.documentElement.dataset.theme);
  if (applied !== theme) throw new Error(`theme did not apply: expected ${theme}, got ${applied ?? 'none'}`);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
      })
      .slice(0, 6)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(el.getBoundingClientRect().right)} left=${Math.round(el.getBoundingClientRect().left)}`,
      );
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
  });
}

async function capture(page, theme) {
  for (const [name, route] of screens) {
    const file = theme === 'dark' ? `dark-${name}` : name;
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${file}.png` });
    const metrics = await overflow(page);
    const flag = metrics.scrollWidth > metrics.clientWidth ? ' OVERFLOW' : '';
    console.log(file.padEnd(18), route.padEnd(13), `${metrics.scrollWidth}/${metrics.clientWidth}${flag}`, JSON.stringify(metrics.offenders));
  }
}

// Playwright's own browser may not be downloaded (CI images often ship a system
// Chromium instead). Honour an explicit path, otherwise let Playwright resolve.
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH || undefined;
const launchOptions = { args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] };
if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  for (const theme of themes) {
    // ThemeSync reads settings.theme from the persisted store, so a theme change
    // is a re-seed plus a reload rather than a DOM poke that React would undo.
    await seed(page, theme);
    await capture(page, theme);
  }
} catch (error) {
  errors.push(`fatal: ${error.message}`);
}

console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exitCode = errors.length ? 1 : 0;
