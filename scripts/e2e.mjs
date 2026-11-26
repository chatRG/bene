import { chromium } from 'playwright';
import fs from 'node:fs';
import { seed } from './fixture.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const SHOTS = process.env.SHOTS_DIR || 'shots-app';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const externalRequests = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.protocol.startsWith('http') && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') externalRequests.push(r.url());
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// A minimal native health bridge. It records every ask and returns an empty
// store, allowing startup sync to be tested without inventing health samples.
await page.addInitScript(() => {
  window.__healthCalls = [];
  window.CapacitorCustomPlatform = { name: 'ios' };
  const methods = ['isAvailable', 'requestAuthorization', 'checkAuthorization', 'readSamples', 'queryWorkouts', 'queryAggregated'];
  window.Capacitor = {
    PluginHeaders: [{ name: 'Health', methods: methods.map((name) => ({ name, rtype: 'promise' })) }],
    nativePromise: async (_plugin, method, options = {}) => {
      window.__healthCalls.push({ method, options });
      if (method === 'isAvailable') return { available: true };
      if (method === 'checkAuthorization' || method === 'requestAuthorization') {
        return { readAuthorized: options.read ?? [], readDenied: [] };
      }
      if (method === 'queryWorkouts') return { workouts: [] };
      return { samples: [] };
    },
  };
});

await page.goto(`${BASE}`, { waitUntil: 'networkidle' });

// A new install has no demo data, so the run plants the shared fixture instead
// of clicking through onboarding.
const fx = await seed(page);
const today = fx.dayOrder[fx.dayOrder.length - 1];

// Reload with a successful sync earlier today. Opening the app must check
// access once (including StrictMode's effect replay) and reread today only.
const previousHealthSync = await page.evaluate(() => {
  const key = 'bene-v1';
  const stored = JSON.parse(localStorage.getItem(key));
  const previous = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  stored.state.settings.lastHealthSyncAt = previous;
  localStorage.setItem(key, JSON.stringify(stored));
  return previous;
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const startupHealth = await page.evaluate(() => {
  const calls = window.__healthCalls;
  const starts = calls.filter((c) => ['readSamples', 'queryWorkouts', 'queryAggregated'].includes(c.method)).map((c) => c.options.startDate).filter(Boolean);
  const persisted = JSON.parse(localStorage.getItem('bene-v1')).state.settings.lastHealthSyncAt;
  return { checks: calls.filter((c) => c.method === 'checkAuthorization').length, starts, persisted };
});
const todayMidnight = await page.evaluate(() => new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
const previousMidnight = await page.evaluate(() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
});
const sleepLookbackMidnight = await page.evaluate(() => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
});
check('app open sync checks existing health access once', startupHealth.checks === 1, `checks ${startupHealth.checks}`);
check(
  'app open sync rereads from the previous calendar day',
  startupHealth.starts.length > 0 &&
    startupHealth.starts.includes(previousMidnight) &&
    startupHealth.starts.every((start) => start >= sleepLookbackMidnight && start <= todayMidnight),
  `${startupHealth.starts.length} reads`,
);
check('successful empty startup sync persists its cursor', typeof startupHealth.persisted === 'string' && startupHealth.persisted !== previousHealthSync);

// Expected values are recomputed from the fixture that was actually seeded, so
// these assertions describe the seeded app rather than a number from an old demo.
const expectedRecovery = await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('bene-v1')).state;
  const latest = [...store.dayOrder].sort().pop();
  const meals = store.days[latest].meals;
  return {
    meals: meals.length,
    calories: meals.reduce((sum, m) => sum + m.calories, 0),
    workouts: store.days[latest].workouts.length,
    routines: store.routines.map((r) => r.name),
    journal: store.days[latest].journal.length,
  };
});
const recoveryText = await page.locator('.score-card__col').nth(1).innerText();
const recoveryNumber = Number((recoveryText.match(/\b(\d{1,3})\b/) || [])[1]);
console.log('home: recovery', recoveryNumber);
console.log('fixture: days', fx.dayOrder.length, 'today', today);
console.log('fixture: today meals', expectedRecovery.meals, 'calories', expectedRecovery.calories, 'workouts', expectedRecovery.workouts);
console.log('fixture: routines', expectedRecovery.routines.join(', '));

check('home renders score trio', (await page.locator('.score-card').count()) === 1);
check('recovery score visible', Number.isFinite(recoveryNumber) && recoveryNumber > 0 && recoveryNumber <= 100, `recovery ${recoveryNumber}`);
check('recovery score is scored, not calibrating', !recoveryText.includes('Calibrating'), recoveryText.replace(/\n/g, ' / '));

await page.locator('.score-card__col').nth(1).click();
await page.waitForTimeout(400);
check('recovery route', page.url().endsWith('/recovery'));
check('recovery narrative shown', (await page.getByText('Time to take it easy').count()) > 0);
await page.goBack();
await page.waitForTimeout(300);

await page.locator('.score-card__col').nth(2).click();
await page.waitForTimeout(400);
check('sleep route', page.url().endsWith('/sleep'));
check('hypnogram present', (await page.locator('svg[aria-label="Sleep stages"]').count()) === 1);
const stageCards = await page.locator('.stage-card').count();
check('four stage cards', stageCards === 4, String(stageCards));
await page.goBack();
await page.waitForTimeout(300);

await page.goto(`${BASE}/#/nutrition`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const calorieLabel = expectedRecovery.calories.toLocaleString('en-US');
check('nutrition calories', (await page.getByText(calorieLabel, { exact: true }).count()) > 0, `${calorieLabel} kcal`);
await page.getByText('Log food', { exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByText('Search foods').click();
await page.waitForTimeout(300);
await page.locator('.sheet input[placeholder="Search 1.2M foods"]').fill('apple');
await page.waitForTimeout(300);
await page.getByText('Apple', { exact: true }).click();
await page.waitForTimeout(500);
const afterMeals = await page.evaluate(() => {
  const days = JSON.parse(localStorage.getItem('bene-v1') || '{}')?.state?.days;
  const key = Object.keys(days || {}).sort().pop();
  return { key, meals: days?.[key]?.meals?.length };
});
check('meal added', afterMeals.meals === expectedRecovery.meals + 1, `meals ${afterMeals.meals}`);

await page.goto(`${BASE}/#/journal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const journalCards = await page.locator('.journal-card').count();
check('journal cards', journalCards > 0, String(journalCards));
await page.locator('.journal-card').first().click();
await page.waitForTimeout(300);
check('journal sheet opens', (await page.locator('.sheet').count()) === 1);
await page.locator('.sheet .status-option').first().click();
await page.waitForTimeout(400);
check('journal sheet closes after save', (await page.locator('.sheet').count()) === 0);

await page.goto(`${BASE}/#/intelligence`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('chat empty greeting', (await page.getByText(/Welcome back/).count()) > 0);
await page.locator('.chat-composer textarea').fill('How should I train today?');
await page.locator('.send-btn').click();
await page.waitForTimeout(1500);
check('chat user message', (await page.getByText('How should I train today?').count()) > 0);
check('chat assistant reply', (await page.locator('.bubble--assistant').count()) >= 1);
check('followups rendered', (await page.locator('.followup').count()) >= 1);

await page.goto(`${BASE}/#/fitness`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('fitness load cards', (await page.locator('.load-card').count()) === 2);
check('tempo run routine listed', expectedRecovery.routines.includes('Tempo Run'));
await page.getByText('Tempo Run', { exact: true }).first().click();
await page.waitForTimeout(400);
check('routine page', page.url().includes('/workout/'));
check('start button present', (await page.getByText('Start', { exact: true }).count()) > 0);
await page.getByText('Start', { exact: true }).click();
await page.waitForTimeout(1200);
check('live timer shows', (await page.getByText('Live').count()) > 0);
await page.getByText('Finish', { exact: true }).click();
await page.waitForTimeout(500);
check('workout summary sheet', (await page.getByText('Workout saved').count()) > 0);

await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('timeline entries', (await page.locator('.timeline-item').count()) >= 3);
await page.locator('.detail-head__right button').click();
await page.waitForTimeout(300);
await page.getByText('Activity', { exact: true }).click();
await page.waitForTimeout(300);
check('activity form', (await page.getByText('Save activity').count()) > 0);
await page.getByText('Save activity').click();
await page.waitForTimeout(400);
check('activity saved toast', (await page.locator('.toast').count()) >= 1);

await page.goto(`${BASE}/#/settings/general`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.getByText('Dark', { exact: true }).click();
await page.waitForTimeout(300);
check('dark theme applied', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await page.screenshot({ path: `${SHOTS}/settings-dark.png` });
await page.getByText('Light', { exact: true }).click();

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.getByText('Edit Home').click();
await page.waitForTimeout(300);
check('edit home mode', (await page.locator('.edit-bar').count()) > 0);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(300);
check('edit home exits', (await page.locator('.edit-bar').count()) === 0);

// The date control belongs to Home itself: choosing a recorded past day must
// change the cards and any quick-log writes, rather than route to Timeline.
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(250);
const previousDate = fx.dayOrder[fx.dayOrder.length - 2];
const previousDay = new Date(`${previousDate}T12:00:00`);
const previousLabel = previousDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const previousShortDate = previousDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const previousLongDate = previousDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const previousNumericDate = previousDay.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
const previousWeekday = previousDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const previousCalories = fx.days[previousDate].meals.reduce((sum, meal) => sum + meal.calories, 0).toLocaleString('en-US');
await page.locator('.date-button').click();
await page.waitForTimeout(250);
const homeSheet = await page.locator('.sheet').boundingBox();
check(
  'Home date sheet is anchored to the viewport',
  !!homeSheet && homeSheet.y >= 0 && homeSheet.y + homeSheet.height <= 933 && homeSheet.x >= 0 && homeSheet.x + homeSheet.width <= 431,
  homeSheet ? JSON.stringify(homeSheet) : 'missing',
);
const homeDateInput = page.locator('.sheet input[type="date"]');
check('home date button opens a date selector', (await homeDateInput.count()) === 1);
if (await homeDateInput.count()) {
  check('home date selector excludes future dates', (await homeDateInput.getAttribute('max')) === today);
  await homeDateInput.fill(previousDate);
  await page.waitForTimeout(300);
  check('past date stays on Home', page.url().endsWith('#/'), page.url());
  check('past date appears in the Home heading', (await page.locator('.date-button').innerText()).includes(previousLabel), await page.locator('.date-button').innerText());
  check('Home cards use the selected day', (await page.locator('.nutrition-mini .mono-num').innerText()) === previousCalories, `${previousCalories} kcal`);
  await page.locator('.sheet [aria-label="Close"]').click();
  await page.waitForTimeout(150);
  const todayJournalValue = await page.evaluate((current) => {
    const days = JSON.parse(localStorage.getItem('bene-v1')).state.days;
    return days[current].journal.find((entry) => entry.tagId === 'alcohol')?.value;
  }, today);
  await page.locator('.journal-quick__row').first().locator('.yesno button').nth(1).click();
  await page.waitForTimeout(250);
  const journalAfterPastEdit = await page.evaluate(([key, current]) => {
    const days = JSON.parse(localStorage.getItem('bene-v1')).state.days;
    return {
      selected: days[key].journal.find((entry) => entry.tagId === 'alcohol')?.value,
      today: days[current].journal.find((entry) => entry.tagId === 'alcohol')?.value,
    };
  }, [previousDate, today]);
  check('quick journal writes to the selected past day', journalAfterPastEdit.selected === 'no', String(journalAfterPastEdit.selected));
  check('quick journal does not alter today while viewing the past', journalAfterPastEdit.today === todayJournalValue, String(journalAfterPastEdit.today));

  const cdp = await context.newCDPSession(page);
  const swipe = async (fromX, toX) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: 320 }] });
    for (let step = 1; step <= 6; step += 1) {
      const x = fromX + ((toX - fromX) * step) / 6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 320 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
  };
  const headingAfterGesture = async () => (await page.locator('.date-button').count()) ? page.locator('.date-button').innerText() : '';
  await page.evaluate(() => window.scrollTo(0, 0));
  await swipe(340, 60);
  check('left swipe advances Home to the next day', (await headingAfterGesture()).includes(`Today, ${new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`), await headingAfterGesture());
  if (!(await page.locator('.date-button').count())) await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await swipe(340, 60);
  check('left swipe on today does not enter the future', (await headingAfterGesture()).includes('Today,'), await headingAfterGesture());
  await page.locator('.date-button').click();
  await page.locator('.sheet input[type="date"]').fill(today);
  await page.locator('.sheet [aria-label="Close"]').click();
  await swipe(60, 340);
  check('right swipe returns Home to the previous day', (await headingAfterGesture()).includes(previousLabel), await headingAfterGesture());

  // Every day-scoped Home destination must carry the selected day, not just
  // the Home cards. Back returns to the same day as well.
  await page.locator('.score-card__col').nth(0).click();
  await page.waitForTimeout(300);
  check(
    'past Home strain card opens that day',
    page.url().includes(`date=${previousDate}`) && (await page.locator('.strain-score-line__date').innerText()).includes(previousShortDate),
    await page.locator('.strain-score-line__date').innerText(),
  );
  await page.goBack();
  await page.waitForTimeout(250);
  check('back returns Home to the selected day', (await page.locator('.date-button').innerText()).includes(previousLabel), await page.locator('.date-button').innerText());

  await page.locator('.score-card__col').nth(1).click();
  await page.waitForTimeout(300);
  check('past Home recovery card opens that day', (await page.locator('.recovery-page').innerText()).includes(previousLongDate));
  await page.goBack();
  await page.waitForTimeout(250);

  await page.locator('.score-card__col').nth(2).click();
  await page.waitForTimeout(300);
  check('past Home sleep card opens that night', (await page.locator('.detail-head__sub').innerText()).includes(previousNumericDate));
  await page.goBack();
  await page.waitForTimeout(250);

  await page.locator('.nutrition-mini').click();
  await page.waitForTimeout(300);
  check('past Home nutrition card opens that day', (await page.locator('.detail-head__sub').innerText()).includes(previousLongDate));
  await page.goBack();
  await page.waitForTimeout(250);

  await page.getByText('View timeline', { exact: true }).click();
  await page.waitForTimeout(300);
  check('past Home timeline opens that day', (await page.locator('.detail-head__sub').innerText()).includes(previousWeekday));
  await page.goBack();
  await page.waitForTimeout(250);

  await page.getByText('All tags', { exact: true }).click();
  await page.waitForTimeout(300);
  check('past Home journal opens that day', (await page.locator('.app-header .caption').innerText()).includes(previousWeekday));
  await page.goBack();
  await page.waitForTimeout(250);

  await page.locator('.fitness-mini').click();
  await page.waitForTimeout(300);
  check('past Home training opens that day', (await page.locator('.app-header .caption').innerText()).includes(previousWeekday));
  await page.goBack();
  await page.waitForTimeout(250);

  // A historical day is allowed to have no food or training logged. Those cards
  // must say so instead of presenting today's goals and all-time workouts as
  // measurements for that day.
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem('bene-v1'));
    stored.state.days[key].meals = [];
    stored.state.days[key].workouts = [];
    localStorage.setItem('bene-v1', JSON.stringify(stored));
  }, previousDate);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.locator('.date-button').click();
  await page.locator('.sheet input[type="date"]').fill(previousDate);
  await page.locator('.sheet [aria-label="Close"]').click();
  await page.waitForTimeout(200);
  check('nutrition does not invent zero intake for an unlogged day', (await page.locator('.nutrition-mini').innerText()).includes('No food logged'));
  check('training does not show all-time load on a rest day', (await page.locator('.fitness-mini').innerText()).includes('No sessions yet'));
} else {
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
}

// A transformed entrance child must not override a fixed sheet's centering.
// Check the complete action at a short phone viewport, not just the heading.
await page.setViewportSize({ width: 360, height: 640 });
await page.goto(`${BASE}/#/biology`, { waitUntil: 'networkidle' });
await page.locator('.bio-week-pill').click();
await page.waitForTimeout(450);
const bioSheetLayout = await page.locator('.sheet').evaluate((el) => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, right: rect.right, viewport: innerWidth };
});
check('Biological Age sheet fits the phone width', bioSheetLayout.left >= -1 && bioSheetLayout.right <= bioSheetLayout.viewport + 1, JSON.stringify(bioSheetLayout));
await page.locator('.sheet').evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(100);
const bioDone = page.getByRole('button', { name: 'Got it' });
const bioDoneBox = await bioDone.boundingBox();
check('Biological Age sheet scrolls to its full bottom action', !!bioDoneBox && bioDoneBox.y >= 0 && bioDoneBox.y + bioDoneBox.height <= 640 && bioDoneBox.x >= 0 && bioDoneBox.x + bioDoneBox.width <= 360, bioDoneBox ? JSON.stringify(bioDoneBox) : 'missing');
if (bioDoneBox && bioDoneBox.x >= 0 && bioDoneBox.x + bioDoneBox.width <= 360) {
  await bioDone.click();
  check('Biological Age sheet closes from the bottom action', (await page.locator('.sheet').count()) === 0);
}

console.log(results.join('\n'));
console.log('\nCONSOLE ERRORS:', errors.length ? '\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'none');
console.log('EXTERNAL REQUESTS:', externalRequests.length ? externalRequests.slice(0, 5).join('\n') : 'none');
await browser.close();
process.exitCode = results.some((r) => r.startsWith('FAIL')) || errors.length > 0 || externalRequests.length > 0 ? 1 : 0;
