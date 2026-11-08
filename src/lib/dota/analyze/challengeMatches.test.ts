import assert from 'node:assert/strict';
import test from 'node:test';
import { findChallengeMatches, parseChallengeSearch, PrivateChallengeHistoryError, type ChallengeSearch } from './challengeMatches';
import { SourceError, type Source } from '../winrates/source';

const query: ChallengeSearch = { accountId: 101, heroId: 42, role: 'carry', gameMode: 22, lobbyType: 7, since: 4000 };
const row = (id: number, time = 5000) => ({ match_id: id, start_time: time, duration: 1200, hero_id: 42, game_mode: 22, lobby_type: 7 });
function source(pages: unknown[], profile: unknown = { fh_unavailable: false }) {
  const paths: string[] = [];
  const value: Source = { async get(path) {
    paths.push(path);
    const data = path.includes('/matches?') ? pages.shift() : { profile };
    if (data instanceof Error) throw data;
    return { value: data, fetchedAt: 99000, expiresAt: 100000 };
  } };
  return { value, paths };
}

test('query rejects missing, anonymous, fractional, negative, nonnumeric and future parameters', () => {
  const valid = new URLSearchParams({ accountId: '101', heroId: '42', gameMode: '22', lobbyType: '7', since: '4000' });
  assert.deepEqual(parseChallengeSearch(valid, 100000), query);
  for (const [key, value] of [['accountId', '4294967295'], ['heroId', ''], ['gameMode', '1.5'], ['lobbyType', '-1'], ['since', '100001'], ['since', 'no']]) {
    const params = new URLSearchParams(valid); params.set(key, value);
    assert.equal(parseChallengeSearch(params, 100000), null);
  }
  valid.delete('accountId'); assert.equal(parseChallengeSearch(valid, 100000), null);
});

test('history only discovers finished games with same hero/mode/lobby after acceptance, sorted and deduplicated', async () => {
  const data = source([[
    row(109, 99900), { ...row(108, 9000), duration: 599 }, { ...row(107, 8500), hero_id: 1 },
    { ...row(106, 8000), game_mode: 23 }, { ...row(105, 7500), lobby_type: 0 }, row(104, 7000), row(104, 7000), row(101), row(100, 3999)
  ]]);
  const result = await findChallengeMatches(data.value, query, undefined, 100000);
  assert.deepEqual(result, { matches: [{ matchId: 101, startTime: 5000 }, { matchId: 104, startTime: 7000 }], partial: false, fetchedAt: 99000 });
  assert.equal(data.paths.length, 2);
  assert.ok(data.paths[1].includes('project=hero_id'));
  assert.ok(!('role' in result.matches[0]), 'history is not evidence of carry');
});

test('private, empty, malformed and first-page provider error are distinct', async () => {
  const privateData = source([[]], { fh_unavailable: true });
  await assert.rejects(findChallengeMatches(privateData.value, query), PrivateChallengeHistoryError);
  assert.equal(privateData.paths.length, 1);
  assert.deepEqual((await findChallengeMatches(source([[]]).value, query)).matches, []);
  for (const page of [null, {}, new SourceError('timeout'), new SourceError('rate_limit')]) {
    await assert.rejects(findChallengeMatches(source([page]).value, query));
  }
});

test('partial page failure retains discoveries; unordered/invalid/conflicting rows cannot claim full history', async () => {
  const full = Array.from({ length: 100 }, (_, i) => row(300 - i, 10000 - i));
  const limited = await findChallengeMatches(source([full, new SourceError('timeout')]).value, query, undefined, 100000);
  assert.equal(limited.matches.length, 100); assert.equal(limited.partial, true);
  const invalid = await findChallengeMatches(source([[row(101), row(101, 6000), { ...row(102), duration: null }, row(103, 4500)]]).value, query, undefined, 100000);
  assert.deepEqual(invalid.matches, [{ matchId: 103, startTime: 4500 }]); assert.equal(invalid.partial, true);
});

test('history stops at time boundary or three pages and abort does not become an empty result', async () => {
  const page = Array.from({ length: 100 }, (_, i) => row(200 - i, 6000 - i * 30));
  const bounded = source([page]);
  assert.equal((await findChallengeMatches(bounded.value, query, undefined, 100000)).partial, false);
  assert.equal(bounded.paths.length, 2);
  const full = Array.from({ length: 3 }, (_, p) => Array.from({ length: 100 }, (_, i) => row(500 - p * 100 - i, 9000 - p * 100 - i)));
  const capped = source(full);
  assert.equal((await findChallengeMatches(capped.value, query, undefined, 100000)).partial, true);
  assert.equal(capped.paths.length, 4);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(findChallengeMatches({ async get() { controller.signal.throwIfAborted(); throw new Error(); } }, query, controller.signal));
});
