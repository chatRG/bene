# Scoring model

This document describes the scoring model in Bene. The model uses documented inputs, directions of effect, ranges, calibration gates and a small number of published point values. The published point values include the food-quality contributors and the deep-sleep target curve. The weights and curves are our own. This document does not claim to reproduce a private algorithm.

All scoring code is in `src/domain/scoring/`. The code is pure. It returns the same output for the same inputs. It has no clock or network access, except when a caller passes a date explicitly.

## Shared primitives

- Personal baselines use the previous 28 days and exclude the scored day.
- Robust z-scores use `(value − mean) / (1.253 × MAD)`. MAD is the mean absolute deviation of the baseline. This is the EWMA-abs-dev spread used by NOOP's `RecoveryScorer`.
- Bene rounds all scores only at the display boundary, unless stated.
- Bene stores time in local wall-clock dates (`yyyy-MM-dd`). Timestamps are ISO strings.

## Heart-rate zones

Published table, percent of HR max:

| Zone | % HRmax | Label |
|---|---|---|
| 0 | 0–49 | Restorative |
| 1 | 50–59 | Very light |
| 2 | 60–69 | Light |
| 3 | 70–79 | Moderate |
| 4 | 80–89 | Hard |
| 5 | 90–100 | Maximum |

The lower bound is inclusive. Thus exactly 60% is Z2. With the **HR reserve** method, the same bands apply to `(HR − restingHR) / (maxHR − restingHR)`.

Max HR methods: `manual`, `lactate` (LTHR ÷ 0.85), or the Tanaka estimate `208 − 0.7 × age`. The method is an explicit choice in Settings.

## Sleep

### Sleep need

`need = sleepGoal + clamp(recent7DayDebt × 0.22, −12, 75) + clamp((yesterdayStrain − 55) × 0.7, −20, 40) + ageAdjustment`

Bene clamps the sleep need to 6.5–10.5 hours. Debt is the sum of `(asleep − goal)` over the last seven nights. The age adjustment is −15 min at 60+ and −5 min at 45–59.

### Sleep score (0–100)

| Component | Weight | Definition |
|---|---|---|
| Duration | 0.40 | `100 × (1 − max(0, 1 − asleep/need) × 1.6)`, clamped |
| Stage balance | 0.30 | Deep target curve (13→9% male, 14→10% female, ages 30→70), REM target 22%, tolerance-based |
| Efficiency | 0.15 | `(asleep / inBed − 60) × 2.5` |
| Continuity | 0.10 | Penalises awake minutes and shortfall vs need |
| HR dip | 0.05 | Full score when the overnight dip is 10–30%, tapering outside that band |

Stages are Awake, REM, Core and Deep. There is no “Light” stage. A session needs at least 60 minutes asleep and in bed before Bene scores it.

### Sleep Bank

The Sleep Bank is a seven-day, recency-weighted sum of `(asleep − goal)` with weights `0.35, 0.25, 0.15, 0.10, 0.07, 0.05, 0.03`. Bene normalises the sum by the total of the available weights. Naps count.

## Recovery (1–100)

**Hard gates**, in order:

1. At least **two complete nights** with stages. If not, the gate returns `insufficient`.
2. Overnight HRV present **inside the sleep window, or within two hours of waking**. Ring exporters often stamp one nightly summary at waking rather than during a stage. If no reading is present, the gate returns `insufficient`.
3. Overnight RHR present **inside the sleep window, or within two hours of waking**. If no reading is present, the gate returns `insufficient`.
4. At least five baseline nights that carried overnight HRV and RHR, and a scored sleep session. If not, the gate returns `calibrating`.

**Components and weights** (ported from NOOP's transparent `RecoveryScorer`). Bene drops missing optional terms and renormalises the weights. A term is also dropped — and the weights renormalised — when the baseline contains no nights that measured it, and the calibration gate counts only the baseline nights that carried overnight HRV and RHR.

| Component | Weight | Direction |
|---|---|---|
| Overnight HRV z-score | 0.55 | higher is better |
| Overnight RHR z-score | 0.20 | lower is better |
| Sleep performance | 0.15 | `(sleepScore/100 − 0.85) / 0.12` |
| Temperature deviation | 0.05 | `−|deviation °C|` |
| Respiratory rate z-score | 0.05 | lower/steady is better |

`compositeZ = Σ(z × weight) / Σweight`. Then `score = 100 / (1 + e^(−1.6 × (compositeZ + 0.20)))`, clamped 0–100. `compositeZ = 0` maps to 58, the population-average anchor. Bene deliberately does **not** use daytime HRV here. Daytime HRV feeds Stress instead.

Display bands: `Primed ≥ 85`, `Ready ≥ 67`, `Steady ≥ 50`, `Low ≥ 34`, otherwise `Rest up`. The band uses a semantic colour. The score is an index out of 100, not a percentage.

## Strain (0–100+, never clamped)

`TRIMP_workout = Σ zoneMinutes × [0, 1, 2, 3, 4, 5]` (Edwards weights on %HRR). A workout logged by hand carries its own zone minutes. A workout imported from the health store has none, so Bene fills them from the heart-rate samples recorded inside that workout's window, splitting the duration between neighbouring samples. A workout with no heart-rate samples contributes no measured load rather than an invented estimate.

`TRIMP_passive = Σ zoneWeight(HR) × sampleMinutes`, excluding samples inside logged workout windows

`strain = 100 × ln(1 + TRIMP) / ln(7201)`

The denominator is the Edwards daily ceiling (5 × 24 h = 7200). A theoretical maximum day thus maps to 100. Strain may exceed 100% on very demanding days and is never clamped.

`targetStrain = clamp(24 + recovery × 0.65 − sickPenalty, 20, 95)`, where `sickPenalty` is 0 and 10 points while Activity Status is **Sick**. The displayed normal range is `target ± 16`. At recovery 41, this yields target ≈ 51 and a 35–67 band. Bene hides the target if Activity Status is **Injured** or **On a Break**. **Sick** reduces the target by 10 points.

## Stress and Energy Bank

`stressPoint = clamp(45 + (HR − restingHR − 12) × 1.15 + (daytimeHRVBaseline − daytimeHRV) × 0.9, 0, 100)`

Bene displays stress as high / low / average across the day. Energy Bank is `72 − mean(stress exposure) + sleep credit`, clamped 0–100, with labels Charged / Steady / Running low / Drained. Stress stays `calibrating` for the first 30 days of baseline.

## Cardio load

- Acute load: EWMA span 7 days over daily TRIMP.
- Chronic load: EWMA span 42 days.
- Ratio: acute ÷ chronic.
- Status: `Calibrating` until **10 qualifying cardio days** in six weeks. A day qualifies with a workout ≥ 20 min. After that: `<0.75 Detraining`, `<1.05 Maintaining`, `<1.25 Productive`, `<1.45 Peaking`, `<1.70 Fatigued`, otherwise `Overtraining`.
- Cardio focus groups Z1–Z2, Z3 and Z4–Z5 into low aerobic, high aerobic and anaerobic percentages.

## Muscle freshness

Per muscle group, fatigue accrues from sets × reps × weight and RPE. It decays with a 52-hour time constant. Freshness is `clamp(100 − fatigue, 0, 100)`.

Bands: `Recovered ≥ 75`, `Fatigued 35–74`, `Depleted < 35`. Calibration needs **3 training days per muscle**. The documented bands overlap at exactly 75%. This build resolves the overlap to **Recovered** (documented in a test).

## Nutrition score (1–100)

Food-quality contributors (published point model). Positive contributors earn pro-rata credit toward their target and cap at +10. Negative contributors are step penalties.

| Contributor | Target | Points |
|---|---|---|
| Vegetables | 150 g whole | +10 |
| Fruits | 2.5 cups whole | +10 |
| Whole grains | 3 servings | +10 |
| Healthy oils | 20–35% of calories | +10 |
| Nuts, seeds, legumes | 28 g | +10 |
| Omega-3s | 250 mg | +10 |
| Red meat | >70 g | −5 |
| Processed meat | >50 g | −10 |
| Alcohol | ≥14 g in a day | −10 |
| Sodium | >2,300 mg (dead band 1,500–2,300) | −5 |
| Added sugar | >10% of calories (dead band 5–10%) | −10 |

`score = clamp(50 + 0.75 × positivePoints + negativePoints, 1, 100)`

If every meal has an imported source, Bene **suppresses** the score. It does not guess.

Macro percentages are energy shares: protein ×4, carbs ×4, fat ×9. Net energy is `intake − burn`.

## Biological Age

`biologicalAge = chronologicalAge + bloodworkDelta + sleepYears + activityYears + fitnessYears`

- **Bloodwork delta:** nine PhenoAge-style markers. Each marker contributes up to ±0.28 years for each optimal-band width outside the band, clamped to ±5.
- **Sleep years:** `((avgSleepScore − 95) / 6)`, clamped ±2.5/3.
- **Activity years:** step shortfall × 0.93 + Zone 2–3 shortfall bonus, clamped.
- **Fitness years:** comparison of estimated VO₂ max with an age-based median (45 below 30, 42 at 30–39, 38 at 40–49, 33 at 50+; the median is not sex-adjusted), clamped ±3.5.

Confidence: `30 + 4 × markersPresent + min(15, wearDays/2) + 4 if labs ≤ 120 days`, clamped 20–98. Bene presents updates each week on Monday. It hides the score when fewer than seven markers or fewer than seven days of wearable data exist.

We designed the contributors to sum to the headline delta. The UI displays the equation so the number is auditable.

## Calibration gates at a glance

| Metric | Gate |
|---|---|
| Recovery | 2 nights + stages + overnight HRV + RHR + 5 baseline nights |
| Sleep score | ≥60 min asleep/in bed |
| Stress / Energy | 30 days for baseline |
| Cardio load | 10 qualifying days / 6 weeks |
| Muscular load | 10 days / 6 weeks |
| Muscle freshness | 3 training days per muscle |
| Biological Age | ≥7 of 9 markers + 7 wearable days |
| Nutrition | At least one non-imported meal |

## Design choices and known differences

- Weights, curves and thresholds are our own. We chose them to satisfy the observable invariants (ranges, directions, gates, bands). We ported recovery and strain from the transparent, MIT-licensed NOOP implementations (`ryanbr/noop`). We did not invent them. See the source comments.
- Max HR is explicit, not implicit. Strain uses Tanaka `208 − 0.7 × age` and %HRR zone weights.
- Bene resolves the 75% overlap in muscle freshness to Recovered.
- “Normal range” for strain is target ± 16, not an undisclosed distribution.
- Bene scripts the offline coach from your metrics. It is not a language model.

If you change a weight or threshold, update this document and add or adjust a test in `src/domain/scoring.test.ts`.
