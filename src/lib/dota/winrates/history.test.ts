import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, sample } from './calculation';
import { historyPath, readHistory } from './history';
import { SourceError, type Source } from './source';
import { fixtureFilters, fixtureRow, FIXTURE_TIME } from './winrates.fixture';

function sourceFor(rows: unknown[], calls: string[] = []): Source {
  return { get: async (path) => { calls.push(path); const offset = Number(new URL(path, 'https://example.test').searchParams.get('offset')); return { value: rows.slice(offset, offset + 100), fetchedAt: FIXTURE_TIME, expiresAt: FIXTURE_TIME + 300 }; } };
}

test('pagination reaches a boundary, caps at 300 honestly, and proves 7/30 days separately', async () => {
  const calls: string[] = [];
  const rows = Array.from({ length: 400 }, (_, i) => fixtureRow(i + 1, { start_time: FIXTURE_TIME - (i + 1) * 3600 }));
  const history = await readHistory(sourceFor(rows, calls), 1001, fixtureFilters, FIXTURE_TIME, 30, Date.now() + 1000);
  assert.equal(calls.length, 3); assert.equal(history.scanned, 300); assert.equal(history.stop, 'cap');
  assert.equal(sample(history, 7, FIXTURE_TIME, 9999).complete, true); assert.equal(sample(history, 30, FIXTURE_TIME, 9999).complete, false);
  const sparse = rows.map((row, index) => ({ ...row, start_time: FIXTURE_TIME - (index + 1) * DAY }));
  const boundary = await readHistory(sourceFor(sparse), 1001, fixtureFilters, FIXTURE_TIME, 30, Date.now() + 1000);
  assert.equal(boundary.stop, 'boundary'); assert.equal(boundary.scanned, 100); assert.equal(sample(boundary, 30, FIXTURE_TIME, 9999).complete, true);
});

test('exact duplicates count once; conflicting duplicates are excluded deterministically', async () => {
  const a = fixtureRow(1); const b = fixtureRow(2);
  const rows = [a, a, b, { ...b, radiant_win: false }];
  const result = await readHistory(sourceFor(rows), 1001, fixtureFilters, FIXTURE_TIME, 30, Date.now() + 1000);
  assert.equal(result.rows.length, 1); assert.equal(result.invalid, 1); assert.equal(sample(result, 7, FIXTURE_TIME, 9999).games, 1);
  assert.equal(sample(result, 7, FIXTURE_TIME, 9999).complete, false);
});

test('unknown fields and broken order prevent a claim of complete coverage', async () => {
  const history = await readHistory(sourceFor([fixtureRow(1, { start_time: FIXTURE_TIME - 40 * DAY }), fixtureRow(2), fixtureRow(3, { duration: undefined })]), 1001, fixtureFilters, FIXTURE_TIME, 30, Date.now() + 1000);
  assert.equal(history.ordered, false); assert.equal(history.invalid, 1); assert.equal(sample(history, 30, FIXTURE_TIME, 9).complete, false);
});

test('a later provider failure preserves received observations and marks missing coverage', async () => {
  let calls = 0;
  const source: Source = { get: async () => { if (calls++) throw new SourceError('rate_limit', 60); return { value: Array.from({ length: 100 }, (_, index) => fixtureRow(index + 1)), fetchedAt: FIXTURE_TIME, expiresAt: FIXTURE_TIME + 300 }; } };
  const result = await readHistory(source, 1001, fixtureFilters, FIXTURE_TIME, 30, Date.now() + 1000);
  assert.equal(result.rows.length, 100); assert.equal(result.stop, 'rate_limit'); assert.equal(sample(result, 7, FIXTURE_TIME, 9000067).rate, 100);
  assert.equal(sample(result, 7, FIXTURE_TIME, 9000067).complete, false);
});

test('historical requests use explicit pagination/order/projection, not a current-relative date', () => {
  const url = new URL(historyPath(1001, fixtureFilters, 200), 'https://example.test');
  assert.equal(url.searchParams.get('offset'), '200'); assert.equal(url.searchParams.get('sort'), 'start_time'); assert.equal(url.searchParams.get('significant'), '0');
  assert.equal(url.searchParams.get('lobby_type'), '7'); assert.ok(url.searchParams.getAll('project').includes('duration')); assert.equal(url.searchParams.has('date'), false);
  assert.equal(new URL(historyPath(1001, { rankedOnly: false, excludeTurbo: false }, 0), url).searchParams.has('lobby_type'), false);
});
