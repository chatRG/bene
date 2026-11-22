/**
 * Contrast audit across every screen and every theme.
 *
 * Runs the app in a real browser, walks the rendered text nodes on each route,
 * and reports any that fall below WCAG 2.1 AA — 4.5:1 for body text, 3:1 for
 * large text (>=24px, or >=18.66px bold). Background colour is resolved by
 * walking up the tree for the first opaque ancestor, so text on a card is
 * measured against the card rather than the page.
 *
 * Two things make the difference between a real audit and a comforting one:
 *
 * 1. The theme is seeded into the persisted store on the origin *before* the
 *    app boots, then the page is reloaded so the store reads it. Forcing the
 *    data-theme attribute would measure a theme the app never applied.
 * 2. Every route is checked to have actually landed. A run where every route
 *    redirects to onboarding scans one screen many times and proves nothing,
 *    so a mismatch fails the audit instead of passing it.
 *
 * Both viewports run because the wide breakpoint has its own background rules.
 *
 * Usage: bun scripts/a11y-contrast.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173';
const THEMES = ['light', 'dark', 'midnight'];
const ROUTES = [
  '/',
  '/fitness',
  '/journal',
  '/biology',
  '/intelligence',
  '/nutrition',
  '/timeline',
  '/profile',
  '/settings',
  '/settings/general',
  '/settings/goals',
  '/settings/account',
  '/settings/data',
];
const VIEWPORTS = [
  { width: 430, height: 932, label: '430' },
  { width: 1024, height: 900, label: '1024' },
];

const SCAN = () => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length === 4 && p[3] < 0.5) return null;
    return [p[0], p[1], p[2]];
  };
  const effBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c) return c;
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const txt = (el.textContent || '').trim();
    if (!txt || el.children.length > 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    if (parseFloat(st.opacity) < 0.6) continue;
    const fg = parse(st.color);
    if (!fg) continue;

    const bg = effBg(el);
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    const size = parseFloat(st.fontSize);
    const bold = parseInt(st.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;

    if (ratio < need) {
      const key = `${st.color}|${txt.slice(0, 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        text: txt.slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        need,
        color: st.color,
        background: `rgb(${bg.join(',')})`,
      });
    }
  }
  return out;
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

let total = 0;
let misrouted = 0;
const report = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  for (const theme of THEMES) {
    for (const route of ROUTES) {
      // Seed, then reload: the store is built once per page load, so writing
      // storage after boot would be ignored.
      await page.goto(`${BASE}/favicon.svg`);
      await page.evaluate((t) => {
        localStorage.setItem(
          'bene-v1',
          JSON.stringify({
            state: {
              settings: {
                onboarded: true,
                theme: t,
                activeTabs: { fitness: true, journal: true, biology: true, nutrition: true },
              },
              profile: { name: 'Audit', birthDate: '1990-01-01', sex: 'other', heightCm: 175, weightKg: 70 },
            },
            version: 1,
          }),
        );
      }, theme);

      await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);

      const landed = await page.evaluate(() => location.hash);
      const applied = await page.evaluate(() => document.documentElement.dataset.theme || '(none)');
      if (landed !== `#${route}` || applied !== theme) {
        misrouted += 1;
        report.push({
          vp: vp.label,
          theme,
          route,
          bad: [{ mismatch: `landed ${landed}, theme ${applied}` }],
        });
        continue;
      }

      const bad = await page.evaluate(SCAN);
      if (bad.length) {
        total += bad.length;
        report.push({ vp: vp.label, theme, route, bad });
      }
    }
  }
  await context.close();
}

await browser.close();

for (const { vp, theme, route, bad } of report) {
  console.log(`\n[${vp}px] ${theme} ${route} — ${bad.length}`);
  for (const b of bad) {
    if (b.mismatch) {
      console.log(`  did not land where asked: ${b.mismatch}`);
    } else {
      console.log(`  ${b.ratio} (need ${b.need}) ${JSON.stringify(b.text)} ${b.color} on ${b.background}`);
    }
  }
}

if (misrouted) {
  console.log(`\n${misrouted} route(s) did not land where requested — the run is not measuring what it claims.`);
}

const ok = total === 0 && misrouted === 0;
console.log(
  ok
    ? '\nPASS: every screen meets WCAG AA in every theme at both widths'
    : `\nFAIL: ${total} contrast failures, ${misrouted} misrouted`,
);
process.exit(ok ? 0 : 1);
