# Bene — unslop story

A 9-second square cut of the Home screen unslopping itself, made with the
[unslop](https://github.com/heydamir/unslop) story format by Damir Sokolovsky
(CC BY 4.0). The small `unslop by @heydamir` credit is part of the video, as the
licence asks.

- `story.html` — the standalone presentation page. The original rules are step 0;
  `.s1`–`.s4` are the CSS-only steps.
- `render.mjs` — the story renderer with a 1080×1080 / 30 fps output profile.
  It is the upstream `story.mjs` with only the output scale and preset changed,
  so it renders on a machine that cannot hold 600 2160² frames in memory.
- `unslop-story.mp4` — the rendered 1080×1080 film, 9.2 s.

Rebuild:

```bash
CHROME_PATH=/path/to/chrome node unslop-story/render.mjs unslop-story/story.html unslop-story.mp4
```

The story uses the pre-pass Home layout as its `from` state and the shipped Bene
tokens, copy and semantic recovery colour as its `to` state. It is a presentation
piece, not a second source of truth: the app itself contains no story classes.
