import { chromium } from 'playwright';
import fs from 'node:fs';

const SCRATCH = '/opt/data/cache/scratch/bene';
fs.mkdirSync(SCRATCH, { recursive: true });

const exe = '/opt/data/cache/playwright-browsers/chromium-1255/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (n, ok, d = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`);

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('See a sample day').click();
await page.waitForTimeout(800);

const snapshot = await page.evaluate(() => localStorage.getItem('bene-snapshot'));
check('auto snapshot created', !!snapshot);
const lastBackup = await page.evaluate(() => JSON.parse(localStorage.getItem('bene-v1')).state.settings.lastBackupAt);
check('lastBackupAt recorded', !!lastBackup);

await page.goto('http://localhost:5173/#/settings/backup', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('backup screen shows protected', (await page.getByText('Protected').count()) > 0);
const downloadPromise = page.waitForEvent('download');
await page.getByText('Create backup', { exact: true }).click();
const download = await downloadPromise;
const dlPath = `${SCRATCH}/test-backup.json`;
await download.saveAs(dlPath);
check('backup downloaded', fs.existsSync(dlPath) && fs.statSync(dlPath).size > 1000, `${Math.round(fs.statSync(dlPath).size / 1024)} KB`);
const backupJson = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
check('backup schema', backupJson.app === 'bene' && backupJson.version === 1 && !!backupJson.data.days);

await page.goto('http://localhost:5173/#/settings/general', { waitUntil: 'networkidle' });
await page.getByText('Dark', { exact: true }).click();
await page.waitForTimeout(300);
check('theme dark before restore', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');

await page.goto('http://localhost:5173/#/settings/backup', { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
await page.getByText('Restore snapshot', { exact: true }).click();
await page.waitForTimeout(300);
await page.getByText('Restore backup', { exact: true }).click();
await page.waitForTimeout(700);
check('restore navigates home', page.url().endsWith('#/'), page.url());
check('theme restored to light', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');

// Import a backup file after a reset
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('See a sample day').click();
await page.waitForTimeout(500);
await page.goto('http://localhost:5173/#/settings/backup', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('input[type=file]').setInputFiles(dlPath);
await page.waitForTimeout(400);
check('import confirmation shows', (await page.getByText('Restore from file?').count()) > 0);
await page.getByText('Restore this file', { exact: true }).click();
await page.waitForTimeout(700);
check('import lands home', page.url().endsWith('#/'), page.url());

// Invalid backup
fs.writeFileSync(`${SCRATCH}/invalid-backup.json`, JSON.stringify({ app: 'nope', data: {} }));
await page.goto('http://localhost:5173/#/settings/backup', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(`${SCRATCH}/invalid-backup.json`);
await page.waitForTimeout(300);
await page.getByText('Restore this file', { exact: true }).click();
await page.waitForTimeout(400);
check('invalid backup rejected with toast', (await page.locator('.toast').count()) > 0);

// Tab visibility removes the tab entirely
await page.goto('http://localhost:5173/#/settings/general', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('button[aria-label="Journal"]').click();
await page.waitForTimeout(300);
await page.goto('http://localhost:5173/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const navLabels = await page.locator('.nav-item').allTextContents();
check('journal tab removed', !navLabels.some((l) => l.includes('Journal')), navLabels.join(','));
check('home journal card hidden', (await page.locator('.journal-quick').count()) === 0);

console.log(results.join('\n'));
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
