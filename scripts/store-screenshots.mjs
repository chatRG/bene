/**
 * Store screenshots.
 *
 * Renders three slides — two in the light theme and one in the dark — from the
 * captures in `docs/screenshots/`, at 1290 × 2796, the 6.9 inch iPhone size
 * App Store Connect asks for. Each slide carries its own theme, so the two
 * light slides and the dark one come out of the same document and stay in step.
 *
 * Output: docs/screenshots/store/<theme>-<id>.png
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
import { mkdir, writeFile, rm, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const APP = path.resolve(import.meta.dirname, '..');
const OUT = path.join(APP, 'docs/screenshots/store');
const SHOTS = path.join(APP, 'docs/screenshots');

const W = 1290;
const H = 2796;

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
    bezel: '#24211c',
    'bezel-edge': '#3a352d',
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
    /* On the dark page a black bezel disappears, so the frame is lifted to a
       graphite that still reads as hardware against #16140f. */
    bezel: '#33302a',
    'bezel-edge': '#4d483f',
    print: 'rgba(239, 233, 222, 0.038)',
    shadow: '0 70px 130px -50px rgba(0, 0, 0, 0.85), 0 20px 46px -26px rgba(0, 0, 0, 0.7)',
    mark: 'brand/final/symbol-white.svg',
  },
};

/**
 * Two light slides and one dark. `theme` decides which capture is used
 * (`<capture>.png` or `dark-<capture>.png`) and which palette the slide wears,
 * so the mistake of pairing a light frame with a dark capture cannot happen.
 */
const SLIDES = [
  {
    id: '01-hero',
    theme: 'light',
    index: '01 / 03',
    headline: ['Every score,', 'finally yours{em:yours}.'],
    note: 'Recovery, sleep, strain and biology on one page. No account, no cloud.',
    capture: 'home',
  },
  {
    id: '02-work',
    theme: 'light',
    index: '02 / 03',
    headline: ['See the work{em:work}', 'behind the score.'],
    note: 'Every number opens into the readings, baselines and weights that built it.',
    capture: 'biology',
  },
  {
    id: '03-model',
    theme: 'dark',
    index: '03 / 03',
    headline: ['One model,', 'not five silos{em:silos}.'],
    note: 'Sleep, strain and nutrition feed each other, so the advice is the sum.',
    capture: 'fitness',
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

function device(theme, capture) {
  const file = theme === 'dark' ? `dark-${capture}.png` : `${capture}.png`;
  return `
    <div class="device">
      <div class="device-body">
        <div class="device-screen">
          <img src="${SHOTS}/${file}" alt="" />
          <div class="device-notch"></div>
        </div>
      </div>
    </div>`;
}

function slideHTML(slide) {
  const t = THEMES[slide.theme];
  return `
    <section class="slide" id="${slide.theme}-${slide.id}" style="
      --bg:${t.bg}; --card:${t.card}; --card2:${t.card2}; --text:${t.text};
      --text2:${t.text2}; --muted:${t.muted}; --hairline:${t.hairline};
      --accent:${t.accent}; --print:${t.print}; --device-shadow:${t.shadow};
      --bezel:${t.bezel}; --bezel-edge:${t['bezel-edge']};
      background:${t.bg}; color:${t.text};">
      <header class="chrome">
        <img class="chrome-mark" src="${APP}/${t.mark}" alt="" />
        <span class="chrome-name">Bene</span>
        <span class="chrome-spacer"></span>
        <span class="chrome-tag">Local-first health</span>
      </header>
      <div class="rule"></div>
      <div class="copy">
        <div class="eyebrow">
          <span class="eyebrow-rule"></span>
          <span class="eyebrow-text">${slide.index}</span>
        </div>
        <h1 class="headline">${lines(slide)}</h1>
        <p class="note">${dec(slide.note)}</p>
      </div>
      <div class="stage">
        <div class="stage-print"></div>
        ${device(slide.theme, slide.capture)}
      </div>
      <footer class="colophon">
        <span>Bene</span><span class="dot"></span><span>Source available</span>
      </footer>
    </section>`;
}

function documentHTML() {
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

  .copy { position: relative; z-index: 3; padding-top: 126px; }
  .eyebrow { display: flex; align-items: center; gap: 20px; margin-bottom: 38px; }
  .eyebrow-rule { width: 68px; height: 2px; background: var(--accent); }
  .eyebrow-text { font-size: 25px; font-weight: 560; letter-spacing: 0.2em; color: var(--muted); font-variant-numeric: tabular-nums; }

  .headline { font-size: 122px; line-height: 1.04; font-weight: 600; letter-spacing: -0.03em; }
  .headline span { display: block; }
  .headline em { font-style: normal; color: var(--accent); }

  .note { margin-top: 32px; max-width: 930px; font-size: 33px; line-height: 1.42; font-weight: 430; color: var(--text2); }

  .stage { position: relative; z-index: 2; margin-top: 84px; display: flex; justify-content: center; }
  .stage-print {
    position: absolute; left: 40px; top: -130px; width: 660px; height: 660px;
    border: 1px solid var(--hairline); border-radius: 50%; z-index: 0;
  }

  /* The frame is drawn, not a bare rectangle: a bezel with its own tone, side
     keys and a camera cutout, so the capture reads as a phone rather than a
     floating panel. */
  .device { position: relative; z-index: 2; width: 640px; }
  .device-body {
    position: relative; padding: 14px; border-radius: 78px;
    background: var(--bezel);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.45),
      var(--device-shadow);
  }
  .device-body::before,
  .device-body::after {
    content: ''; position: absolute; width: 3px; border-radius: 2px;
    background: var(--bezel-edge);
  }
  .device-body::before { left: -2px; top: 208px; height: 96px; }
  .device-body::after { right: -2px; top: 172px; height: 150px; }
  .device-screen {
    position: relative; border-radius: 64px; overflow: hidden;
    background: var(--card2);
  }
  .device-screen img { display: block; width: 100%; height: auto; }
  .device-notch {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    width: 132px; height: 34px; border-radius: 18px;
    background: #000; z-index: 3;
  }
  .device-notch::after {
    content: ''; position: absolute; right: 16px; top: 50%;
    transform: translateY(-50%); width: 11px; height: 11px;
    border-radius: 50%; background: #10141a;
    box-shadow: inset 0 0 0 2px #05070a;
  }

  .colophon {
    position: absolute; left: 96px; right: 96px; bottom: 58px; z-index: 5;
    display: flex; align-items: center; gap: 16px;
    font-size: 21px; font-weight: 520; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
</style></head>
<body>
${SLIDES.map(slideHTML).join('\n')}
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

async function main() {
  // Fail loudly if a capture the deck names is not on disk.
  const present = new Set(await readdir(SHOTS));
  const missing = SLIDES.map((slide) =>
    slide.theme === 'dark' ? `dark-${slide.capture}.png` : `${slide.capture}.png`,
  ).filter((file) => !present.has(file));
  if (missing.length) {
    throw new Error(`missing captures in docs/screenshots: ${missing.join(', ')}`);
  }

  await mkdir(OUT, { recursive: true });
  const deckFile = path.join(OUT, '.deck.html');
  await writeFile(deckFile, documentHTML());

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`file://${deckFile}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 20000 },
  );

  const written = [];
  for (const slide of SLIDES) {
    const element = await page.$(`#${slide.theme}-${slide.id}`);
    const file = path.join(OUT, `${slide.theme}-${slide.id}.png`);
    await element.screenshot({ path: file });
    written.push(path.relative(APP, file));
  }

  await browser.close();
  await rm(deckFile, { force: true });

  // Remove slides from earlier decks so the folder holds exactly what the
  // README shows; a stale capture left behind is how a README drifts.
  const keep = new Set(written.map((file) => path.basename(file)));
  for (const file of await readdir(OUT)) {
    if (file.endsWith('.png') && !keep.has(file)) {
      await unlink(path.join(OUT, file));
      written.push(`removed ${path.relative(APP, path.join(OUT, file))}`);
    }
  }

  console.log(written.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
