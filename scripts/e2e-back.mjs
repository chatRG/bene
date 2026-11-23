import { chromium } from 'playwright';
import { seed } from './fixture.mjs';

/**
 * The back gesture belongs to the app, not to the web view.
 *
 * A web view's back button undoes browsing: it walks the history, which
 * includes every tab the person visited. An app's back button goes up one
 * screen, and at the top of the app it asks before closing. These checks press
 * the same entry point MainActivity calls (`window.__beneBack`) so the rules are
 * tested where they live, and the app's own history is read to prove that tab
 * switches no longer leave anything behind.
 *
 * The activity cannot be finished from a browser, so "closes the app" is the
 * answer 'exit' — that is the string MainActivity acts on.
 */

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const results = [];
const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`);

/** One hardware back press, as MainActivity asks it. */
const pressBack = async () => {
  const answer = await page.evaluate(() => (window.__beneBack ? window.__beneBack() : 'no-bridge'));
  await page.waitForTimeout(260);
  return answer;
};
const where = () => page.evaluate(() => location.hash || '#/');
const sheetOpen = () => page.evaluate(() => Boolean(document.querySelector('.sheet')));
const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent ?? null);
const historyIndex = () => page.evaluate(() => history.state?.idx ?? null);

/** A cold start on a route, the way the app opens from the launcher. */
const launch = async (route) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await seed(page);

// 1. Tabs are switched, not stacked. Back on a tab asks to close the app and
// does not return to the tab that was open before it.
await page.locator('.navbar .nav-item:has-text("Fitness")').click();
await page.waitForTimeout(200);
await page.locator('.navbar .nav-item:has-text("Journal")').click();
await page.waitForTimeout(200);
await page.locator('.navbar .nav-item:has-text("Coach")').click();
await page.waitForTimeout(200);
check('tab switches leave no history to walk', (await historyIndex()) === 0, `idx=${await historyIndex()}`);
const first = await pressBack();
const ask = await toastText();
check('a tab takes the press instead of leaving at once', first === 'handled', `answer=${first}`);
check('the press asks first', (ask || '').includes('Press back again'), `toast=${ask}`);
check('nothing moved', (await where()) === '#/intelligence', await where());
check('the second press closes the app', (await pressBack()) === 'exit');

// 2. A screen opened from a tab goes up one screen; the tab under it then asks.
await launch('/');
await page.locator('.score-card__col').nth(1).click();
await page.waitForTimeout(300);
check('recovery opened', (await where()) === '#/recovery', await where());
check('back goes up one screen', (await pressBack()) === 'handled');
check('landed on home', (await where()) === '#/', await where());
check('home asks before closing', (await pressBack()) === 'handled' && (await pressBack()) === 'exit');

// 3. A sheet takes the press first: the screen underneath is not left.
await page.waitForTimeout(2400); // let the previous toast go, so it cannot be read as a new one
await page.locator('.status-chip').click();
await page.waitForTimeout(250);
check('sheet is open', await sheetOpen());
check('back closes the sheet', (await pressBack()) === 'handled');
check('sheet closed', !(await sheetOpen()));
check('still on home', (await where()) === '#/', await where());
check('closing a sheet does not ask to exit', !(await toastText()));

// 4. A deeper chain unwinds one screen at a time, in order.
await launch('/fitness');
await page.locator('.workout-row').first().click();
await page.waitForTimeout(300);
check('workout detail opened', (await where()).startsWith('#/workout/'), await where());
check('back to fitness', (await pressBack()) === 'handled' && (await where()) === '#/fitness', await where());
check('fitness asks, then closes', (await pressBack()) === 'handled' && (await pressBack()) === 'exit');

// 5. The header arrow goes up one screen too, and settings keeps its chain.
await launch('/');
await page.locator('button[aria-label="Profile"]').click();
await page.waitForTimeout(300);
check('profile opened', (await where()) === '#/profile', await where());
await page.locator('.list-row:has-text("Customization")').click();
await page.waitForTimeout(300);
check('settings section opened', (await where()) === '#/settings/general', await where());
await page.locator('.detail-head button[aria-label="Back"]').click();
await page.waitForTimeout(300);
check('the header arrow returns to profile', (await where()) === '#/profile', await where());
check('back from profile goes home', (await pressBack()) === 'handled' && (await where()) === '#/', await where());

// 6. A launch on a sub-screen has nothing behind it in the web view, and still
// goes up to its parent rather than doing nothing.
await launch('/sleep');
check('launched straight on sleep', (await where()) === '#/sleep', await where());
check('back goes up to home', (await pressBack()) === 'handled' && (await where()) === '#/', await where());
check('home then asks to close', (await pressBack()) === 'handled');

// 7. A chat is a screen over the Coach tab, not a second tab.
await launch('/intelligence');
await page.locator('button[aria-label="Chat history"]').click();
await page.waitForTimeout(300);
check('a sheet over a tab closes first', (await pressBack()) === 'handled' && !(await sheetOpen()));
await page.locator('button[aria-label="Chat history"]').click();
await page.waitForTimeout(300);
const thread = page.locator('.thread-row').first();
if (await thread.count()) {
  await thread.click();
  await page.waitForTimeout(350);
  check('chat opened', (await where()).startsWith('#/chat/'), await where());
  check('back leaves the chat', (await pressBack()) === 'handled' && (await where()) === '#/intelligence', await where());
  check('the coach tab then asks, then closes', (await pressBack()) === 'handled' && (await pressBack()) === 'exit');
} else {
  check('a chat thread exists to open', false);
}

// 8. Two presses in one frame are one gesture, not two screens.
await launch('/');
await page.locator('.score-card__col').nth(0).click();
await page.waitForTimeout(300);
const from = await where();
const answers = await page.evaluate(() => [window.__beneBack(), window.__beneBack()]);
await page.waitForTimeout(500);
check('two presses in one frame land one screen up', (await where()) === '#/', `from ${from}, answers=${answers.join(',')}`);

console.log(results.join('\n'));
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exitCode = results.some((r) => r.startsWith('FAIL')) || errors.length > 0 ? 1 : 0;
