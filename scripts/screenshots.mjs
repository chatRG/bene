import { chromium } from 'playwright';
import fs from 'node:fs';

const exe = '/opt/data/cache/playwright-browsers/chromium-1255/chrome-linux-arm64/chrome';
const out = 'docs/screenshots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByText('See a sample day').click();
await page.waitForTimeout(900);

const routes = [
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

for (const [name, route] of routes) {
  await page.goto(`http://localhost:5173/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(el.getBoundingClientRect().right)} left=${Math.round(el.getBoundingClientRect().left)}`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
  });
  console.log(name.padEnd(12), page.url().split('#')[1], JSON.stringify(metrics));
}

console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
