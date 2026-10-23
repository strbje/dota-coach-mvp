import assert from 'node:assert/strict';
import test from 'node:test';
import { encounters, groupMean } from './calculation';
import { applyParticipantUpdate } from './participantUpdate';
import { canRetry, exportCsv } from './presentation';
import { fixturePlan, fixtureResult, FIXTURE_TIME } from './winrates.fixture';
import type { Failure, ParticipantResult } from './types';

function failed(code: Failure): ParticipantResult {
  const result = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 0, 0);
  result.status = code;
  result.history.stop = code;
  result.fetchedAt += 120;
  for (const window of [7, 30] as const) Object.assign(result.samples[window], { complete: false, limitedBy: code });
  return result;
}

test('a retry without observations retains 30/100, real zero wins, freshness and the side mean', () => {
  for (const wins of [0, 30]) for (const code of ['provider_error', 'timeout', 'rate_limit', 'unavailable'] as const) {
    const previous = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, wins, 100);
    const updated = applyParticipantUpdate(previous, failed(code));
    assert.deepEqual(updated, { ...previous, refreshError: code });
    assert.equal(updated.samples[30].wins, wins); assert.equal(updated.samples[30].games, 100);
    assert.equal(updated.samples[30].rate, wins); assert.equal(updated.fetchedAt, previous.fetchedAt);
    assert.equal(updated.history.fetchedAt, previous.history.fetchedAt); assert.equal(updated.expiresAt, previous.expiresAt);
    assert.equal(canRetry(updated), true);
    const plan = fixturePlan(); const rows = encounters(plan, 0);
    const results = { '9000067:1001': updated };
    assert.deepEqual(groupMean(rows, results, 30, 'with'), { mean: wins, available: 1, expected: 4, complete: 1 });
    const csv = exportCsv(plan, rows, results, 30);
    assert.match(csv, /Ошибка обновления/); assert.match(csv, /"100"/);
  }
});

test('a successful retry replaces preserved data and clears its refresh error', () => {
  const previous = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 30, 100);
  const retained = applyParticipantUpdate(previous, failed('timeout'));
  const successful = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 60, 120);
  successful.fetchedAt += 180;
  const updated = applyParticipantUpdate(retained, successful);
  assert.deepEqual(updated, successful); assert.equal(updated.refreshError, undefined);
  assert.equal(updated.samples[30].rate, 50); assert.equal(updated.samples[30].games, 120);
  assert.equal(updated.fetchedAt, successful.fetchedAt); assert.equal(canRetry(updated), false);
  const empty = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 0, 0);
  assert.deepEqual(applyParticipantUpdate(retained, empty), empty, 'a confirmed empty result is an update, not a temporary failure');
  const restricted = { ...failed('unavailable'), status: 'private' as const };
  assert.deepEqual(applyParticipantUpdate(retained, restricted), restricted, 'a newly restricted history must not be presented as a temporary update failure');
});

test('a confirmed empty sample also keeps its coverage and source time after a failed retry', () => {
  const previous = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 0, 0);
  const updated = applyParticipantUpdate(previous, failed('timeout'));
  assert.deepEqual(updated, { ...previous, refreshError: 'timeout' });
  assert.equal(updated.status, 'empty'); assert.equal(updated.samples[30].complete, true);
  assert.equal(updated.samples[30].rate, null); assert.equal(canRetry(updated), true);
});

test('new observations replace the previous sample even if a later history page failed', () => {
  const previous = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 30, 100);
  const next = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 40, 110);
  next.history.stop = 'timeout'; next.samples[30].complete = false; next.samples[30].limitedBy = 'timeout';
  assert.deepEqual(applyParticipantUpdate(previous, next), next);
});

test('data is never retained for another participant, match, basis or calculation time', () => {
  const previous = fixtureResult(1001, 9000067, FIXTURE_TIME - 86400, 30, 100);
  const next = failed('provider_error');
  assert.deepEqual(applyParticipantUpdate(undefined, next), next);
  for (const changed of [{ accountId: 1002 }, { matchId: 9000068 }, { basis: 'now' as const }, { asOf: previous.asOf + 1 }, { capturedAt: previous.capturedAt + 1 }]) {
    const other = { ...next, ...changed };
    assert.deepEqual(applyParticipantUpdate(previous, other), other);
  }
});
