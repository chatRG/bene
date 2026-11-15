import type { MealEntry } from '../types';
import { clamp, sum } from '../math';

export interface Contributor {
  id: string;
  label: string;
  kind: 'positive' | 'negative';
  target: string;
  points: number;
  maxPoints: number;
  progress: number;
  emoji: string;
}

export interface NutritionResult {
  status: 'scored' | 'suppressed' | 'empty';
  score: number;
  contributors: Contributor[];
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
    addedSugarG: number;
    alcoholG: number;
  };
  macroPercents: { fat: number; carbs: number; protein: number };
  netEnergy: number | null;
}

export const CONTRIBUTOR_DEFS = [
  { id: 'vegetables', label: 'Vegetables', kind: 'positive', target: '150 g whole vegetables', points: 10, emoji: '🥦' },
  { id: 'fruits', label: 'Fruits', kind: 'positive', target: '2.5 cups whole fruit', points: 10, emoji: '🍎' },
  { id: 'wholeGrains', label: 'Whole grains', kind: 'positive', target: '3 servings', points: 10, emoji: '🌾' },
  { id: 'healthyOils', label: 'Healthy oils', kind: 'positive', target: '20–35% of calories', points: 10, emoji: '🫒' },
  { id: 'nuts', label: 'Nuts, seeds & legumes', kind: 'positive', target: '1 oz', points: 10, emoji: '🥜' },
  { id: 'omega3', label: 'Omega-3s', kind: 'positive', target: '250 mg', points: 10, emoji: '🐟' },
  { id: 'redMeat', label: 'Red meat', kind: 'negative', target: '≤70 g cooked', points: -5, emoji: '🥩' },
  { id: 'processedMeat', label: 'Processed meat', kind: 'negative', target: '≤1.5 servings', points: -10, emoji: '🥓' },
  { id: 'alcohol', label: 'Alcohol', kind: 'negative', target: '0 drinks', points: -10, emoji: '🍷' },
  { id: 'sodium', label: 'Excess sodium', kind: 'negative', target: '<2,300 mg', points: -5, emoji: '🧂' },
  { id: 'addedSugar', label: 'Added sugar', kind: 'negative', target: '<10% of calories', points: -10, emoji: '🍬' },
] as const;

/**
 * Food Quality Contributors, built on the published point model. Positive
 * contributors earn pro-rata credit toward their target (the app shows +7 for
 * 70%-of-target vegetables) and cap at +10; negatives are step penalties with
 * the published dead bands for sodium (1500–2300 mg) and added sugar (5–10%).
 */
export function nutritionFor(meals: MealEntry[], excluded: string[] = [], burnCalories?: number | null): NutritionResult {
  const ownMeals = meals.filter((m) => m.source === 'bene');
  const totals = {
    calories: Math.round(sum(meals.map((m) => m.calories))),
    proteinG: Math.round(sum(meals.map((m) => m.proteinG))),
    carbsG: Math.round(sum(meals.map((m) => m.carbsG))),
    fatG: Math.round(sum(meals.map((m) => m.fatG))),
    fiberG: Math.round(sum(meals.map((m) => m.fiberG))),
    sodiumMg: Math.round(sum(meals.map((m) => m.sodiumMg))),
    addedSugarG: Math.round(sum(meals.map((m) => m.addedSugarG))),
    alcoholG: Math.round(sum(meals.map((m) => m.alcoholGrams))),
  };
  const macroCal = { protein: totals.proteinG * 4, carbs: totals.carbsG * 4, fat: totals.fatG * 9 };
  const macroTotal = macroCal.protein + macroCal.carbs + macroCal.fat || 1;
  const macroPercents = {
    fat: Math.round((macroCal.fat / macroTotal) * 100),
    carbs: Math.round((macroCal.carbs / macroTotal) * 100),
    protein: Math.round((macroCal.protein / macroTotal) * 100),
  };

  if (meals.length === 0) {
    return {
      status: 'empty',
      score: 50,
      contributors: [],
      totals,
      macroPercents,
      netEnergy: burnCalories != null ? -burnCalories : null,
    };
  }

  const veg = sum(meals.map((m) => m.vegGrams));
  const fruit = sum(meals.map((m) => m.fruitCups));
  const grains = sum(meals.map((m) => m.wholeGrainServings));
  const nuts = sum(meals.map((m) => m.nutsGrams));
  const omega = sum(meals.map((m) => m.omega3Mg));
  const oilPct = totals.calories > 0 ? sum(meals.map((m) => (m.healthyOilPctOfCalories * m.calories) / totals.calories)) : 0;
  const redMeat = sum(meals.map((m) => m.redMeatGrams));
  const processed = sum(meals.map((m) => m.processedMeatGrams));
  const addedSugarPct = totals.calories > 0 ? (totals.addedSugarG * 4 * 100) / totals.calories : 0;

  const progressFor = (id: string): number => {
    switch (id) {
      case 'vegetables': return clamp(veg / 150, 0, 1);
      case 'fruits': return clamp(fruit / 2.5, 0, 1);
      case 'wholeGrains': return clamp(grains / 3, 0, 1);
      case 'healthyOils': return oilPct >= 20 && oilPct <= 35 ? 1 : oilPct < 20 ? clamp(oilPct / 20, 0, 1) : clamp(1 - (oilPct - 35) / 20, 0, 1);
      case 'nuts': return clamp(nuts / 28, 0, 1);
      case 'omega3': return clamp(omega / 250, 0, 1);
      case 'redMeat': return redMeat > 70 ? 1 : 0;
      case 'processedMeat': return processed > 50 ? 1 : 0;
      case 'alcohol': return totals.alcoholG >= 14 ? 1 : 0;
      case 'sodium': return totals.sodiumMg > 2300 ? 1 : 0;
      case 'addedSugar': return addedSugarPct > 10 ? 1 : 0;
      default: return 0;
    }
  };

  const contributors: Contributor[] = CONTRIBUTOR_DEFS.filter((d) => !excluded.includes(d.id)).map((d) => {
    const progress = progressFor(d.id);
    const raw = d.kind === 'positive' ? d.points * progress : d.points * progress;
    const points = Math.round(raw) === 0 ? 0 : Math.round(raw);
    return { ...d, points, maxPoints: d.points, progress };
  });

  const positive = contributors.filter((c) => c.points > 0).reduce((a, c) => a + c.points, 0);
  const negative = contributors.filter((c) => c.points < 0).reduce((a, c) => a + c.points, 0);
  const score = clamp(Math.round(50 + positive * 0.75 + negative), 1, 100);
  return {
    status: ownMeals.length === 0 ? 'suppressed' : 'scored',
    score,
    contributors,
    totals,
    macroPercents,
    netEnergy: burnCalories != null ? totals.calories - Math.round(burnCalories) : null,
  };
}
