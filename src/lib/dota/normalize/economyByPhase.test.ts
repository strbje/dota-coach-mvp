import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEconomyTimeline, normalizeLaneEconomyAt10 } from './economyByPhase';

function timeline(minutes: number) {
  return Array.from({ length: minutes + 1 }, (_, minute) => minute * 10);
}

test('a 25-minute match has a partial mid game and no future late-game phase', () => {
  const values = timeline(25);
  const result = normalizeEconomyTimeline(values, values, values, 25 * 60);
  assert.equal(result.economyByPhase.midGame?.endMinute, 25);
  assert.equal(result.economyByPhase.lateGame, undefined);
});

test('an 18-minute match has no mid-game or late-game phases', () => {
  const values = timeline(18);
  const result = normalizeEconomyTimeline(values, values, values, 18 * 60);
  assert.equal(result.economyByPhase.earlyMid?.endMinute, 18);
  assert.equal(result.economyByPhase.midGame, undefined);
  assert.equal(result.economyByPhase.lateGame, undefined);
});

test('checkpoints beyond the final real snapshot are absent', () => {
  const values = timeline(25);
  const result = normalizeEconomyTimeline(values, values, values, 25 * 60);
  assert.deepEqual(result.checkpoints.map(({ minute }) => minute), [10, 20]);
  assert.equal(result.checkpoints.some(({ minute }) => minute === 35), false);
});

test('lane minute-10 checkpoints remain available without a matching XP timeline', () => {
  const lastHits = timeline(10);
  const gold = timeline(10).map((value) => value * 10);
  const result = normalizeLaneEconomyAt10(gold, lastHits, 20 * 60);
  assert.deepEqual(result, { lhAt10: 100, goldAt10: 1000 });
});

test('lane minute-10 checkpoints are not clamped and reject non-finite values', () => {
  assert.deepEqual(normalizeLaneEconomyAt10(timeline(9), timeline(9), 20 * 60), { lhAt10: undefined, goldAt10: undefined });
  assert.deepEqual(normalizeLaneEconomyAt10([...timeline(9), Number.NaN], [...timeline(9), Number.POSITIVE_INFINITY], 20 * 60), { lhAt10: undefined, goldAt10: undefined });
});
