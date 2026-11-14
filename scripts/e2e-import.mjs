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
await page.getByText('See a sample day').click();
await page.waitForTimeout(600);
await page.goto('http://localhost:5173/#/settings/data', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('input[type=file]').setInputFiles('/opt/data/bene/scripts/fixtures/apple-health-export.xml');
await page.getByText('Apple Health import').waitFor({ timeout: 10000 });
const body = await page.locator('body').innerText();
console.log('summary sheet:', body.includes('Sleep sessions') && body.includes('Date range'));
await page.getByText('Replace dashboard data').click();
await page.waitForTimeout(900);

const state = await page.evaluate(() => JSON.parse(localStorage.getItem('bene-v1')).state);
console.log('day count:', state.dayOrder.length);
console.log('demoMode:', state.settings.demoMode);
console.log('steps 11-13:', state.days['2026-11-13']?.metrics.steps);
console.log('workouts 11-13:', state.days['2026-11-13']?.workouts?.length);
console.log('awake sleep 11-14:', state.days['2026-11-14']?.sleep?.stages?.some((s) => s.stage === 'awake'));
console.log('errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
