# Unslop UI audit — Bene

Audit of the Bene mobile UI at 430×932, using the [unslop](https://github.com/heydamir/unslop) skill (installed locally under `.agents/skills/unslop`). Captured November 2026 against the demo dataset. Screenshots: `/opt/data/cache/scratch/bene-audit/shots/`.

## Verdict

**6/10 — visually coherent, semantically sloppy.** Bene does not have the usual purple-gradient/glow/emoji slop. The surfaces are calm, the cards are consistent and the scan path is good. The trust problem is deeper: several numbers on screen do not reconcile with each other, and some labels describe the wrong metric. In a health app that is a bigger design failure than an ugly gradient.

The strongest direction is **“calm clinical instrument”**: warm paper, ink typography, one accent per domain, data first, decoration only where it carries meaning. Keep the card system. Remove the assistant-orb/gradient-sparkle language, tighten the copy, and make every number explain itself.

## Screen findings

| Screen | Main issue | Severity |
|---|---|---|
| **Home** | Recovery insight says “low” while HRV is above baseline; “not just a one-off” is unsupported. Three rings mix % score, status and duration. “Recovered” at 41% reads as fully recovered. | P0 |
| **Nutrition** | Macro rings show calorie-share % while the card also shows “g left” against a different goal; 2,304 kcal with “200 left” sits beside 0 g carbs/protein left. Net-energy icons are unlabeled. | P0 |
| **Biology** | Sleep contributor shows `196 Z2–3 min/wk` — an activity metric in the sleep card. “85% confidence” has no interval or inputs. “Contributors should add up…” is QA copy. | P0/P1 |
| **Settings** | “Settings” title repeated twice; 11 unrelated rows in one card; privacy claim overpromises; typo “Finterpoint”. | P1 |
| **Fitness** | “12/10 days” reads as a broken progress ratio; all seven week checks are identical green; “Maintaining” duplicated; Muscle Freshness is clipped by the tab bar. | P1 |
| **Onboarding** | Generic gradient orb with dot eyes; jargon (HRV, RHR, sleep bank) before definitions; dual full-width CTAs; “demo data” is developer language. | P1 |
| **Journal / Intelligence / Profile** | Consistent, but the coach’s gradient sparkle tab breaks the icon language; “credits” and “model, persona” read like generic AI-product copy rather than a local coach. | P2 |
| **All screens** | 10–11 px muted labels, low-contrast legends and undersized tap targets (“Details”, stage legend, “Ask coach”). | P2 |

## What is working

1. **Clear scan path** — date/context → scores → insight → detail sections → tab bar.
2. **Coherent surface system** — warm neutral background, consistent rounded cards, generous gutters, restrained accent colors.
3. **Good information architecture** — Home, Fitness, Journal, Biology and Coach map to real jobs; the detail screens keep the same header grammar.
4. **Honest empty/demo states** — the app says when data is demo/imported and does not fake a live sensor connection.

## Prioritized fixes

### P0 — make the numbers trustworthy

- **Nutrition:** make macro rings explicitly “% of calories”; show grams as “left” or “over” against the macro goal; label net energy as `Intake − Burn`; stop implying the calorie remainder and macro remainders are the same budget. *(Fixed in this pass.)*
- **Home recovery copy:** derive the narrative from the actual direction of HRV/RHR/sleep; never say “below baseline” when HRV is above it. Remove unsupported “not just a one-off”. *(Fixed in this pass.)*
- **Biology:** put Zone 2–3 minutes under Activity, not Sleep; label VO₂ max units; add “estimate” and a confidence interval or input list. *(Sleep/Activity split fixed.)*

### P1 — hierarchy and copy

- Settings: one title, section headers (`Account`, `Data & privacy`, `Preferences`, `App`), sentence-case status values, correct `Finerpoint`.
- Fitness: replace `12/10 days` with `12 days logged`; give freshness cards real space above the tab bar; differentiate completed/rest/missed days in the week strip.
- Onboarding: one primary CTA, “See a sample day” instead of “demo data”; define HRV/RHR in plain language; replace the orb with a product visual or a calm abstract mark that relates to Bene.
- Intelligence: call it “Local coach” where it is rule-based; explain credits/ghost mode in one sentence each; remove the gradient FAB treatment from the nav.
- Copy pass: remove “grounded in your numbers”, “keep it controlled”, “what’s moving your age” and similar assistant-speak.

### P2 — polish

- Raise the smallest label sizes to 11–12 px and check contrast in both themes.
- Use one icon family and one selected-state treatment; the Coach tab should not look like a floating AI button.
- Reduce card-on-card nesting inside insight/empty states.
- Add a visible today marker and rest days to the weekly strip.
- Make charts self-explanatory: axis labels, units, and a direct label on the current point.

## Method note

The delegated audit was interrupted after capture and partial vision review, so this report consolidates the captured screenshots, the partial visual analysis, and a code-level check of the flagged values. The new Apple Health import screen was added after the capture and is not scored here.
