import test from 'node:test';
import assert from 'node:assert/strict';
import { activeChallenges, readRecentMatches, rememberMatch, RECENT_MATCHES_KEY, recentMatchHref } from './localProgress';
import { acceptChallenge, challengeStorageKey, checkChallenge, makeTrainingGoal } from './analyze/trainingChallenge';
const match = { matchId: 1, playerSlot: 129, hero: 'Wraith King', heroId: 42, accountId: 42, heroKey: 'skeleton_king', openedAt: 100 };
function storage() {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test('recent matches validate untrusted storage, retain distinct players and bound history', () => {
  for (const raw of ['null', '{', '{}']) assert.deepEqual(readRecentMatches(raw), []);
  assert.deepEqual(readRecentMatches(JSON.stringify([{ ...match, matchId: '1' }, { ...match, playerSlot: 9 }, { ...match, heroKey: '../bad' }])), []);
  const store = storage();
  for (let id = 1; id <= 6; id++) rememberMatch(store, { ...match, matchId: id, openedAt: id });
  rememberMatch(store, { ...match, matchId: 6, openedAt: 10 });
  rememberMatch(store, { ...match, matchId: 6, playerSlot: 128, openedAt: 11, accountId: 4294967295 });
  const recent = readRecentMatches(store.getItem(RECENT_MATCHES_KEY));
  assert.equal(recent.length, 5);
  assert.deepEqual(recent.slice(0, 2).map((m) => [m.matchId, m.playerSlot, m.openedAt]), [[6, 128, 11], [6, 129, 10]]);
  assert.equal(recent[0].accountId, undefined);
  assert.equal(recentMatchHref(recent[0]), '/post-match?matchId=6&playerSlot=128');
});
test('home goals reuse challenge validation and exclude complete, corrupted and wrong-key progress', () => {
  const store = storage();
  const observation = { matchId: 100, accountId: 42, heroId: 42, role: 'carry', gameMode: 22, lobbyType: 7, startTime: 100, durationSeconds: 1800, lastHitsAt10: 50 };
  const challenge = acceptChallenge(observation, makeTrainingGoal(50)!, 200)!;
  const key = challengeStorageKey(observation)!;
  store.setItem(key, JSON.stringify(challenge));
  store.setItem(key + ':bad', JSON.stringify(challenge));
  store.setItem(key + ':broken', '{');
  assert.equal(activeChallenges(store).length, 1);
  let updated = challenge;
  for (let i = 1; i <= 3; i++) updated = checkChallenge(updated, { ...observation, matchId: 100 + i, startTime: 200 + i, lastHitsAt10: 55 });
  store.setItem(key, JSON.stringify(updated));
  assert.equal(activeChallenges(store).length, 0);
});
