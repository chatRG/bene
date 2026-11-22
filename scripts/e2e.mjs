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

await page.goto(`${BASE}`, { waitUntil: 'networkidle' });

// A new install has no demo data, so the run plants the shared fixture instead
// of clicking through onboarding.
const fx = await seed(page);
const today = fx.dayOrder[fx.dayOrder.length - 1];

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

console.log(results.join('\n'));
console.log('\nCONSOLE ERRORS:', errors.length ? '\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'none');
console.log('EXTERNAL REQUESTS:', externalRequests.length ? externalRequests.slice(0, 5).join('\n') : 'none');
await browser.close();
process.exitCode = results.some((r) => r.startsWith('FAIL')) || errors.length > 0 || externalRequests.length > 0 ? 1 : 0;
