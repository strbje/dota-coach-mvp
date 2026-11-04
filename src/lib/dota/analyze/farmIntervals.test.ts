import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFarmIntervals } from './farmIntervals';
import { normalizeFarmEvents } from '../normalize/farmEvents';

test('full equal windows use cumulative deltas and highlight the largest adjacent decline', () => {
  const minutes = Array.from({ length: 26 }, (_, i) => i <= 5 ? i * 10 : i <= 10 ? 50 + (i - 5) * 5 : i <= 15 ? 75 + (i - 10) * 7 : i <= 20 ? 110 + (i - 15) : 115 + (i - 20));
  const result = buildFarmIntervals(1500, minutes);
  assert.deepEqual(result.intervals.map((w) => w.lastHits), [50, 25, 35, 5, 5]);
  assert.deepEqual(result.intervals.map((w) => w.perMinute), [10, 5, 7, 1, 1]);
  assert.equal(result.highlightIndex, 3);
});

test('gaps, regressions, missing starts and short endings do not become zero or a highlighted decline', () => {
  const minutes = Array.from({ length: 17 }, (_, i) => i * 10) as Array<number | null>;
  minutes[8] = null;
  const result = buildFarmIntervals(1010, minutes);
  assert.deepEqual(result.intervals.map((w) => [w.lastHits, w.coveredTo]), [[50, 300], [20, 420], [50, 900], [10, 960]]);
  assert.equal(result.highlightIndex, undefined);
  assert.equal(buildFarmIntervals(600, [0, 10, 20, 2, 30, 40]).intervals[0].coveredTo, 120);
  assert.equal(buildFarmIntervals(300, [null, 10, 20, 30, 40, 50]).intervals[0].lastHits, undefined);
  assert.equal(buildFarmIntervals(300).intervals[0].lastHits, undefined);
  assert.equal(buildFarmIntervals(600, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).intervals[1].lastHits, 0);
});

test('complete events partition once at boundaries, include match end and preserve zero windows', () => {
  const farm = normalizeFarmEvents([0, 299, 300, 300, 1200].map((time) => ({ time })), 5, 1200);
  const result = buildFarmIntervals(1200, [0, 100], farm);
  assert.equal(result.source, 'stratz');
  assert.deepEqual(result.intervals.map((w) => w.lastHits), [2, 2, 0, 1]);
  assert.equal(result.intervals.reduce((sum, w) => sum + w.lastHits!, 0), 5);
  assert.deepEqual(result.intervals[2].breakdown, { lane: 0, neutral: 0, ancient: 0, unclassified: 0 });
  assert.equal(result.highlightIndex, 2);
});

test('partial event breakdown never replaces minute counts, invents empty categories or drives a comparison', () => {
  const farm = normalizeFarmEvents([{ time: 301, isCreep: true, isNeutral: false, isAncient: false }], 60, 600);
  const result = buildFarmIntervals(600, Array.from({ length: 11 }, (_, i) => i * 6), farm);
  assert.equal(result.source, 'opendota');
  assert.equal(result.eventCoverage, 'partial');
  assert.deepEqual(result.intervals.map((w) => w.lastHits), [30, 30]);
  assert.equal(result.intervals[0].breakdown, undefined);
  assert.equal(result.intervals[1].breakdown?.lane, 1);
  assert.equal(result.highlightIndex, undefined);
  const partialOnly = buildFarmIntervals(600, undefined, farm);
  assert.equal(partialOnly.source, 'unavailable');
  assert.equal(partialOnly.intervals[1].lastHits, undefined);
});

test('a different provider duration prevents complete coverage and excludes events beyond this match end', () => {
  const farm = normalizeFarmEvents([{ time: 60 }, { time: 620 }], 2, 630);
  const result = buildFarmIntervals(600, undefined, farm);
  assert.equal(result.source, 'unavailable');
  assert.equal(result.eventCoverage, 'partial');
  assert.equal(result.receivedEvents, 1);
  assert.equal(result.rejectedEvents, 1);
  assert.equal(result.highlightIndex, undefined);
});

test('ties choose the first decline, a rising series and short final zero have no highlight', () => {
  const farm = normalizeFarmEvents([10, 20, 30, 310, 320, 610].map((time) => ({ time })), 6, 901);
  assert.equal(buildFarmIntervals(901, undefined, farm).highlightIndex, 1);
  assert.equal(buildFarmIntervals(599, undefined, normalizeFarmEvents([{ time: 1 }], 1, 599)).highlightIndex, undefined);
  assert.equal(buildFarmIntervals(600, Array.from({ length: 11 }, (_, i) => i * i)).highlightIndex, undefined);
});
