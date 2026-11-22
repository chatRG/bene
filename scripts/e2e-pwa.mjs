import { chromium } from 'playwright';
import fs from 'node:fs';
import { seed } from './fixture.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';

const SHOTS = process.env.SHOTS_DIR || 'shots-app';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
const failures = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(name); };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
// A fresh install is empty, so plant the shared fixture; the offline reload then
// has real scores to render from the service worker cache.
const fx = await seed(page);
console.log('fixture: days', fx.dayOrder.length);

const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.ready;
  return { supported: true, scope: reg.scope, active: !!reg.active };
});
console.log('service worker:', JSON.stringify(swReady));
check('service worker active', swReady.supported && swReady.active);

// Ensure the SW controls the page, then cut the network entirely.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
console.log('controlled:', controlled);
check('service worker controls page', controlled);
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const offlineHome = await page.locator('.score-card').count();
const offlineText = await page.locator('body').innerText();
console.log('offline home cards:', offlineHome);
check('offline home renders', offlineHome > 0);
console.log('offline has recovery:', offlineText.includes('Recovery'));
check('offline recovery visible', offlineText.includes('Recovery'));
console.log('offline has date:', offlineText.includes('Today'));
check('offline date visible', offlineText.includes('Today'));
await page.screenshot({ path: `${SHOTS}/offline.png` });
await context.setOffline(false);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
check('no console errors', errors.length === 0);
await browser.close();
process.exitCode = failures.length ? 1 : 0;
