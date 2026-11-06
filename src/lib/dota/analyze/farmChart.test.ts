import assert from 'node:assert/strict';
import test from 'node:test';
import { farmChart } from './farmChart';
import type { FarmIntervalReport } from './farmIntervals';

const report: FarmIntervalReport = { source: 'stratz', eventCoverage: 'complete', receivedEvents: 35, reportedLastHits: 35, rejectedEvents: 0,
  intervals: [{ from: 0, to: 300, lastHits: 25, perMinute: 5, breakdown: { lane: 10, neutral: 5, ancient: 5, unclassified: 5 } },
    { from: 300, to: 360, lastHits: 10, perMinute: 10, breakdown: { lane: 10, neutral: 0, ancient: 0, unclassified: 0 } }] };
test('farm chart uses rates, including a short last window, and preserves unknown types', () => {
  const chart = farmChart(report);
  assert.equal(chart.max, 10);
  assert.deepEqual(chart.bars[0].segments?.map((part) => part.rate), [2, 1, 1, 1]);
  assert.equal(chart.bars[1].segments?.[0].rate, 10);
  assert.equal(chart.bars[1].short, true);
});
test('partial categories cannot stand in for full totals; gaps and zeros remain distinct', () => {
  assert.equal(farmChart({ ...report, source: 'opendota', eventCoverage: 'partial' }).bars[0].segments, undefined);
  const chart = farmChart({ ...report, intervals: [
    { from: 0, to: 300 }, { from: 300, to: 600, lastHits: 0, perMinute: 0 },
    { from: 600, to: 900, coveredTo: 720, lastHits: 20, perMinute: 10 }
  ] });
  assert.equal(chart.bars[0].perMinute, undefined);
  assert.equal(chart.bars[1].perMinute, 0);
  assert.equal(chart.bars[2].partial, true);
  assert.equal(chart.bars[2].perMinute, 10);
});
