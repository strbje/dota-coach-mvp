import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStratzMatch } from './normalizeStratzMatch';

type RawEventStats = {
  killEvents?: Array<{ time: number }> | null;
  deathEvents?: Array<{ time: number }> | null;
  assistEvents?: Array<{ time: number }> | null;
};

function player(heroId: number, isRadiant: boolean, stats: RawEventStats = { killEvents: [], deathEvents: [], assistEvents: [] }) {
  return { heroId, isRadiant, stats };
}

function fullRoster() {
  return Array.from({ length: 10 }, (_, index) => player(index === 0 ? 54 : index, index < 5));
}

test('keeps a missing selected death-event stream unavailable', () => {
  const players = fullRoster();
  players[0] = player(54, true, { killEvents: [], assistEvents: [] });

  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.selectedDeathEvents, false);
  assert.equal(result.normalized.selectedPlayer?.deathEvents, undefined);
  assert.equal(result.deathsByPhase, undefined);
  assert.equal(result.deathMetrics.deathsAfterKeyItem.value, null);
});

test('normalizes an available empty selected death stream to zero phase counts', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster() } });

  assert.equal(result.eventCoverage.selectedDeathEvents, true);
  assert.deepEqual(result.normalized.selectedPlayer?.deathEvents, []);
  assert.deepEqual(result.deathsByPhase, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 });
});

test('does not claim all-player death coverage for a nine-player response', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster().slice(0, 9) } });

  assert.equal(result.eventCoverage.allPlayerDeathEvents, false);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.readiness, 'unavailable');
});

test('accepts empty death arrays from a complete unique ten-player roster', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster() } });

  assert.equal(result.eventCoverage.allPlayerDeathEvents, true);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.value, 0);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.readiness, 'research');
});

test('rejects a four-player selected-team denominator', () => {
  const players = fullRoster().map((entry, index) => ({ ...entry, isRadiant: index < 4 }));
  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.teamKillEvents, false);
  assert.equal(result.fightMetrics.readiness, 'unavailable');
});
