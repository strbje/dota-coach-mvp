import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOptionalNumber } from './normalizeOptionalNumber';

test('missing or invalid farm telemetry stays unavailable', () => {
  assert.equal(normalizeOptionalNumber(undefined), undefined);
  assert.equal(normalizeOptionalNumber(null), undefined);
  assert.equal(normalizeOptionalNumber('0'), undefined);
  assert.equal(normalizeOptionalNumber(Number.NaN), undefined);
});

test('an explicit farm telemetry zero remains zero', () => {
  assert.equal(normalizeOptionalNumber(0), 0);
});
