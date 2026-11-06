import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptChallenge, challengeProgress, challengeStorageKey, checkChallenge, makeTrainingGoal, readChallenge, resolveLastHitsAt10 } from './trainingChallenge';
import { normalizeFarmEvents } from '../normalize/farmEvents';
import type { TrainingObservation } from '../types/domain';

const base: TrainingObservation = { matchId: 100, accountId: 101, heroId: 42, role: 'carry', gameMode: 22, lobbyType: 7, startTime: 1000, durationSeconds: 2400, lastHitsAt10: 51 };
const accepted = () => acceptChallenge(base, makeTrainingGoal(51)!, 4000)!;

test('complete farm events supply the missing checkpoint, with the same half-open boundary and no deduplication', () => {
  const farm = normalizeFarmEvents([{ time: 0 }, { time: 299 }, { time: 599 }, { time: 599 }, { time: 600 }, { time: 601 }], 6, 1200)!;
  assert.deepEqual(resolveLastHitsAt10(1200, undefined, farm), { value: 4, source: 'stratz' });
  assert.deepEqual(resolveLastHitsAt10(1200, 0, farm), { value: 0, source: 'opendota' });
  assert.deepEqual(resolveLastHitsAt10(1200, 7, farm), { value: 7, source: 'opendota' });
  assert.deepEqual(resolveLastHitsAt10(1200, undefined, normalizeFarmEvents([], 0, 1200)), { value: 0, source: 'stratz' });
  for (const bad of [{ ...farm, coverage: 'partial' as const }, { ...farm, durationSeconds: 1199 }, { ...farm, rejectedEvents: 1 }, { ...farm, reportedLastHits: 7 }]) {
    assert.equal(resolveLastHitsAt10(1200, undefined, bad), undefined);
  }
  assert.equal(resolveLastHitsAt10(599, 10, normalizeFarmEvents([{ time: 30 }], 1, 599)), undefined);
});

test('confirmed STRATZ checkpoints can accept, fill pending and update the existing challenge once per match', () => {
  const farm = normalizeFarmEvents(Array.from({ length: 56 }, (_, i) => ({ time: i * 10 })), 56, 1200);
  const checkpoint = resolveLastHitsAt10(1200, undefined, farm)!;
  const observation = { ...base, matchId: 101, startTime: 5000, lastHitsAt10: checkpoint.value, lastHitsAt10Source: checkpoint.source };
  let challenge = checkChallenge(accepted(), { ...observation, lastHitsAt10: undefined });
  challenge = checkChallenge(challenge, observation);
  challenge = checkChallenge(challenge, observation);
  assert.equal(challengeProgress(challenge).successes, 1);
  assert.equal(challenge.checks.length, 1);
  assert.equal(acceptChallenge({ ...base, ...checkpoint, lastHitsAt10: checkpoint.value }, makeTrainingGoal(checkpoint.value)!, 4000)?.goal.target, 61);
});

test('training target is explicit +5, not a hero norm; anonymous or unscoped identities cannot persist', () => {
  assert.equal(accepted().goal.target, 56);
  assert.equal(accepted().goal.source, 'training');
  assert.equal(makeTrainingGoal(0)?.target, 5);
  assert.equal(makeTrainingGoal(undefined), undefined);
  assert.equal(makeTrainingGoal(-1), undefined);
  for (const change of [{ accountId: 0 }, { accountId: 4294967295 }, { accountId: undefined }, { role: 'unknown' }, { gameMode: undefined }, { lobbyType: undefined }]) {
    assert.equal(challengeStorageKey({ ...base, ...change }), null);
    assert.equal(acceptChallenge({ ...base, ...change }, makeTrainingGoal(51)!, 4000), null);
  }
});

test('only new matches of the same player/hero/role/mode/lobby can advance progress', () => {
  const challenge = accepted();
  for (const change of [{ accountId: 102 }, { heroId: 54 }, { role: 'support' }, { gameMode: 23 }, { lobbyType: 0 }, { startTime: 3999 }, { startTime: undefined }, { matchId: 100 }]) {
    assert.equal(checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000, ...change }), challenge);
  }
  assert.notEqual(challengeStorageKey(base), challengeStorageKey({ ...base, heroId: 54 }));
});

test('missing and short matches neither succeed nor fail, reparsing can supply the missing checkpoint', () => {
  let challenge = checkChallenge(accepted(), { ...base, matchId: 101, startTime: 5000, lastHitsAt10: undefined });
  challenge = checkChallenge(challenge, { ...base, matchId: 102, startTime: 6000, durationSeconds: 599 });
  assert.equal(challengeProgress(challenge).counted.length, 0);
  challenge = checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000, lastHitsAt10: 56 });
  assert.equal(challengeProgress(challenge).counted.length, 1);
  assert.equal(challenge.checks.find((entry) => entry.matchId === 101)?.actual, 56);
  challenge = checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000, lastHitsAt10: 56 });
  assert.equal(challengeProgress(challenge).successes, 1);
  assert.equal(challengeProgress(challenge).counted.length, 1);
  assert.equal(challenge.checks.filter((entry) => entry.matchId === 101).length, 1);
  assert.equal(challenge.checks.length, 2);
  challenge = checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000, lastHitsAt10: undefined });
  assert.equal(challengeProgress(challenge).counted.length, 1);
  assert.equal(challenge.checks.find((entry) => entry.matchId === 101)?.actual, 56);
});

test('reloading a completed challenge without a usable checkpoint preserves all three confirmed results', () => {
  let challenge = accepted();
  for (const [matchId, startTime, lastHitsAt10] of [[101, 5000, 56], [102, 6000, 60], [103, 7000, 0]]) {
    challenge = checkChallenge(challenge, { ...base, matchId, startTime, lastHitsAt10 });
  }
  const saved = readChallenge(JSON.stringify(challenge), base)!;
  assert.equal(challengeProgress(saved).complete, true);
  for (const matchId of [101, 102, 103]) {
    for (const change of [{ lastHitsAt10: undefined }, { lastHitsAt10: NaN }, { lastHitsAt10: -1 }, { lastHitsAt10: 1.5 }, { durationSeconds: 599 }]) {
      const reloaded = checkChallenge(saved, { ...base, matchId, startTime: (matchId - 96) * 1000, ...change });
      assert.deepEqual(reloaded.checks, saved.checks);
      assert.equal(challengeProgress(reloaded).counted.length, 3);
      assert.equal(challengeProgress(reloaded).complete, true);
      assert.equal(challengeProgress(reloaded).successes, 2);
    }
  }
});

test('a new usable result replaces the previous value without counting the match twice', () => {
  let challenge = checkChallenge(accepted(), { ...base, matchId: 101, startTime: 5000, lastHitsAt10: 56 });
  for (const lastHitsAt10 of [0, 60, 55]) {
    challenge = checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000, lastHitsAt10 });
    assert.deepEqual(challenge.checks, [{ matchId: 101, startTime: 5000, actual: lastHitsAt10 }]);
    assert.equal(challengeProgress(challenge).counted.length, 1);
    assert.equal(challengeProgress(challenge).successes, lastHitsAt10 >= 56 ? 1 : 0);
  }
});

test('zero is a real result and three checked matches are ordered by match time, not viewing order', () => {
  let challenge = accepted();
  for (const [matchId, startTime, lastHitsAt10] of [[104, 9000, 70], [102, 6000, 0], [103, 7000, 56], [101, 5000, 58]]) {
    challenge = checkChallenge(challenge, { ...base, matchId, startTime, lastHitsAt10 });
  }
  const progress = challengeProgress(challenge);
  assert.deepEqual(progress.counted.map((entry) => entry.matchId), [101, 102, 103]);
  assert.equal(progress.successes, 2);
  assert.equal(progress.complete, true);
});

test('corrupt/old storage, duplicated matches and wrong identity cannot invent progress', () => {
  const challenge = accepted();
  assert.deepEqual(readChallenge(JSON.stringify(challenge), base), challenge);
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...challenge, version: 2 }), JSON.stringify({ ...challenge, goal: { ...challenge.goal, target: 1 } }), JSON.stringify({ ...challenge, checks: [{ matchId: 101, startTime: 5000, actual: null }] })]) {
    assert.equal(readChallenge(raw, base), null);
  }
  assert.equal(readChallenge(JSON.stringify(challenge), { ...base, accountId: 102 }), null);
  const checked = checkChallenge(challenge, { ...base, matchId: 101, startTime: 5000 });
  assert.equal(readChallenge(JSON.stringify({ ...checked, checks: [...checked.checks, ...checked.checks] }), base), null);
});

test('many missing matches cannot crowd out a later real result', () => {
  let challenge = accepted();
  for (let i = 0; i < 60; i++) challenge = checkChallenge(challenge, { ...base, matchId: 200 + i, startTime: 5000 + i, lastHitsAt10: undefined });
  challenge = checkChallenge(challenge, { ...base, matchId: 300, startTime: 7000, lastHitsAt10: 60 });
  assert.equal(challengeProgress(challenge).successes, 1);
  assert.ok(challenge.checks.length <= 50);
});
