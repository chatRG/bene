# Bene — unslop design pass

Working notes for the design pass of November 2026. The audit that started it is in
[`UNSLOP_AUDIT.md`](./UNSLOP_AUDIT.md); this file records the direction and what changed.

## Direction

- **Product.** Bene is a local-first coach that turns overnight recovery, sleep and training
  load into one clear call for the day, on the phone you already carry.
- **Character.** Calm, exact, quietly warm.
- **World.** Paper, ink and a lab instrument: warm off-white stock, blue-black ink, one oxide-red
  pencil mark, brass-scale ticks and a fine ruled hairline.
- **Moments.** The recovery gauge on Recovery and Home (one measured morning reading) and the
  sleep hypnogram (the architecture of the night). Colour lives there; the rest of the app is
  quiet.
- **Signature.** A measured tick: a 1px vertical hairline with a 3px dot that marks the current
  value on the gauge, the trend line, the range bar and the active tab.

The palette follows the world rather than a trend: a warm neutral ramp for every surface, three
text roles, and a single oxide accent (`#a6402a` on paper, `#dc8266` on ink) for the primary
action, the current value and the selection. Semantic colour is kept for meaning only — a muted
green, amber and red that sit inside the paper. Charts may use more than one hue because the
series have to be told apart, but every chart has one leading colour and neutral supports.

## What the audit found, and where it went

| Finding | Resolution |
| --- | --- |
| Home recovery copy contradicted HRV; three rings mixed score, status and duration | Copy now derives from the actual HRV/RHR/sleep deltas. Each ring carries a score and one plain status line. |
| "Recovered" at 41% read as fully recovered | Bands renamed: Primed (85+), Ready (67+), Steady (50+), Low (34+), Rest up. The score card shows the band and a semantic colour, not a verdict. |
| Nutrition mixed calorie-share rings with gram goals | Rings are labelled "% of energy"; grams are "left/over" against the macro goal; net energy is labelled `Intake − Burn`. |
| Biology showed an activity metric in Sleep; unqualified confidence | Zone 2–3 minutes moved to Activity. The hero is rounded to whole years, confidence is expressed as a ± year range, and the method sheet names the model limits. |
| Settings repeated its title and grouped 11 unrelated rows | One title, four groups: You, Data and privacy, Preferences, App. |
| Fitness "12/10 days", identical week checks, clipped freshness | "12 days logged", a week strip with today/rest/missed states, and bottom padding that clears the nav. |
| Onboarding orb, jargon, dual CTAs | Product preview replaces the orb; HRV/RHR are defined in plain words; one primary action per step. |
| Coach tab gradient orb | Same line icon as every other tab, with the measured tick as the active state. |
| 10–11px muted labels | Smallest interface label is 12px; meta is 12px mono; contrast checked in both themes. |

## The nine passes

1. **Spacing.** 4px grid throughout. Page gutter 20, card padding 20, section gap 28, list rows
   56 tall with 8 between icon and label. One-off heights removed.
2. **Colour.** One warm neutral ramp, three text roles, one oxide accent. Removed the body
   radial washes, the page-level tint gradients, the lime/blue gradients on the avatar and coach
   orb, and the coloured card shadows. Borders are hairlines; depth is a surface step.
3. **Icons.** Lucide at 16/18px, stroke 1.5, one icon box per row, colour from the text role.
   The Coach tab is a line icon. Literal emoji in chrome were replaced; journal and food glyphs
   already resolved to Lucide through `Glyph`.
4. **Copy.** Sentence case, no exclamation marks, no trailing periods on labels, no
   "grounded in your numbers" or "keep it controlled". Headlines name the context.
5. **Type.** Inter for the interface with a system mono partner for measured meta. Weights 400,
   500 and 600 only, hierarchy from size and colour. No uppercase tracked labels, no negative
   tracking below 16px, tabular figures everywhere.
6. **Layout.** The app shell stays 430 wide; sections keep their order. Home is composed as one
   reading: status strip, date, scores, note, then detail cards. Nothing is clipped by the nav.
7. **Details.** Radii: cards 16, panels 20, controls 10, chips 6; inner radius = outer − padding.
   No pill buttons. Sheets and modals share the radius. Focus rings are visible.
8. **Visuals.** No generated imagery. The two rich moments are drawn in code: the gauge with its
   tick scale and the hypnogram with a four-step ink ramp. The onboarding visual is a real
   product preview, not an abstract orb.
9. **Motion.** One curve, `cubic-bezier(0.22, 1, 0.36, 1)`. Feedback 140ms, sheets 320ms, one
   entrance with a 40ms stagger. No looping pulses, no hover scale, no spring.

## Verification

- Light and dark at 430×932, no horizontal overflow, nav respects `safe-area-inset-bottom`.
- `npm test`, `npm run lint`, `npm run build`, `node scripts/e2e.mjs`, `node scripts/e2e-import.mjs`.
- Screenshots in `/opt/data/cache/scratch/bene-unslop/`.
