import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
const failures = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(name); };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Continue', { exact: true }).click();
await page.waitForTimeout(250);
await page.getByText('Continue', { exact: true }).click();
await page.waitForTimeout(250);
await page.getByText('Start tracking', { exact: true }).click();
await page.waitForTimeout(700);

const state = await page.evaluate(() => JSON.parse(localStorage.getItem('bene-v1')).state);
const text = await page.locator('body').innerText();
console.log('days:', state.dayOrder.length);
check('one empty day', state.dayOrder.length === 1);
console.log('onboarded:', state.settings.onboarded);
check('onboarded', state.settings.onboarded === true);
console.log('demoMode:', state.settings.demoMode);
check('not demo mode', state.settings.demoMode === false);
console.log('home empty score:', text.includes('No data') || text.includes('—'));
check('home shows no data', text.includes('No data') || text.includes('—'));
console.log('empty timeline copy:', text.includes('Nothing logged yet'));
check('empty timeline copy', text.includes('Nothing logged yet'));
console.log('profile demo badge absent:', !text.includes('Demo dataset'));
check('no demo badge', !text.includes('Demo dataset'));
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
check('no console errors', errors.length === 0);
await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
console.log('profile demo badge absent after nav:', !(await page.locator('body').innerText()).includes('Demo dataset'));
await page.goto(`${BASE}/#/fitness`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const fitnessText = await page.locator('body').innerText();
check('fitness tab renders for empty user', fitnessText.includes('No routines yet') && !fitnessText.includes('Cannot read properties'));
await browser.close();
process.exitCode = failures.length ? 1 : 0;
