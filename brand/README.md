# Bene identity

## The mark

**Threshold.** A circular opening cut clean through a square field. One shape, one cut, no letterforms.

Bene is a quiet health instrument. The mark is named for what matters in recovery: crossing back over a line. It is drawn from two primitives only — a rounded square and a circle — so it stays exact at every size and in one colour.

There is no accent colour. The identity is **ink and cream**, reversed as needed.

## Files

| File | Use |
|---|---|
| `final/app-icon.svg` | Master app icon, 512 viewBox, ink tile |
| `final/symbol-ink.svg` | The mark in ink, transparent field |
| `final/symbol-black.svg` | The mark in pure black, transparent field |
| `final/symbol-white.svg` | The mark reversed in white |
| `final/symbol-small.svg` | Small-size cut: hole enlarged to hold from 16 px |
| `final/board.png` | Presentation board |

Working files live in `round2/` and `round3/`; the brief is in `BRIEF.md`.

## Colour

| Token | Hex | Use |
|---|---|---|
| Ink | `#1C1A16` | Tile, mark, text |
| Cream | `#F7F1E7` | Reversed field |

Two values only: ink on cream, cream on ink. No gradients, no shadows, no accent.

## Geometry

- Canvas `0 0 256 256`
- Field: 192 × 192 rounded square, corner radius 32, centred
- Hole: true circle, radius 52, centred
- Small-size cut: field 200 × 200, hole radius 62

## Clear space and minimum size

- Clear space on every side: one hole diameter (104 units on the master).
- Minimum: 24 px on the master, 16 px on the small-size cut.
- App icon: the mark fills 56% of the tile.

## Use

- The mark may stand alone. It does not need the wordmark.
- At 32 px and below, use `symbol-small.svg`.
- Do not outline, emboss, rotate, or gradient the mark. Do not add a second colour.
- Do not place the mark on a mid-tone; use ink on cream or cream on ink.

## Type

**Allo Variable** (SIL Open Font License 1.1) for all text. Wordmark weight 500, optical size 32, roundness 50.

## Credit

Allo is by Josh Puckett, based on Inter. Licensed under the SIL Open Font License 1.1; the full text is in `src/assets/fonts/OFL.txt`.
