/**
 * Store screenshots.
 *
 * Renders the six-slide App Store deck from the captures in
 * `docs/screenshots/`, at 1290 × 2796 — the 6.9 inch iPhone size App Store
 * Connect asks for. Both themes come from the same document, so the light and
 * the dark deck can never drift apart.
 *
 * Output:
 *   docs/screenshots/store/light-NN-*.png     full size, per slide
 *   docs/screenshots/store/dark-NN-*.png
 *   docs/screenshots/store/preview-light.png  README strip, 352 px per slide
 *   docs/screenshots/store/preview-dark.png
 *
 * The slides borrow the app's own tokens from `src/styles/base.css`: page,
 * card, ink, muted, hairline, the oxide accent and the Allo face. A store slide
 * is presented as another page of the same paper the product is printed on.
 *
 * Copy rules: one idea per slide, one accented key word, sentence case, and
 * every claim traceable to the docs. The marker `{em:word}` accents the word
 * already written immediately before it.
 *
 * Usage: bun run shots:store
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';

const APP = path.resolve(import.meta.dirname, '..');
const OUT = path.join(APP, 'docs/screenshots/store');
const SHOTS = path.join(APP, 'docs/screenshots');

const W = 1290;
const H = 2796;
const PREVIEW_W = 352;

const THEMES = {
  light: {
    bg: '#f1ece2',
    card: '#faf7f0',
    card2: '#f5f1e8',
    text: '#1c1a16',
    text2: '#4b463c',
    muted: '#6b6355',
    hairline: 'rgba(28, 26, 22, 0.10)',
    accent: '#a6402a',
    print: 'rgba(28, 26, 22, 0.032)',
    shadow: '0 70px 130px -50px rgba(60, 50, 32, 0.38), 0 20px 46px -26px rgba(60, 50, 32, 0.26)',
    mark: 'brand/final/symbol-ink.svg',
  },
  dark: {
    bg: '#16140f',
    card: '#211d16',
    card2: '#262119',
    text: '#efe9de',
    text2: '#c6bcab',
    muted: '#9a9080',
    hairline: 'rgba(239, 233, 222, 0.12)',
    accent: '#dc8266',
    print: 'rgba(239, 233, 222, 0.038)',
    shadow: '0 70px 130px -50px rgba(0, 0, 0, 0.85), 0 20px 46px -26px rgba(0, 0, 0, 0.7)',
    mark: 'brand/final/symbol-white.svg',
  },
};

/**
 * `capture` names a PNG in docs/screenshots with no theme prefix; the dark
 * deck reads `dark-<capture>.png`. `layout` is `stacked` (copy, then one large
 * device), `duo` (two phones, fanned) or `closer` (feature index, no device).
 */
const SLIDES = [
  {
    id: '01-hero',
    index: '01 / 06',
    headline: ['Every score,', 'finally yours{em:yours}.'],
    note: 'Recovery, sleep, strain and biology on one page. No account, no cloud.',
    capture: 'home',
    layout: 'stacked',
  },
  {
    id: '02-data',
    index: '02 / 06',
    headline: ['Your data never', 'leaves the device{em:device}.'],
    note: 'No account. No telemetry. No network call. Aeroplane mode is the normal case.',
    capture: 'recovery',
    layout: 'stacked',
  },
  {
    id: '03-model',
    index: '03 / 06',
    headline: ['One model,', 'not five silos{em:silos}.'],
    note: 'Sleep, strain and nutrition feed each other, so the advice is the sum.',
    capture: 'fitness',
    layout: 'stacked',
  },
  {
    id: '04-work',
    index: '04 / 06',
    headline: ['See the work{em:work}', 'behind the score.'],
    note: 'Every number opens into the readings, baselines and weights that built it.',
    capture: 'biology',
    layout: 'stacked',
  },
  {
    id: '05-account',
    index: '05 / 06',
    headline: ['One file is', 'your account{em:account}.'],
    note: 'A plain-JSON snapshot, written daily and verified before any restore.',
    capture: 'nutrition',
    layout: 'duo',
  },
  {
    id: '06-closer',
    index: '06 / 06',
    headline: ['Wellness,', 'not a subscription{em:subscription}.'],
    note: '',
    capture: null,
    layout: 'closer',
  },
];

/* -------------------------------------------------------------------------- */
/* markup                                                                      */
/* -------------------------------------------------------------------------- */

const dec = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `{em:word}` accents the word already written immediately before it, so the
 * author writes the sentence plainly and marks the emphasis in place:
 *   'finally yours{em:yours}.' → 'finally <em>yours</em>.'
 * The marker consumes the word; it must never print it a second time.
 */
function rich(text) {
  const parts = text.split(/(\{em:([^}]+)\})/g); // [text, marker, word, text, ...]
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    const chunk = parts[i] ?? '';
    const word = parts[i + 2];
    if (word === undefined) {
      out += dec(chunk);
      break;
    }
    const trimmed = chunk.endsWith(word) ? chunk.slice(0, -word.length) : chunk;
    out += `${dec(trimmed)}<em>${dec(word)}</em>`;
  }
  return out;
}

const lines = (slide) => slide.headline.map((line) => `<span>${rich(line)}</span>`).join('');

function device(theme, capture, cls = '') {
  if (!capture) return '';
  const file = theme === 'dark' ? `dark-${capture}.png` : `${capture}.png`;
  return `
    <div class="device ${cls}">
      <div class="device-body"><img src="${SHOTS}/${file}" alt="" /></div>
    </div>`;
}

const eyebrow = (slide) => `
    <div class="eyebrow">
      <span class="eyebrow-rule"></span>
      <span class="eyebrow-text">${slide.index}</span>
    </div>`;

const note = (slide) => (slide.note ? `<p class="note">${dec(slide.note)}</p>` : '');

function featureWall() {
  const items = [
    ['Recovery', 'HRV, resting HR, sleep and load, in one reading'],
    ['Sleep', 'Stages, need, debt and a 7-day bank'],
    ['Strain', 'Cardio and muscular load, against a daily target'],
    ['Nutrition', 'Calories, macros and 11 quality contributors'],
    ['Journal', 'Tags that correlate after 5 + 5 entries'],
    ['Biology', 'A ± 3 year estimate and its contributors'],
    ['Coach', 'Composed on device, from your own numbers'],
  ];
  return `<ul class="wall">${items
    .map(
      ([name, detail]) =>
        `<li class="wall-row"><span class="wall-name">${name}</span><span class="wall-detail">${detail}</span></li>`,
    )
    .join('')}</ul>`;
}

function body(slide, theme) {
  const copy = `
          <div class="stack-copy">
            ${eyebrow(slide)}
            <h1 class="headline">${lines(slide)}</h1>
            ${note(slide)}
          </div>`;
  switch (slide.layout) {
    case 'stacked':
      return `${copy}
          <div class="stack-stage">
            <div class="stage-print"></div>
            ${device(theme, slide.capture, 'device-md')}
          </div>`;
    case 'duo':
      return `${copy}
          <div class="duo-stage">
            ${device(theme, 'journal', 'device-sm back')}
            ${device(theme, slide.capture, 'device-sm front')}
          </div>`;
    case 'closer':
      return `
          <div class="closer-copy">
            ${eyebrow(slide)}
            <h1 class="headline closer-headline">${lines(slide)}</h1>
            ${featureWall()}
          </div>`;
    default:
      throw new Error(`unknown layout: ${slide.layout}`);
  }
}

function slideHTML(slide, theme) {
  const t = THEMES[theme];
  return `
    <section class="slide" data-theme="${theme}" id="${theme}-${slide.id}" style="
      --bg:${t.bg}; --card:${t.card}; --card2:${t.card2}; --text:${t.text};
      --text2:${t.text2}; --muted:${t.muted}; --hairline:${t.hairline};
      --accent:${t.accent}; --print:${t.print}; --device-shadow:${t.shadow};
      background:${t.bg}; color:${t.text};">
      <header class="chrome">
        <img class="chrome-mark" src="${APP}/${t.mark}" alt="" />
        <span class="chrome-name">Bene</span>
        <span class="chrome-spacer"></span>
        <span class="chrome-tag">Local-first health</span>
      </header>
      <div class="rule"></div>
      ${body(slide, theme)}
      <footer class="colophon">
        <span>Bene</span><span class="dot"></span><span>Source available</span>
      </footer>
    </section>`;
}

function documentHTML(preview = false) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Allo';
    src: url('${APP}/src/assets/fonts/AlloVariable.woff2') format('woff2');
    font-weight: 100 900; font-style: normal; font-display: block;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Allo', system-ui, sans-serif; background: #000; -webkit-font-smoothing: antialiased; }

  .slide {
    position: relative; width: ${W}px; height: ${H}px;
    overflow: hidden; display: flex; flex-direction: column;
    padding: 0 96px 150px;
  }
  /* laboratory ruling, barely there */
  .slide::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background-image: repeating-linear-gradient(to bottom, var(--print) 0 1px, transparent 1px 46px);
  }

  .chrome { position: relative; z-index: 4; display: flex; align-items: center; gap: 18px; padding: 86px 0 24px; }
  .chrome-mark { width: 44px; height: 44px; display: block; }
  .chrome-name { font-size: 38px; font-weight: 570; }
  .chrome-spacer { flex: 1; }
  .chrome-tag { font-size: 22px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
  .rule { position: relative; z-index: 4; height: 1px; background: var(--hairline); }

  .eyebrow { display: flex; align-items: center; gap: 20px; margin-bottom: 38px; }
  .eyebrow-rule { width: 68px; height: 2px; background: var(--accent); }
  .eyebrow-text { font-size: 25px; font-weight: 560; letter-spacing: 0.2em; color: var(--muted); font-variant-numeric: tabular-nums; }

  .headline { font-size: 122px; line-height: 1.04; font-weight: 600; letter-spacing: -0.03em; }
  .headline span { display: block; }
  .headline em { font-style: normal; color: var(--accent); }
  .closer-headline { font-size: 112px; }

  .note { margin-top: 32px; max-width: 930px; font-size: 33px; line-height: 1.42; font-weight: 430; color: var(--text2); }

  .stack-copy { position: relative; z-index: 3; padding-top: 126px; }
  .stack-stage { position: relative; z-index: 2; margin-top: 84px; display: flex; justify-content: center; }
  .stage-print {
    position: absolute; left: 40px; top: -130px; width: 660px; height: 660px;
    border: 1px solid var(--hairline); border-radius: 50%; z-index: 0;
  }

  .device { position: relative; z-index: 2; }
  .device-body {
    position: relative; padding: 11px; border-radius: 72px;
    background: var(--card); border: 1px solid var(--hairline);
    box-shadow: var(--device-shadow);
  }
  .device-body img { display: block; width: 100%; height: auto; border-radius: 62px; }
  .device-md { width: 640px; }

  .duo-stage { position: relative; z-index: 2; margin-top: 96px; height: 900px; }
  .duo-stage .device { position: absolute; }
  .device-sm { width: 560px; }
  .duo-stage .back { left: 22px; top: 0; transform: rotate(-5deg); }
  .duo-stage .front { right: 22px; top: 92px; transform: rotate(4deg); z-index: 3; }

  .closer-copy { position: relative; z-index: 3; padding-top: 236px; }
  .wall { list-style: none; margin-top: 84px; border-top: 1px solid var(--hairline); }
  .wall-row { display: flex; align-items: baseline; gap: 38px; padding: 70px 0 68px; border-bottom: 1px solid var(--hairline); }
  .wall-name { flex: 0 0 286px; width: 286px; font-size: 46px; font-weight: 600; letter-spacing: -0.02em; }
  .wall-detail { font-size: 29px; line-height: 1.32; font-weight: 430; color: var(--muted); }

  .colophon {
    position: absolute; left: 96px; right: 96px; bottom: 58px; z-index: 5;
    display: flex; align-items: center; gap: 16px;
    font-size: 21px; font-weight: 520; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }

  ${preview
    ? `.strip { width: ${PREVIEW_W}px; }
       .strip .slide {
         width: ${PREVIEW_W}px;
         height: ${Math.round(H * (PREVIEW_W / W))}px;
         padding: 0;
         transform: scale(${PREVIEW_W / W});
         transform-origin: top left;
       }`
    : ''}
</style></head>
<body${preview ? ' class="preview"' : ''}>
${['light', 'dark']
  .map(
    (theme) =>
      `<div id="deck-${theme}">${SLIDES.map((slide) => slideHTML(slide, theme)).join('\n')}</div>`,
  )
  .join('\n')}
</body></html>`;
}

/* -------------------------------------------------------------------------- */

// Same rule as scripts/screenshots.mjs: a system Chromium is enough, so honour
// an explicit path when the Playwright browser bundle is not installed.
const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH || undefined;
const launchOptions = {
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
};
if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 20000 },
  );
}

async function main() {
  // Fail loudly if a capture the deck names is not on disk.
  const present = new Set(await readdir(SHOTS));
  const missing = SLIDES.flatMap((slide) => {
    if (!slide.capture) return [];
    const extra = slide.layout === 'duo' ? ['journal'] : [];
    return [...new Set([slide.capture, ...extra])].flatMap((name) => [`${name}.png`, `dark-${name}.png`]);
  }).filter((file) => !present.has(file));
  if (missing.length) {
    throw new Error(`missing captures in docs/screenshots: ${missing.join(', ')}`);
  }

  await mkdir(OUT, { recursive: true });
  const deckFile = path.join(OUT, '.deck.html');
  const previewFile = path.join(OUT, '.preview.html');
  await writeFile(deckFile, documentHTML(false));
  await writeFile(previewFile, documentHTML(true));

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`file://${deckFile}`);
  await settle(page);

  const written = [];
  for (const theme of ['light', 'dark']) {
    for (const slide of SLIDES) {
      const element = await page.$(`#${theme}-${slide.id}`);
      const file = path.join(OUT, `${theme}-${slide.id}.png`);
      await element.screenshot({ path: file });
      written.push(path.relative(APP, file));
    }
  }

  // The preview strips are the six full-size slides of one theme, captured as
  // one element (the page's own layout box, so nothing is clipped), then
  // downscaled to README width in the browser. Playwright's element capture
  // ignores `scale`, so the resize is done explicitly rather than guessed at.
  for (const theme of ['light', 'dark']) {
    const handle = await page.$(`#deck-${theme}`);
    const full = await handle.screenshot({ type: 'png' });
    const scaled = await page.evaluate(
      async ({ base64, width }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${base64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round((img.naturalHeight * width) / img.naturalWidth);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { base64: full.toString('base64'), width: PREVIEW_W },
    );
    const file = path.join(OUT, `preview-${theme}.png`);
    await writeFile(file, Buffer.from(scaled, 'base64'));
    written.push(path.relative(APP, file));
  }

  await browser.close();
  await rm(deckFile, { force: true });
  await rm(previewFile, { force: true });
  console.log(written.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
