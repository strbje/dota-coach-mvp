import assert from 'node:assert/strict';
import test from 'node:test';
import { findNearestUsableItemTimingBucket, normalizeItemTimingBucket } from './itemTimingBenchmarks';

test('normalizes OpenDota numeric strings and derives win rate', () => {
  const armlet = normalizeItemTimingBucket({ item: 'armlet', time: 720, games: '63', wins: '40' });
  const boots = normalizeItemTimingBucket({ item: 'phase_boots', time: 450, games: '1499', wins: '790' });

  assert.deepEqual(armlet, {
    itemKey: 'armlet', timeLowerBound: 720, timeLabel: '12:00', games: 63, wins: 40,
    winRate: 40 / 63, sampleSize: 'weak', timeSemantics: 'discrete_timing_point'
  });
  assert.equal(boots?.games, 1499);
  assert.equal(boots?.wins, 790);
  assert.equal(boots?.winRate, 790 / 1499);
  assert.equal(boots?.timeLabel, '7:30');
  assert.equal(boots?.sampleSize, 'standard');
});

test('does not select a benchmark row below the sample-size floor', () => {
  const small = normalizeItemTimingBucket({ item: 'armlet', time: 720, games: '29', wins: '20' });
  assert.ok(small);
  assert.equal(findNearestUsableItemTimingBucket([small], 'armlet', 730), undefined);
});

test('rejects fractional and contradictory counters', () => {
  assert.equal(normalizeItemTimingBucket({ item: 'armlet', time: 720, games: '63.5', wins: '40' }), null);
  assert.equal(normalizeItemTimingBucket({ item: 'armlet', time: 720, games: '63', wins: '40.5' }), null);
  assert.equal(normalizeItemTimingBucket({ item: 'armlet', time: 720, games: '63', wins: '64' }), null);
});
