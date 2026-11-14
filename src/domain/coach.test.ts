import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { generateCoachReply, ghostExpiry } from './coach';

const NOW = new Date('2026-11-14T13:20:00');
const data = buildSeed(NOW);

describe('offline coach', () => {
  it('is deterministic for the same question, data and time', () => {
    const first = generateCoachReply(data, 'How should I train today?', NOW);
    const second = generateCoachReply(data, 'How should I train today?', NOW);
    expect(first).toEqual(second);
    expect(first.text).toContain('41%');
    expect(first.credits).toBeGreaterThan(0);
    expect(first.followUps.length).toBeGreaterThan(0);
  });

  it('grounds training advice in recovery, HRV and target strain', () => {
    const reply = generateCoachReply(data, 'Should I do intervals today?', NOW);
    expect(reply.text).toContain('recovery at 41%');
    expect(reply.text).toContain('HRV');
    expect(reply.text).toContain('target strain is 43%');
  });

  it('reports nutrition totals from the logged meals', () => {
    const reply = generateCoachReply(data, 'What should I eat tonight?', NOW);
    expect(reply.text).toContain('2,304');
    expect(reply.text).toContain('Protein 184 g');
    expect(reply.text).toContain('Nutrition score is 87');
  });

  it('reports last night’s sleep and sleep bank', () => {
    const reply = generateCoachReply(data, 'How did I sleep?', NOW);
    expect(reply.text).toContain('7h 3m');
    expect(reply.text).toContain('sleep bank');
  });

  it('falls back to a metric snapshot for an unrelated question', () => {
    const reply = generateCoachReply(data, 'Tell me something interesting', NOW);
    expect(reply.text).toContain('recovery 41%');
    expect(reply.text).toContain('Nutrition score is 87');
  });

  it('computes ghost retention exactly', () => {
    expect(ghostExpiry(new Date('2026-11-14T10:00:00Z'), 30)).toBe('2026-11-14T10:30:00.000Z');
  });
});
