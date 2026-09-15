import assert from 'node:assert/strict';
import test from 'node:test';
import { getPercentileForValue } from './compareToBenchmarks';

const buckets = [
  { percentile: 0.1, value: 100 },
  { percentile: 0.9, value: 900 },
  { percentile: 0.95, value: 950 },
  { percentile: 0.99, value: 990 }
];

test('value below p10 keeps a numeric upper boundary and a low score signal', () => {
  const result = getPercentileForValue(buckets, 50);
  assert.equal(result.percentileRange, '<10');
  assert.equal(result.lowerPercentile, undefined);
  assert.equal(result.upperPercentile, 10);
});

test('value exactly at p10 uses p10 as its lower boundary', () => {
  const result = getPercentileForValue(buckets, 100);
  assert.equal(result.lowerPercentile, 10);
  assert.equal(result.upperPercentile, 90);
});

test('value between p90 and p95 returns the 90-95 range', () => {
  const result = getPercentileForValue(buckets, 925);
  assert.equal(result.percentileRange, '90-95');
  assert.equal(result.lowerPercentile, 90);
  assert.equal(result.upperPercentile, 95);
});

test('value above p99 returns the open-ended 99+ range', () => {
  const result = getPercentileForValue(buckets, 1_000);
  assert.equal(result.percentileRange, '99+');
  assert.equal(result.lowerPercentile, 99);
  assert.equal(result.upperPercentile, undefined);
});

test('empty benchmark data has no numeric boundaries', () => {
  const result = getPercentileForValue([], 500);
  assert.equal(result.percentileRange, 'n/a');
  assert.equal(result.lowerPercentile, undefined);
  assert.equal(result.upperPercentile, undefined);
});
