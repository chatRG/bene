import type { AppStateData } from './types';
import { dateOf, deriveDay } from './derive';
import { stageTotals } from './math';

export interface CoachReply {
  text: string;
  followUps: string[];
}

const money = (n: number) => Math.round(n).toLocaleString();

export function generateCoachReply(data: AppStateData, text: string, now = new Date()): CoachReply {
  const today = dateOf(now);
  const d = deriveDay(data, today, now);
  const q = text.toLowerCase();
  const first = data.profile.name.split(' ')[0] || 'there';
  const recovery = d.recovery.score;
  const sleep = d.sleepScore?.status === 'scored' ? d.sleepScore.score : null;
  const strain = Math.round(d.strain.score);
  const sleepMinutes = d.sleep ? stageTotals(d.sleep).asleepMin : 0;

  if (/train|workout|run|gym|lift|exercise|interval|cardio|strength|session/.test(q)) {
    if (recovery != null && recovery < 45) {
      return {
        text: `With recovery at ${recovery}% and HRV ${d.sleep?.hrvMs?.toFixed(1) ?? '—'} ms, I'd keep today genuinely easy.\n\n• 30–40 min Zone 2, nasal-breathing pace\n• Or a full rest day if you feel run down\n• Skip intervals and training to failure\n\nYour target strain is ${d.strain.target}% today. You're at ${strain}% so far — no need to chase more.`,
        followUps: ['Give me a 30-minute Zone 2 session', 'What should I eat today?', 'When will my recovery bounce back?'],
      };
    }
    return {
      text: `You're at ${recovery != null ? `${recovery}% recovery` : 'a steady baseline'} and ${strain}% strain so far. Today supports quality work.\n\n• 10 min warm-up, then 3 × 6 min at threshold with 2 min easy\n• Cap the session at RPE 8\n• Target ${d.strain.target}% total strain\n\nKeep the rest of the day easy so tomorrow's HRV stays clean.`,
      followUps: ['Add this to my plan', 'How hard is threshold?', 'Show my training load'],
    };
  }

  if (/sleep|bed|tired|insomnia|wake/.test(q)) {
    const hours = Math.floor(sleepMinutes / 60);
    const mins = sleepMinutes % 60;
    return {
      text: `Last night you slept ${hours}h ${mins}m against a ${Math.floor(d.sleepNeedMin / 60)}h ${d.sleepNeedMin % 60}m target${sleep ? `, scoring ${sleep}%` : ''}.\n\nYour sleep bank is ${d.sleepBankMin >= 0 ? '+' : ''}${Math.round(d.sleepBankMin / 60)}h ${Math.abs(d.sleepBankMin % 60)}m. Deep sleep was ${d.sleepScore?.deepPct ?? '—'}% and REM ${d.sleepScore?.remPct ?? '—'}%.\n\nTonight: keep the room cool, dim screens 45 minutes before bed, and aim for lights out by 23:00. If you want, I can set a wind-down reminder.`,
      followUps: ['Set a wind-down reminder', 'Why is my deep sleep low?', 'Show my sleep trend'],
    };
  }

  if (/food|eat|nutrition|meal|protein|calorie|macro/.test(q)) {
    const n = d.nutrition;
    const remaining = data.settings.calorieGoal - n.totals.calories;
    return {
      text: `You've logged ${money(n.totals.calories)} kcal today — ${remaining > 0 ? `${money(remaining)} kcal left` : `${money(Math.abs(remaining))} kcal over`}.\n\nProtein ${n.totals.proteinG} g · Carbs ${n.totals.carbsG} g · Fat ${n.totals.fatG} g. Nutrition score is ${n.score}.\n\nTo close the day well: ${remaining > 300 ? 'add a palm-sized protein portion and a fist of vegetables' : 'keep it light — Greek yogurt or a piece of fruit if you are hungry'}. Your fiber is ${n.totals.fiberG} g; 30 g is a good target.`,
      followUps: ['Log a meal', 'What should I eat after training?', 'Show my nutrition score'],
    };
  }

  if (/stress|anxious|calm|energy/.test(q)) {
    return {
      text: `Today's stress peaked at ${d.stress.high} and is averaging ${d.stress.average}. Energy Bank is ${d.stress.energyBank}% (${d.stress.energyLabel}).\n\nA 5-minute physiological sigh — two short inhales, one long exhale — can lower heart rate quickly. If you can, take a 10-minute walk outside before your next block of work. I'll keep an eye on the afternoon dip.`,
      followUps: ['Start a breathing exercise', 'How does stress affect recovery?', 'Show today’s stress'],
    };
  }

  if (/plan|week|goal|10k|marathon|race/.test(q)) {
    return {
      text: `Here's a week that fits your current recovery and load:\n\n• Mon — Upper strength, 4 × 6 @ RPE 7\n• Tue — Easy run 30 min (Zone 2)\n• Wed — Rest or 20 min mobility\n• Thu — Lower strength, 3 × 8\n• Fri — Tempo 3 × 6 min\n• Sat — Long run 60 min easy\n• Sun — Walk / hike\n\nThat's about 4.5 hours of training and a sensible step up from last week. I'll adjust Friday automatically if your recovery drops below 40%.`,
      followUps: ['Add this plan to my calendar', 'Make it a 5K plan', 'Why only 4.5 hours?'],
    };
  }

  if (/whoop|oura|apple|garmin|data|source/.test(q)) {
    return {
      text: `There is no live health source connected yet, so there are no scores to show until data starts arriving. Apple Health on iOS and Health Connect on Android will feed the dashboard once those adapters ship.\n\nAnything you log manually is stored on this device.`,
      followUps: ['Open Data Sources', 'What data will be imported?', 'Why is my HRV missing?'],
    };
  }

  return {
    text: `Here's your snapshot, ${first}: recovery ${recovery != null ? `${recovery}%` : 'still calibrating'}, sleep ${sleep != null ? `${sleep}%` : '—'}${d.sleep ? ` (${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m)` : ''}, and ${strain}% strain so far today. Nutrition score is ${d.nutrition.score}.\n\nAsk me about training, sleep, food, stress or your biological age and I'll go deeper on the numbers.`,
    followUps: ['How should I train today?', 'Review my sleep', 'What should I eat?'],
  };
}

export function ghostExpiry(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60000).toISOString();
}
