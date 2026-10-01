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

test('a 40-minute match keeps the confirmed 20-25 interval from truncated timelines', () => {
  const values = timeline(25);
  const result = normalizeEconomyTimeline(values, values, values, 40 * 60);
  assert.equal(result.economyByPhase.midGame?.startMinute, 20);
  assert.equal(result.economyByPhase.midGame?.endMinute, 25);
  assert.equal(result.economyByPhase.midGame?.durationMinutes, 5);
  assert.equal(result.economyByPhase.midGame?.goldDelta, 50);
  assert.equal(result.economyByPhase.lateGame, undefined);
});

test('a single truncated last-hit timeline keeps only its confirmed interval', () => {
  const result = normalizeEconomyTimeline(null, timeline(25), null, 40 * 60);
  assert.equal(result.economyByPhase.midGame?.endMinute, 25);
  assert.equal(result.economyByPhase.midGame?.durationMinutes, 5);
  assert.equal(result.economyByPhase.midGame?.lhDelta, 50);
  assert.equal(result.economyByPhase.midGame?.goldDelta, undefined);
});

test('an 18-minute match has no mid-game or late-game phases', () => {
  const values = timeline(18);
  const result = normalizeEconomyTimeline(values, values, values, 18 * 60);
  assert.equal(result.economyByPhase.earlyMid?.endMinute, 18);
  assert.equal(result.economyByPhase.midGame, undefined);
  assert.equal(result.economyByPhase.lateGame, undefined);
});

test('a match shorter than five minutes still keeps its available lane interval', () => {
  const values = timeline(4);
  const result = normalizeEconomyTimeline(values, values, values, 4 * 60);
  assert.equal(result.economyByPhase.laning?.endMinute, 4);
  assert.equal(result.economyByPhase.laning?.goldDelta, 40);
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

test('keeps available metrics when another economy timeline is missing', () => {
  const values = timeline(20);
  const result = normalizeEconomyTimeline(null, values, null, 20 * 60);
  assert.equal(result.economyByPhase.laning?.lhDelta, 100);
  assert.equal(result.economyByPhase.laning?.goldDelta, undefined);
  assert.deepEqual(result.checkpoints, [
    { minute: 10, cs: 100, totalGold: undefined },
    { minute: 20, cs: 200, totalGold: undefined }
  ]);
});

test('does not replace a missing endpoint with zero or a shorter timeline value', () => {
  const gold = timeline(20);
  gold[10] = Number.NaN;
  const result = normalizeEconomyTimeline(gold, timeline(20), null, 20 * 60);
  assert.equal(result.economyByPhase.laning?.goldPerMinuteInPhase, undefined);
  assert.equal(result.economyByPhase.laning?.lhPerMinuteInPhase, 10);
  assert.equal(result.checkpoints[0].totalGold, undefined);
});

test('uses only the last completed minute for a match with an incomplete final minute', () => {
  const values = timeline(26);
  const result = normalizeEconomyTimeline(values, values, values, 25 * 60 + 59);
  assert.equal(result.economyByPhase.midGame?.endMinute, 25);
  assert.equal(result.economyByPhase.midGame?.durationMinutes, 5);
  assert.equal(result.lastSnapshotMinute, 25);
});

test('preserves confirmed zero snapshots as data', () => {
  const zeros = Array.from({ length: 11 }, () => 0);
  const result = normalizeEconomyTimeline(zeros, zeros, zeros, 10 * 60);
  assert.equal(result.economyByPhase.laning?.goldDelta, 0);
  assert.equal(result.economyByPhase.laning?.lhDelta, 0);
  assert.equal(result.economyByPhase.laning?.xpDelta, 0);
  assert.deepEqual(result.checkpoints, [{ minute: 10, cs: 0, totalGold: 0 }]);
});
