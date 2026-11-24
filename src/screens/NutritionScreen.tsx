import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Apple, Barcode, ChevronRight, Flame, Image as ImageIcon, Info, Plus, Search, Share2, Utensils } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { kcal } from '../domain/time';
import { deriveDay } from '../domain/derive';
import { DotMatrix, RangeBar } from '../components/charts';
import { SectionHead, Sheet, Segmented, Ring } from '../components/ui';
import { Glyph } from '../components/glyphs';
import { showToast } from '../components/toast';
import type { MealEntry } from '../domain/types';

interface FoodTemplate {
  name: string;
  emoji: string;
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  vegGrams: number;
  fruitCups: number;
  wholeGrainServings: number;
  healthyOilPctOfCalories: number;
  nutsGrams: number;
  omega3Mg: number;
  redMeatGrams: number;
  processedMeatGrams: number;
  alcoholGrams: number;
  sodiumMg: number;
  addedSugarG: number;
}

const FOODS: FoodTemplate[] = [
  { name: 'Greek yogurt, plain', emoji: '🥣', serving: '1 cup', calories: 150, proteinG: 20, carbsG: 8, fatG: 4, fiberG: 0, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 60, addedSugarG: 0 },
  { name: 'Grilled chicken breast', emoji: '🍗', serving: '150 g', calories: 248, proteinG: 46, carbsG: 0, fatG: 5, fiberG: 0, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 110, addedSugarG: 0 },
  { name: 'Salmon fillet', emoji: '🐟', serving: '150 g', calories: 312, proteinG: 34, carbsG: 0, fatG: 19, fiberG: 0, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 30, nutsGrams: 0, omega3Mg: 1800, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 90, addedSugarG: 0 },
  { name: 'Brown rice', emoji: '🍚', serving: '1 cup cooked', calories: 216, proteinG: 5, carbsG: 45, fatG: 1.8, fiberG: 3.5, vegGrams: 0, fruitCups: 0, wholeGrainServings: 1, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 10, addedSugarG: 0 },
  { name: 'Broccoli, steamed', emoji: '🥦', serving: '1 cup', calories: 55, proteinG: 3.7, carbsG: 11, fatG: 0.6, fiberG: 5, vegGrams: 150, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 64, addedSugarG: 0 },
  { name: 'Apple', emoji: '🍎', serving: '1 medium', calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4, vegGrams: 0, fruitCups: 1, wholeGrainServings: 0, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 2, addedSugarG: 0 },
  { name: 'Almonds', emoji: '🥜', serving: '28 g', calories: 164, proteinG: 6, carbsG: 6, fatG: 14, fiberG: 3.5, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 35, nutsGrams: 28, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 1, addedSugarG: 0 },
  { name: 'Oatmeal', emoji: '🌾', serving: '1 cup cooked', calories: 166, proteinG: 6, carbsG: 28, fatG: 3.6, fiberG: 4, vegGrams: 0, fruitCups: 0, wholeGrainServings: 1, healthyOilPctOfCalories: 12, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 9, addedSugarG: 0 },
  { name: 'Avocado toast', emoji: '🥑', serving: '1 slice', calories: 290, proteinG: 8, carbsG: 28, fatG: 17, fiberG: 7, vegGrams: 30, fruitCups: 0, wholeGrainServings: 1, healthyOilPctOfCalories: 32, nutsGrams: 0, omega3Mg: 60, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 320, addedSugarG: 1 },
  { name: 'Protein shake', emoji: '🥤', serving: '1 scoop + water', calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5, fiberG: 0, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 0, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 140, addedSugarG: 0 },
];

export function NutritionScreen() {
  const state = useAppStore();
  const today = dateKey(new Date());
  const d = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const n = d.nutrition;
  const [logOpen, setLogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [contribOpen, setContribOpen] = useState(false);
  const [method, setMethod] = useState<'home' | 'search' | 'barcode' | 'custom'>('home');
  const [query, setQuery] = useState('');
  const [units, setUnits] = useState<'g' | 'percent'>(state.settings.nutritionUnits === 'g' ? 'g' : 'percent');

  const goals = { calories: state.settings.calorieGoal, protein: state.settings.proteinGoalG, carbs: 240, fat: 70 };
  const left = goals.calories - n.totals.calories;
  const remaining = {
    protein: goals.protein - n.totals.proteinG,
    carbs: goals.carbs - n.totals.carbsG,
    fat: goals.fat - n.totals.fatG,
  };

  const addFood = (food: FoodTemplate, multiplier = 1) => {
    const meal: MealEntry = {
      id: `meal-${Date.now()}`,
      name: food.name,
      date: today,
      time: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
      calories: Math.round(food.calories * multiplier),
      proteinG: Math.round(food.proteinG * multiplier),
      carbsG: Math.round(food.carbsG * multiplier),
      fatG: Math.round(food.fatG * multiplier),
      fiberG: food.fiberG * multiplier,
      vegGrams: food.vegGrams * multiplier,
      fruitCups: food.fruitCups * multiplier,
      wholeGrainServings: food.wholeGrainServings * multiplier,
      healthyOilPctOfCalories: food.healthyOilPctOfCalories,
      nutsGrams: food.nutsGrams * multiplier,
      omega3Mg: food.omega3Mg * multiplier,
      redMeatGrams: food.redMeatGrams * multiplier,
      processedMeatGrams: food.processedMeatGrams * multiplier,
      alcoholGrams: food.alcoholGrams * multiplier,
      sodiumMg: food.sodiumMg * multiplier,
      addedSugarG: food.addedSugarG * multiplier,
      source: 'bene',
      emoji: food.emoji,
      loggedVia: 'search',
    };
    state.addMeal(meal);
    setLogOpen(false);
    setMethod('home');
    setQuery('');
    showToast(`${food.name} logged`);
  };

  const filtered = FOODS.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  const shareCard = async () => {
    const text = `Nutrition today — ${n.totals.calories.toLocaleString()} kcal · P ${Math.round(n.totals.proteinG)}g · C ${Math.round(n.totals.carbsG)}g · F ${Math.round(n.totals.fatG)}g · net energy ${n.netEnergy != null ? `${n.netEnergy > 0 ? '+' : ''}${n.netEnergy}` : '—'} kcal.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Nutrition', text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('Share card copied');
      }
    } catch {
      showToast('Share cancelled');
    }
  };

  return (
    <div className="screen nutrition-page screen--enter">
      <div className="detail-head" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div>
          <div className="detail-head__title">Nutrition</div>
          <div className="detail-head__sub">{format(new Date(), 'MMMM d')}</div>
        </div>
        <div className="detail-head__right">
          <div className="row gap-6">
            <button className="icon-btn icon-btn--soft" onClick={shareCard} aria-label="Share"><Share2 size={17} /></button>
            <button className="icon-btn icon-btn--soft" onClick={() => setLogOpen(true)} aria-label="Log food"><Plus size={19} /></button>
          </div>
        </div>
      </div>

      <div className="row-between mt-12">
        <div className="calorie-hero">
          <div className="caption">Calories</div>
          <div className="calorie-hero__value">{n.totals.calories.toLocaleString()}</div>
          <div className="calorie-hero__sub" style={{ color: left >= 0 ? 'var(--green-deep)' : 'var(--red)' }}>
            {left >= 0 ? `${left} kcal under ${goals.calories.toLocaleString()} goal` : `${Math.abs(left)} kcal over ${goals.calories.toLocaleString()} goal`}
          </div>
        </div>
        <Ring value={n.score} size={84} stroke={6} color="var(--accent)">
          <div className="ring__center">
            <span className="ring__value" style={{ fontSize: 18 }}>{n.score}</span>
            <span className="ring__label">/ 100</span>
          </div>
        </Ring>
      </div>

      <div className="macro-cards mt-12">
        {([
          ['Fat', n.totals.fatG, remaining.fat, n.macroPercents.fat],
          ['Carbs', n.totals.carbsG, remaining.carbs, n.macroPercents.carbs],
          ['Protein', n.totals.proteinG, remaining.protein, n.macroPercents.protein],
        ] as [string, number, number, number][]).map(([label, value, leftG, pct]) => (
          <button key={String(label)} className="macro-card" onClick={() => setDetailOpen(true)} style={{ textAlign: 'left' }}>
            <div className="row-between">
              <span className="macro-card__label">{label}</span>
              <span className="macro-card__share">{pct}% of energy</span>
            </div>
            <div className="macro-card__value">{value}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}> g</span></div>
            <div className="macro-card__left">{leftG >= 0 ? `${leftG} g left` : `${Math.abs(leftG)} g over`}</div>
          </button>
        ))}
      </div>
      <p className="caption" style={{ margin: '8px 4px 0', lineHeight: 1.45 }}>
        Percent is each macro's share of today's calories. Grams left or over compare with your macro goal.
      </p>

      <div className="card net-card mt-12">
        <div className="row-between">
          <div>
            <div className="caption">Net energy · intake − burn</div>
            <div className="net-card__value">{n.netEnergy != null ? `${n.netEnergy > 0 ? '+' : ''}${n.netEnergy}` : '—'}<span style={{ fontSize: 14, fontWeight: 400 }}> kcal</span></div>
          </div>
          <button className="icon-btn icon-btn--soft" onClick={() => showToast('Net energy = intake − burn')} aria-label="Info"><Info size={16} /></button>
        </div>
        <div className="net-energy-row">
          <span><Flame size={14} color="var(--muted)" /> Burn {kcal(d.record.metrics.totalCalories)}</span>
          <span><Apple size={14} color="var(--muted)" /> Intake {n.totals.calories.toLocaleString()}</span>
        </div>
        <div className="mt-12">
          <RangeBar value={n.netEnergy ?? 0} min={-500} max={500} markerLabel={`${n.netEnergy ?? 0} kcal`} />
        </div>
      </div>

      <div className="section">
        <SectionHead
          title="Nutritional details"
          action={
            <button className="pill pill--sm pill--flat" onClick={() => setDetailOpen(true)}>
              g / % <ChevronRight size={12} />
            </button>
          }
        />
        <button className="card" style={{ width: '100%', textAlign: 'left', padding: 16 }} onClick={() => setDetailOpen(true)}>
          <div className="nutrition-detail-grid">
            {[
              ['Fat', n.macroPercents.fat, n.totals.fatG, 'var(--fat)'],
              ['Carbs', n.macroPercents.carbs, n.totals.carbsG, 'var(--carbs)'],
              ['Protein', n.macroPercents.protein, n.totals.proteinG, 'var(--protein)'],
            ].map(([label, pct, grams, color]) => (
              <div key={String(label)} className="macro-detail">
                <DotMatrix pct={Number(pct)} color={String(color)} cols={7} rows={7} />
                <div className="macro-detail__value">{pct}%</div>
                <div className="macro-detail__label" style={{ color: String(color) }}>{label}</div>
                <div className="caption">{grams} g</div>
              </div>
            ))}
          </div>
        </button>
      </div>

      <div className="section">
        <SectionHead
          title="Quality Contributors"
          action={<button className="pill pill--sm pill--flat" onClick={() => setContribOpen(true)}>All {n.contributors.length}</button>}
        />
        <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {n.contributors.filter((c) => c.points !== 0 || ['vegetables', 'wholeGrains', 'fruits'].includes(c.id)).length === 0 ? (
            <div className="empty" style={{ padding: '18px 12px' }}>Log a meal to see which contributors count.</div>
          ) : null}
          {n.contributors.filter((c) => c.points !== 0 || ['vegetables', 'wholeGrains', 'fruits'].includes(c.id)).slice(0, 6).map((c) => (
            <div className="contributor-row" key={c.id}>
              <span className="contributor-emoji"><Glyph emoji={c.emoji} /></span>
              <span className="contributor-name">{c.label}</span>
              <div className="contributor-bar"><span style={{ width: `${Math.min(100, c.progress * 100)}%`, background: c.kind === 'positive' ? 'var(--green)' : c.points < 0 ? 'var(--orange)' : 'var(--field)' }} /></div>
              <span className="contributor-points" style={{ color: c.points > 0 ? 'var(--green-deep)' : c.points < 0 ? 'var(--red)' : 'var(--muted-2)' }}>
                {c.points > 0 ? '+' : ''}{c.points}
              </span>
              <ChevronRight size={15} className="chevron" />
            </div>
          ))}
        </div>
        <div className="row-between mt-8" style={{ padding: '0 4px' }}>
          <span className="caption">Nutrition score</span>
          <span className="pill pill--sm pill--green">{n.score}/100</span>
        </div>
      </div>

      <div className="section">
        <SectionHead title="Logged today" action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => setLogOpen(true)}><Plus size={11} /> Add</button>} />
        <div className="card">
          {d.record.meals.map((m) => (
            <div className="food-row" key={m.id}>
              <span className="food-emoji"><Glyph emoji={m.emoji} /></span>
              <div className="grow">
                <div className="list-title">{m.name}</div>
                <div className="list-sub">{m.time} · {m.calories} kcal · P {m.proteinG} · C {m.carbsG} · F {m.fatG}</div>
              </div>
              <button className="icon-btn icon-btn--ghost" onClick={() => { state.removeMeal(today, m.id); showToast('Meal removed'); }} aria-label="Remove">
                ×
              </button>
            </div>
          ))}
          {d.record.meals.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <Utensils size={22} style={{ marginBottom: 8 }} />
              <div>Log your first meal to start your Nutrition Score.</div>
            </div>
          ) : null}
        </div>
        <button className="btn btn--block mt-16" onClick={() => setLogOpen(true)}><Plus size={17} /> Log food</button>
      </div>

      {logOpen ? (
        <Sheet
          title={method === 'home' ? 'Log food' : method === 'search' ? 'Search foods' : method === 'barcode' ? 'Scan a barcode' : 'Custom food'}
          subtitle={method === 'home' ? 'Every way you already log, in one place.' : undefined}
          onClose={() => { setLogOpen(false); setMethod('home'); }}
        >
          {method === 'home' ? (
            <div className="col gap-8">
              {[
                ['search', 'Search foods', 'Database, recipes and My Foods', <Search size={18} />],
                ['barcode', 'Scan barcode', 'Packaged foods and supplements', <Barcode size={18} />],
                ['custom', 'Create custom food', 'Enter your own nutrition facts', <Plus size={18} />],
              ].map(([id, title, sub, icon]) => (
                <button key={String(id)} className="status-option" onClick={() => setMethod(id as typeof method)}>
                  <span className="status-option__icon">{icon}</span>
                  <span className="grow"><span className="list-title">{title}</span><span className="list-sub">{sub}</span></span>
                  <ChevronRight size={16} className="chevron" />
                </button>
              ))}
              <div className="insight-unlock mt-8"><Info size={16} /><span>Search the local food list or enter your own nutrition facts.</span></div>
            </div>
          ) : null}

          {method === 'search' ? (
            <>
              <div className="search-field"><Search size={17} /><input placeholder="Search 1.2M foods" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus /></div>
              <div className="list-card mt-12" style={{ boxShadow: 'none' }}>
                {filtered.map((f) => (
                  <button key={f.name} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => addFood(f)}>
                    <div className="food-emoji"><Glyph emoji={f.emoji} /></div>
                    <div className="grow"><div className="list-title">{f.name}</div><div className="list-sub">{f.serving} · {f.calories} kcal · P {f.proteinG} C {f.carbsG} F {f.fatG}</div></div>
                    <Plus size={16} className="chevron" />
                  </button>
                ))}
                {filtered.length === 0 ? <div className="empty">No foods match “{query}”.</div> : null}
              </div>
            </>
          ) : null}

          {method === 'barcode' ? (
            <div>
              <div className="card" style={{ textAlign: 'center', padding: 30, background: 'var(--field)', boxShadow: 'none' }}>
                <Barcode size={30} style={{ marginBottom: 10 }} />
                <div className="card-title">Point at a barcode</div>
                <div className="card-sub">Camera access is simulated in this build.</div>
              </div>
              <button className="btn btn--block mt-16" onClick={() => addFood(FOODS[9])}><Barcode size={16} /> Use sample barcode (protein shake)</button>
            </div>
          ) : null}

          {method === 'custom' ? <CustomFoodForm onSave={(f) => addFood(f)} /> : null}
        </Sheet>
      ) : null}

      {detailOpen ? (
        <Sheet
          title="Nutritional details"
          subtitle="Each macro as a share of energy"
          onClose={() => setDetailOpen(false)}
        >
          <div className="row-between" style={{ marginBottom: 16 }}>
            <span className="caption">Show values as</span>
            <Segmented options={[{ value: 'g', label: 'g' }, { value: 'percent', label: '%' }]} value={units} onChange={setUnits} />
          </div>
          <div className="nutrition-detail-grid">
            {[
              ['Fat', n.macroPercents.fat, n.totals.fatG, 'var(--fat)'],
              ['Carbs', n.macroPercents.carbs, n.totals.carbsG, 'var(--carbs)'],
              ['Protein', n.macroPercents.protein, n.totals.proteinG, 'var(--protein)'],
            ].map(([label, pct, grams, color]) => (
              <div key={String(label)} className="macro-detail">
                <DotMatrix pct={Number(pct)} color={String(color)} cols={8} rows={8} />
                <div className="macro-detail__value">{units === 'g' ? `${grams} g` : `${pct}%`}</div>
                <div className="macro-detail__label" style={{ color: String(color) }}>{label}</div>
                {units === 'g' ? <div className="caption">{pct}% of energy</div> : <div className="caption">{grams} g</div>}
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row-between"><span className="body">Fiber</span><strong>{n.totals.fiberG} g</strong></div>
          <div className="row-between mt-8"><span className="body">Sodium</span><strong>{n.totals.sodiumMg.toLocaleString()} mg</strong></div>
          <div className="row-between mt-8"><span className="body">Added sugar</span><strong>{n.totals.addedSugarG} g</strong></div>
          <div className="row-between mt-8"><span className="body">Alcohol</span><strong>{n.totals.alcoholG} g</strong></div>
          <button className="btn btn--soft btn--block mt-20" onClick={() => setDetailOpen(false)}>Done</button>
        </Sheet>
      ) : null}

      {contribOpen ? (
        <Sheet title="Quality Contributors" subtitle="Each contributor can add at most +10 or −10." onClose={() => setContribOpen(false)}>
          <div className="list-card" style={{ boxShadow: 'none' }}>
            {n.contributors.map((c) => (
              <div className="contributor-row" key={c.id} style={{ padding: '10px 14px' }}>
                <span className="contributor-emoji"><Glyph emoji={c.emoji} /></span>
                <div className="grow"><div className="list-title">{c.label}</div><div className="list-sub">{c.target}</div></div>
                <span className="contributor-points" style={{ color: c.points > 0 ? 'var(--green-deep)' : c.points < 0 ? 'var(--red)' : 'var(--muted-2)' }}>{c.points > 0 ? '+' : ''}{c.points}</span>
              </div>
            ))}
          </div>
          <p className="caption mt-12">Sodium has a dead band from 1,500–2,300 mg; added sugar from 5–10% of calories.</p>
        </Sheet>
      ) : null}

      <div className="section">
        <div className="card card--flat" style={{ display: 'flex', gap: 10 }}>
          <ImageIcon size={17} className="chevron" />
          <span className="caption" style={{ flex: 1 }}>Photo estimates are approximate; review the macros before saving.</span>
        </div>
      </div>
    </div>
  );
}

function CustomFoodForm({ onSave }: { onSave: (f: FoodTemplate) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState(300);
  const [p, setP] = useState(20);
  const [c, setC] = useState(30);
  const [f, setF] = useState(10);
  return (
    <div>
      <div className="field-label">Food name</div>
      <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My morning smoothie" />
      <div className="row gap-8 mt-12">
        <div className="grow"><div className="field-label">Calories</div><input className="text-input" type="number" value={kcal} onChange={(e) => setKcal(Number(e.target.value))} /></div>
        <div className="grow"><div className="field-label">Protein g</div><input className="text-input" type="number" value={p} onChange={(e) => setP(Number(e.target.value))} /></div>
      </div>
      <div className="row gap-8 mt-8">
        <div className="grow"><div className="field-label">Carbs g</div><input className="text-input" type="number" value={c} onChange={(e) => setC(Number(e.target.value))} /></div>
        <div className="grow"><div className="field-label">Fat g</div><input className="text-input" type="number" value={f} onChange={(e) => setF(Number(e.target.value))} /></div>
      </div>
      <button
        className="btn btn--block mt-20"
        disabled={!name.trim()}
        onClick={() => onSave({ name: name.trim(), emoji: '🍽️', serving: '1 serving', calories: kcal, proteinG: p, carbsG: c, fatG: f, fiberG: 0, vegGrams: 0, fruitCups: 0, wholeGrainServings: 0, healthyOilPctOfCalories: 15, nutsGrams: 0, omega3Mg: 0, redMeatGrams: 0, processedMeatGrams: 0, alcoholGrams: 0, sodiumMg: 300, addedSugarG: 0 })}
      >
        Save to My Foods
      </button>
    </div>
  );
}
