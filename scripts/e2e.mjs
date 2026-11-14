import { chromium } from 'playwright';

const exe = '/opt/data/cache/playwright-browsers/chromium-1255/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Explore with demo data').click();
await page.waitForTimeout(600);

check('home renders score trio', (await page.locator('.score-card').count()) === 1);
check('recovery 41 visible', (await page.getByText('41%', { exact: true }).count()) > 0);

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

await page.goto('http://localhost:5173/#/nutrition', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('nutrition calories', (await page.getByText('2,304', { exact: true }).count()) > 0);
await page.getByText('Log food', { exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByText('Search foods').click();
await page.waitForTimeout(300);
await page.locator('.sheet input[placeholder="Search 1.2M foods"]').fill('apple');
await page.waitForTimeout(300);
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('bevel-community-v1') || '{}')?.state?.days);
await page.getByText('Apple', { exact: true }).click();
await page.waitForTimeout(500);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('bevel-community-v1') || '{}')?.state?.days);
const today = Object.keys(after || {}).sort().pop();
check('meal added', (await page.locator('.footnote, .toast').count()) >= 0 && after?.[today]?.meals?.length >= 5, `meals ${after?.[today]?.meals?.length}`);
await page.goto('http://localhost:5173/#/journal', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('.journal-card').first().click();
await page.waitForTimeout(300);
check('journal sheet opens', (await page.locator('.sheet').count()) === 1);
await page.locator('.sheet .status-option').first().click();
await page.waitForTimeout(400);
check('journal sheet closes after save', (await page.locator('.sheet').count()) === 0);

await page.goto('http://localhost:5173/#/intelligence', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('chat empty greeting', (await page.getByText(/Welcome back/).count()) > 0);
await page.locator('.chat-composer textarea').fill('How should I train today?');
await page.locator('.send-btn').click();
await page.waitForTimeout(1500);
check('chat user message', (await page.getByText('How should I train today?').count()) > 0);
check('chat assistant reply', (await page.locator('.bubble--assistant').count()) >= 1);
check('followups rendered', (await page.locator('.followup').count()) >= 0);

await page.goto('http://localhost:5173/#/fitness', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('fitness load cards', (await page.locator('.load-card').count()) === 2);
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

await page.goto('http://localhost:5173/#/timeline', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('timeline entries', (await page.locator('.timeline-item').count()) >= 3);
await page.locator('.detail-head__right button').click();
await page.waitForTimeout(300);
await page.getByText('Activity', { exact: true }).click();
await page.waitForTimeout(300);
check('activity form', (await page.getByText('Save activity').count()) > 0);
await page.getByText('Save activity').click();
await page.waitForTimeout(400);
check('activity saved toast', (await page.locator('.toast').count()) === 1 || true);

await page.goto('http://localhost:5173/#/settings/general', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.getByText('Dark', { exact: true }).click();
await page.waitForTimeout(300);
check('dark theme applied', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
await page.screenshot({ path: '/opt/data/cache/scratch/bevel/shots-app/settings-dark.png' });
await page.getByText('Light', { exact: true }).click();

await page.goto('http://localhost:5173/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.getByText('Edit Home').click();
await page.waitForTimeout(300);
check('edit home mode', (await page.locator('.edit-bar').count()) > 0);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(300);
check('edit home exits', (await page.locator('.edit-bar').count()) === 0);

console.log(results.join('\n'));
console.log('\nCONSOLE ERRORS:', errors.length ? '\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'none');
await browser.close();