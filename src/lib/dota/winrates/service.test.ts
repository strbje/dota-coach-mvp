import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY } from './calculation';
import { handleWinrate } from './handler';
import { calculationKey, InputError, parseBatch, parseParticipantQuery, parseQuery, WinrateService } from './service';
import { SourceError, type Source } from './source';
import { fixtureFilters, fixtureMatch, fixtureRow, FIXTURE_TIME } from './winrates.fixture';
import type { Query } from './types';

const participantQuery = { ...fixtureFilters, matchId: 9000067, accountId: 1001, basis: 'match' as const, capturedAt: FIXTURE_TIME };
function fakeSource(profile: unknown, history: unknown[] | Error, calls: string[] = []): Source {
  return { get: async (path) => {
    calls.push(path);
    if (path.startsWith('/players/') && path.includes('/matches') && history instanceof Error) throw history;
    const value = path.startsWith('/matches/') ? fixtureMatch(Number(path.split('/').at(-1))) : path === '/constants/heroes' ? {} : path.includes('/matches') ? history : profile;
    return { value, fetchedAt: FIXTURE_TIME - 20, expiresAt: FIXTURE_TIME + 280 };
  } };
}

test('private, empty, unknown availability, provider failure and real zero wins are distinct', async () => {
  const cases = [
    { profile: { profile: { fh_unavailable: true } }, history: [], status: 'private', rate: null },
    { profile: { profile: { fh_unavailable: false } }, history: [], status: 'empty', rate: null },
    { profile: {}, history: [], status: 'unavailable', rate: null },
    { profile: { profile: { fh_unavailable: false } }, history: new SourceError('provider_error'), status: 'provider_error', rate: null },
    { profile: { profile: { fh_unavailable: false } }, history: [fixtureRow(1, { radiant_win: false })], status: 'ready', rate: 0 }
  ];
  for (const entry of cases) {
    const calls: string[] = [];
    const result = await new WinrateService(fakeSource(entry.profile, entry.history, calls)).participant(participantQuery);
    assert.equal(result.status, entry.status); assert.equal(result.samples[7].rate, entry.rate);
    if (entry.status === 'unavailable') assert.equal(result.samples[30].complete, false);
    if (entry.status === 'private') assert.ok(!calls.some((path) => path.includes('/matches?')));
  }
});

test('historical and current modes share one captured time but cannot leak future or target results', async () => {
  const service = new WinrateService(fakeSource({ profile: { fh_unavailable: false } }, [fixtureRow(1), fixtureRow(9000067), fixtureRow(2, { start_time: FIXTURE_TIME - 3600 }), fixtureRow(3, { start_time: FIXTURE_TIME + 3600 })]));
  const historical = await service.participant(participantQuery);
  const current = await service.participant({ ...participantQuery, basis: 'now' });
  assert.equal(historical.samples[30].games, 1); assert.equal(current.samples[30].games, 2);
  assert.equal(historical.asOf, FIXTURE_TIME - DAY); assert.equal(current.asOf, FIXTURE_TIME);
  assert.equal(historical.capturedAt, current.capturedAt);
});

test('calculated cache keys distinguish account, target, filters, mode and asOf', () => {
  const base = calculationKey(participantQuery, FIXTURE_TIME - DAY);
  const keys = [
    calculationKey({ ...participantQuery, accountId: 1002 }, FIXTURE_TIME - DAY),
    calculationKey({ ...participantQuery, matchId: 9000068 }, FIXTURE_TIME - DAY),
    calculationKey({ ...participantQuery, rankedOnly: false }, FIXTURE_TIME - DAY),
    calculationKey({ ...participantQuery, excludeTurbo: false }, FIXTURE_TIME - DAY),
    calculationKey({ ...participantQuery, basis: 'now' }, FIXTURE_TIME - DAY),
    calculationKey(participantQuery, FIXTURE_TIME)
  ];
  assert.ok(keys.every((key) => key !== base)); assert.equal(new Set(keys).size, keys.length);
});

test('complete calculated results retain source freshness across reloads without mixing modes', async () => {
  const calls: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const base = fakeSource({ profile: { fh_unavailable: false } }, [fixtureRow(1)], calls);
  const service = new WinrateService({ get: async (...args) => ({ ...await base.get(...args), fetchedAt: now - 20, expiresAt: now + 280 }) });
  const initial = await service.participant({ ...participantQuery, capturedAt: now });
  const repeated = await service.participant({ ...participantQuery, capturedAt: now + 1 });
  assert.equal(repeated.capturedAt, now + 1); assert.equal(repeated.asOf, initial.asOf); assert.equal(repeated.fetchedAt, now - 20);
  assert.equal(calls.filter((path) => path === '/players/1001').length, 1);
  await service.participant({ ...participantQuery, basis: 'now', capturedAt: now });
  assert.equal(calls.filter((path) => path === '/players/1001').length, 2);
});

test('participant must belong to the completed target and invalid IDs/options are rejected', async () => {
  const service = new WinrateService(fakeSource({}, []));
  await assert.rejects(service.participant({ ...participantQuery, accountId: 9999 }), InputError);
  await assert.rejects(service.participant({ ...participantQuery, capturedAt: FIXTURE_TIME - DAY }), InputError);
  const query = { ...fixtureFilters, mode: 'series', basis: 'match', days: 10, id: 1000 };
  for (const id of [0, -1, 1.2, '123', 4294967295, 76561198000000000]) assert.throws(() => parseQuery({ ...query, id }), InputError);
  assert.throws(() => parseQuery({ ...query, rankedOnly: 'true' }), InputError);
  assert.throws(() => parseParticipantQuery({ ...participantQuery, capturedAt: FIXTURE_TIME + 100 }, FIXTURE_TIME), InputError);
  assert.throws(() => parseBatch({ ...query, capturedAt: FIXTURE_TIME, matchIds: [1, 2, 3, 4] }, FIXTURE_TIME), InputError);
  assert.throws(() => parseBatch({ ...query, capturedAt: FIXTURE_TIME, matchIds: [1, 1] }, FIXTURE_TIME), InputError);
});

test('series starts with three unique games, continues at the same capture time and keeps failed rosters', async () => {
  const now = Math.floor(Date.now() / 1000);
  const rows = Array.from({ length: 5 }, (_, index) => fixtureRow(9000067 + index, { start_time: now - (index + 1) * DAY, player_slot: 0 }));
  const source: Source = { get: async (path) => {
    let value: unknown = {};
    if (path.includes('/matches?')) value = [rows[0], ...rows];
    else if (path.startsWith('/players/')) value = { profile: { fh_unavailable: false } };
    else if (path.startsWith('/matches/')) {
      const id = Number(path.split('/').at(-1));
      if (id === 9000068) throw new SourceError('provider_error');
      value = fixtureMatch(id, rows.find((row) => row.match_id === id)!.start_time);
    }
    return { value, fetchedAt: now, expiresAt: now + 300 };
  } };
  const service = new WinrateService(source);
  const query: Query = { ...fixtureFilters, mode: 'series', id: 1000, basis: 'match', days: 10 };
  const plan = await service.plan(query);
  assert.equal(plan.matches.length, 3); assert.equal(plan.series?.found, 5); assert.equal(plan.matches[1].error, 'provider_error');
  assert.deepEqual(plan.series?.remainingIds, [9000070, 9000071]);
  const batch = await service.batch(query, plan.series!.remainingIds, plan.capturedAt);
  assert.equal(batch.length, 2); assert.ok(batch.every((entry) => entry.match?.selectedSlot === 0));
  const wrongPlayer = await service.batch({ ...query, id: 9999 }, [9000070], plan.capturedAt);
  assert.equal(wrongPlayer[0].error, 'unavailable');
  const wrongPeriod = await service.batch({ ...query, days: 7 }, [9000070], plan.capturedAt + 5 * DAY);
  assert.equal(wrongPeriod[0].error, 'unavailable');
});

test('HTTP handler validates input, limits body size, and reports safe no-store errors', async () => {
  const service = new WinrateService(fakeSource({}, []));
  for (const body of ['oops', '{}', ' '.repeat(2100)]) {
    const result = await handleWinrate(new Request('https://local.test', { method: 'POST', body }), 'plan', service);
    assert.equal(result.status, 400); assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  const failing = new WinrateService({ get: async () => { throw new SourceError('rate_limit', 90); } });
  const response = await handleWinrate(new Request('https://local.test', { method: 'POST', body: JSON.stringify({ ...fixtureFilters, mode: 'match', basis: 'match', days: 10, id: 9000067 }) }), 'plan', failing);
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '90'); assert.deepEqual(await response.json(), { error: 'rate_limit', retryAfter: 90 });
});
