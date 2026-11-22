import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { stateWithWeekOfData } from './fixtures';
import { generateCoachReply, ghostExpiry } from './coach';

const NOW = new Date('2026-11-14T13:20:00');
const data = stateWithWeekOfData(NOW);

describe('offline coach', () => {
  it('is deterministic for the same question, data and time', () => {
    const first = generateCoachReply(data, 'How should I train today?', NOW);
    const second = generateCoachReply(data, 'How should I train today?', NOW);
    expect(first).toEqual(second);
    expect(first.text).toContain('58% recovery');
    expect(first.followUps.length).toBeGreaterThan(0);
  });

  it('grounds training advice in recovery, strain and target strain', () => {
    const reply = generateCoachReply(data, 'Should I do intervals today?', NOW);
    expect(reply.text).toContain('58% recovery');
    expect(reply.text).toContain('50% strain');
    expect(reply.text).toContain('Target 62% total strain');
  });

  it('scales the advice down when recovery is low', () => {
    const poorNight = stateWithWeekOfData(NOW);
    const today = Object.keys(poorNight.days).pop()!;
    poorNight.days[today].sleep = {
      ...poorNight.days[today].sleep!,
      hrvMs: 30,
      rhrBpm: 62,
    };
    const reply = generateCoachReply(poorNight, 'Should I do intervals today?', NOW);
    expect(reply.text).toMatch(/keep today genuinely easy|Today supports quality work/);
  });

  it('reports nutrition totals from the logged meals', () => {
    const reply = generateCoachReply(data, 'What should I eat tonight?', NOW);
    expect(reply.text).toContain('2,304');
    expect(reply.text).toContain('Protein 184 g');
    expect(reply.text).toContain('Nutrition score is 88');
  });

  it('reports last night’s sleep and sleep bank', () => {
    const reply = generateCoachReply(data, 'How did I sleep?', NOW);
    expect(reply.text).toContain('Last night you slept');
    expect(reply.text).toContain('sleep bank');
  });

  it('falls back to a metric snapshot for an unrelated question', () => {
    const reply = generateCoachReply(data, 'Tell me something interesting', NOW);
    expect(reply.text).toContain('recovery 58%');
    expect(reply.text).toContain('Nutrition score is 88');
  });

  it('stays honest on a brand-new account with nothing logged', () => {
    const reply = generateCoachReply(buildSeed(NOW), 'How should I train today?', NOW);
    expect(reply.text.toLowerCase()).not.toContain('demo');
    expect(reply.text).toContain('0% strain');
  });

  it('computes ghost retention exactly', () => {
    expect(ghostExpiry(new Date('2026-11-14T10:00:00Z'), 30)).toBe('2026-11-14T10:30:00.000Z');
  });
});
