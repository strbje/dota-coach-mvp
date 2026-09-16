import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFightRules } from './fightRules';

type TestPlayer = {
  heroId: number;
  isRadiant: boolean;
  killEvents?: Array<{ timeSeconds: number }>;
  assistEvents?: Array<{ timeSeconds: number }>;
};

function fullRoster(): TestPlayer[] {
  return Array.from({ length: 10 }, (_, index) => ({
    heroId: index === 0 ? 54 : index,
    isRadiant: index < 5,
    killEvents: [],
    assistEvents: []
  }));
}

test('calculates kill and assist participation independently by phase', () => {
  const players = fullRoster();
  players[0].killEvents = [{ timeSeconds: 100 }];
  players[0].assistEvents = [{ timeSeconds: 110 }, { timeSeconds: 800 }];
  players[1].killEvents = [{ timeSeconds: 110 }, { timeSeconds: 800 }];
  players[5].killEvents = [{ timeSeconds: 120 }];
  const result = evaluateFightRules(players, 54);

  assert.equal(result.byPhase?.laning.teamKills, 2);
  assert.equal(result.byPhase?.laning.killParticipation, 1);
  assert.equal(result.byPhase?.laning.assistParticipation, 0.5);
  assert.equal(result.byPhase?.earlyMid.killParticipation, 1);
  assert.equal(result.byPhase?.earlyMid.assistParticipation, 1);
  assert.equal(result.readiness, 'normalized');
});

test('missing selected event arrays keep fight metrics unavailable', () => {
  const players = fullRoster();
  players[0].killEvents = undefined;
  players[0].assistEvents = undefined;
  const result = evaluateFightRules(players, 54);

  assert.equal(result.byPhase, null);
  assert.equal(result.readiness, 'unavailable');
});

test('present empty event arrays produce available zero phase counts', () => {
  const result = evaluateFightRules(fullRoster(), 54);

  assert.equal(result.byPhase?.laning.playerKills, 0);
  assert.equal(result.byPhase?.laning.playerAssists, 0);
  assert.equal(result.byPhase?.laning.teamKills, 0);
  assert.equal(result.byPhase?.laning.killParticipation, null);
  assert.equal(result.byPhase?.laning.assistParticipation, null);
  assert.equal(result.readiness, 'normalized');
});

test('partial teammate kill-event coverage keeps denominator unavailable', () => {
  const players = fullRoster();
  players[1].killEvents = undefined;
  const result = evaluateFightRules(players, 54);

  assert.equal(result.byPhase, null);
  assert.equal(result.readiness, 'unavailable');
});

test('four-player selected team keeps fight denominator unavailable', () => {
  const players = fullRoster().filter((player) => player.heroId !== 4);
  const result = evaluateFightRules(players, 54);

  assert.equal(result.byPhase, null);
  assert.equal(result.readiness, 'unavailable');
});
