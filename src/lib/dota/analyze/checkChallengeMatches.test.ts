import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptChallenge, challengeProgress, checkChallenge, makeTrainingGoal, mergeChallengeCheck } from './trainingChallenge';
import { checkChallengeBatch, startChallengeScan, type ChallengeScan } from './checkChallengeMatches';
import type { TrainingObservation } from '../types/domain';

const base: TrainingObservation = { matchId: 100, accountId: 101, heroId: 42, role: 'carry', gameMode: 22, lobbyType: 7, startTime: 1000, durationSeconds: 2400, lastHitsAt10: 51 };
const accepted = () => acceptChallenge(base, makeTrainingGoal(51)!, 4000)!;
const observation = (id: number, actual: number | undefined = 60): TrainingObservation => ({ ...base, matchId: id, startTime: 5000 + (id - 101) * 1000, lastHitsAt10: actual });
const response = (value: TrainingObservation) => Response.json({ analysis: {
  matchId: value.matchId, hero: 'Wraith King', durationSeconds: value.durationSeconds, grades: {}, finalVerdict: {}, priorities: [], itemTimings: [],
  review: { headline: '', summary: '', factors: [], strengths: [], timeline: [], advantage: [] }, training: { observation: value }
} });
const scanFor = (...ids: number[]): ChallengeScan => ({ history: { matches: [], partial: false, fetchedAt: 10000 }, queue: ids.map((matchId) => ({ matchId, startTime: observation(matchId).startTime! })), results: [] });
const signal = () => new AbortController().signal;

test('discovery excludes old/source games, merges saved pending, deduplicates and sorts', async () => {
  let challenge = checkChallenge(accepted(), { ...observation(102), lastHitsAt10: undefined });
  const scan = await startChallengeScan(challenge, signal(), async (path) => {
    const url = new URL(String(path), 'http://test');
    assert.equal(url.searchParams.get('since'), '4000');
    assert.equal(url.searchParams.get('accountId'), '101');
    return Response.json({ partial: true, fetchedAt: 10000, matches: [{ matchId: 100, startTime: 1000 }, { matchId: 99, startTime: 3999 }, ...scanFor(103, 101, 101).queue] });
  });
  assert.deepEqual(scan.queue.map((match) => match.matchId), [101, 102, 103]);
  assert.equal(scan.history.partial, true);
  for (const id of [101, 102, 103]) challenge = checkChallenge(challenge, observation(id));
  const capped = await startChallengeScan(challenge, signal(), async () => Response.json({ partial: false, fetchedAt: 10000, matches: scanFor(104, 105).queue }));
  assert.deepEqual(capped.queue.map((match) => match.matchId), [101, 102, 103]);
});

test('a failed retry preserves confirmed progress, successful retry fills pending without duplicates', async () => {
  let stored = checkChallenge(accepted(), observation(101));
  let scan = scanFor(102, 103);
  let calls = 0;
  const update = (next: ChallengeScan) => { scan = next; };
  const save = (value: TrainingObservation) => stored = mergeChallengeCheck(JSON.stringify(stored), accepted(), value)!;
  await assert.rejects(checkChallengeBatch({ challenge: stored, scan, signal: signal(), save, update, fetcher: async (_path, init) => {
    const { matchId, selector } = JSON.parse(String(init?.body));
    assert.deepEqual(selector, { accountId: 101, heroId: 42 });
    calls++;
    return calls === 1 ? response({ ...observation(matchId), lastHitsAt10: undefined }) : Response.json({ errorCode: 'STRATZ_TIMEOUT' }, { status: 504 });
  } }));
  assert.deepEqual(stored.checks.map((entry) => entry.actual), [60, undefined]);
  assert.equal(scan.queue[0].matchId, 103);
  await checkChallengeBatch({ challenge: stored, scan: scanFor(101, 102, 103), signal: signal(), save, update, fetcher: async (_path, init) => {
    const id = JSON.parse(String(init?.body)).matchId;
    return response(id === 101 ? { ...observation(id), lastHitsAt10: undefined } : observation(id, id === 102 ? 0 : 70));
  } });
  assert.equal(challengeProgress(stored).counted.length, 3);
  assert.equal(challengeProgress(stored).successes, 2);
  await checkChallengeBatch({ challenge: stored, scan: scanFor(102), signal: signal(), save, update, fetcher: async () => response(observation(102, 65)) });
  assert.equal(stored.checks.length, 3); assert.equal(challengeProgress(stored).successes, 3);
});

test('unknown role stays pending; another confirmed role is skipped; missing token/rate limit do not bypass gate', async () => {
  for (const [code, status] of [['POST_MATCH_ROLE_UNCONFIRMED', 'pending'], ['UNSUPPORTED_POST_MATCH_ROLE', 'skipped']]) {
    const result = await checkChallengeBatch({ challenge: accepted(), scan: scanFor(101), signal: signal(), save: () => { throw new Error('must not save'); }, update: () => {},
      fetcher: async () => Response.json({ errorCode: code }, { status: 422 }) });
    assert.equal(result.results[0].status, status);
  }
  for (const code of ['STRATZ_NOT_CONFIGURED', 'STRATZ_AUTH_FAILED', 'OPENDOTA_RATE_LIMIT']) {
    await assert.rejects(checkChallengeBatch({ challenge: accepted(), scan: scanFor(101), signal: signal(), save: () => { throw new Error('must not save'); }, update: () => {},
      fetcher: async () => Response.json({ errorCode: code }, { status: code.includes('RATE') ? 429 : 503 }) }));
  }
  const confirmed = checkChallenge(accepted(), observation(101));
  await assert.rejects(checkChallengeBatch({ challenge: confirmed, scan: scanFor(101), signal: signal(), save: () => { assert.fail('must not save'); }, update: () => {},
    fetcher: async () => Response.json({ errorCode: 'POST_MATCH_ROLE_UNCONFIRMED' }, { status: 422 }) }), /Ранее подтверждённый результат сохранён/);
  assert.equal(challengeProgress(confirmed).counted.length, 1);
});

test('identity/role/mode/time mismatch and malformed responses never save', async () => {
  for (const patch of [{ accountId: 102 }, { heroId: 1 }, { role: 'support' }, { matchId: 102 }, { startTime: 9999 }, { lobbyType: 0 }, { gameMode: 23 }]) {
    await assert.rejects(checkChallengeBatch({ challenge: accepted(), scan: scanFor(101), signal: signal(), save: () => { assert.fail('must not save'); }, update: () => {}, fetcher: async () => response({ ...observation(101), ...patch }) }));
  }
  await assert.rejects(startChallengeScan(accepted(), signal(), async () => Response.json({ matches: [null], partial: false, fetchedAt: 1 })));
  await assert.rejects(checkChallengeBatch({ challenge: accepted(), scan: scanFor(101), signal: signal(), save: () => { assert.fail('must not save'); }, update: () => {}, fetcher: async () => Response.json({ analysis: {} }) }));
});

test('batch is capped at three with continuation; cancellation and body timeout retain the current queue', async () => {
  const scan = scanFor(101, 102, 103, 104);
  const result = await checkChallengeBatch({ challenge: accepted(), scan, signal: signal(), save: () => { assert.fail('must not save'); }, update: () => {},
    fetcher: async () => Response.json({ errorCode: 'POST_MATCH_ROLE_UNCONFIRMED' }, { status: 422 }) });
  assert.equal(result.results.length, 3); assert.deepEqual(result.queue.map((match) => match.matchId), [104]);
  const controller = new AbortController();
  await assert.rejects(checkChallengeBatch({ challenge: accepted(), scan, signal: controller.signal, save: () => { assert.fail('must not save'); }, update: () => {}, fetcher: async () => { controller.abort(); return response(observation(101)); } }));
  const fetcher: typeof fetch = async (_path, init) => new Response(new ReadableStream({ start(stream) {
    init?.signal?.addEventListener('abort', () => stream.error(new DOMException('Aborted', 'AbortError')), { once: true });
  } }));
  await assert.rejects(checkChallengeBatch({ challenge: accepted(), scan, signal: signal(), requestMs: 5, save: () => { assert.fail('must not save'); }, update: () => {}, fetcher }));
  assert.equal(scan.queue.length, 4);
});

test('latest stored progress wins; removed, corrupt and replaced cycles cannot be resurrected', () => {
  const cycle = accepted();
  const newer = checkChallenge(cycle, observation(102));
  const merged = mergeChallengeCheck(JSON.stringify(newer), cycle, observation(101))!;
  assert.deepEqual(merged.checks.map((entry) => entry.matchId), [101, 102]);
  for (const raw of [null, '{', JSON.stringify({ ...cycle, acceptedAt: 6000 }), JSON.stringify({ ...cycle, scope: { ...cycle.scope, accountId: 102 } })]) {
    assert.equal(mergeChallengeCheck(raw, cycle, observation(101)), null);
  }
});
