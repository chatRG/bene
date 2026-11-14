import { chromium } from 'playwright';

const exe = '/opt/data/cache/playwright-browsers/chromium-1255/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
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
console.log('onboarded:', state.settings.onboarded);
console.log('demoMode:', state.settings.demoMode);
console.log('home empty score:', text.includes('No data') || text.includes('—'));
console.log('empty timeline copy:', text.includes('Nothing logged yet'));
console.log('profile demo badge absent:', !text.includes('Demo dataset'));
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await page.goto('http://localhost:5173/#/profile', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
console.log('profile demo badge absent after nav:', !(await page.locator('body').innerText()).includes('Demo dataset'));
await browser.close();
