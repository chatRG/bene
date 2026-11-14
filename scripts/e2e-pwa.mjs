import { chromium } from 'playwright';

const exe = '/opt/data/cache/playwright-browsers/chromium-1255/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('See a sample day').click();
await page.waitForTimeout(800);

const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.ready;
  return { supported: true, scope: reg.scope, active: !!reg.active };
});
console.log('service worker:', JSON.stringify(swReady));

// Ensure the SW controls the page, then cut the network entirely.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
console.log('controlled:', controlled);
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const offlineHome = await page.locator('.score-card').count();
const offlineText = await page.locator('body').innerText();
console.log('offline home cards:', offlineHome);
console.log('offline has recovery:', offlineText.includes('Recovery'));
console.log('offline has date:', offlineText.includes('Today'));
await page.screenshot({ path: '/opt/data/cache/scratch/bevel/shots-app/offline.png' });
await context.setOffline(false);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
