import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDeathRules } from './deathRules';

test('counts selected player as first death in a 30 second kill cluster', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    allPlayerDeaths: [
      { heroId: 54, timeSeconds: 100 },
      { heroId: 1, timeSeconds: 115 },
      { heroId: 2, timeSeconds: 200 },
      { heroId: 54, timeSeconds: 205 }
    ],
    selectedDeaths: [{ heroId: 54, timeSeconds: 100 }, { heroId: 54, timeSeconds: 205 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, 1);
  assert.equal(result.firstDeathInKillCluster.clustersWithSelectedPlayerDeath, 2);
  assert.equal(result.firstDeathInKillCluster.minimumDeathsPerCluster, 2);
  assert.equal(result.firstDeathInKillCluster.readiness, 'research');
});

test('does not count a singleton death as a kill cluster', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    allPlayerDeaths: [{ heroId: 54, timeSeconds: 100 }],
    selectedDeaths: [{ heroId: 54, timeSeconds: 100 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, 0);
  assert.equal(result.firstDeathInKillCluster.clustersWithSelectedPlayerDeath, 0);
});

test('does not assign first death when the earliest timestamp is tied', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    allPlayerDeaths: [
      { heroId: 54, timeSeconds: 100 },
      { heroId: 1, timeSeconds: 100 },
      { heroId: 2, timeSeconds: 110 }
    ],
    selectedDeaths: [{ heroId: 54, timeSeconds: 100 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, 0);
  assert.equal(result.firstDeathInKillCluster.ambiguousFirstDeathClusters, 1);
});

test('counts selected player when it is the unique earliest death', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    allPlayerDeaths: [
      { heroId: 54, timeSeconds: 100 },
      { heroId: 1, timeSeconds: 101 }
    ],
    selectedDeaths: [{ heroId: 54, timeSeconds: 100 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, 1);
  assert.equal(result.firstDeathInKillCluster.ambiguousFirstDeathClusters, 0);
});

test('normalizes item and objective death windows without causal claims', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    selectedDeaths: [{ timeSeconds: 700 }, { timeSeconds: 850 }, { timeSeconds: 950 }, { timeSeconds: 1_100 }],
    keyItems: [{ key: 'armlet', item: 'Armlet', time: '10:00', timeSeconds: 600 }],
    objectives: [{ type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 1_000 }]
  });

  assert.equal(result.deathsAfterKeyItem.value, 2);
  assert.equal(result.deathsAfterKeyItem.readiness, 'normalized');
  assert.equal(result.deathsBeforeObjective.value, 1);
  assert.equal(result.deathsBeforeObjective.readiness, 'research');
  assert.equal(result.lateDeathsWithoutBuyback.readiness, 'unavailable');
});

test('counts a death once per objective type when same-type windows overlap', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    selectedDeaths: [{ timeSeconds: 950 }],
    objectives: [
      { type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 1_000 },
      { type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 1_020 },
      { type: 'CHAT_MESSAGE_MINIBOSS_KILL', timeSeconds: 1_030 }
    ]
  });

  assert.equal(result.deathsBeforeObjective.value, 1);
  assert.deepEqual(result.deathsBeforeObjective.byType, { building: 1, roshan: 1 });
});

test('ignores rune and buyback events while retaining building and Roshan candidates', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    selectedDeaths: [{ timeSeconds: 950 }, { timeSeconds: 1_950 }],
    objectives: [
      { type: 'CHAT_MESSAGE_RUNE_PICKUP', timeSeconds: 1_000 },
      { type: 'CHAT_MESSAGE_BUYBACK', timeSeconds: 1_020 },
      { type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 2_000 },
      { type: 'CHAT_MESSAGE_MINIBOSS_KILL', timeSeconds: 2_030 }
    ]
  });

  assert.equal(result.deathsBeforeObjective.value, 1);
  assert.deepEqual(result.deathsBeforeObjective.byType, { building: 1, roshan: 1 });
});

test('missing death telemetry remains unavailable instead of becoming zero', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    keyItems: [{ key: 'armlet', item: 'Armlet', time: '10:00', timeSeconds: 600 }],
    objectives: [{ type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 1_000 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, null);
  assert.equal(result.firstDeathInKillCluster.readiness, 'unavailable');
  assert.equal(result.deathsAfterKeyItem.value, null);
  assert.equal(result.deathsBeforeObjective.value, null);
});

test('available empty death telemetry produces real zeros when candidates exist', () => {
  const result = evaluateDeathRules({
    selectedHeroId: 54,
    allPlayerDeaths: [],
    selectedDeaths: [],
    keyItems: [{ key: 'armlet', item: 'Armlet', time: '10:00', timeSeconds: 600 }],
    objectives: [{ type: 'CHAT_MESSAGE_TOWER_KILL', timeSeconds: 1_000 }]
  });

  assert.equal(result.firstDeathInKillCluster.value, 0);
  assert.equal(result.firstDeathInKillCluster.readiness, 'research');
  assert.equal(result.deathsAfterKeyItem.value, 0);
  assert.equal(result.deathsAfterKeyItem.readiness, 'normalized');
  assert.equal(result.deathsBeforeObjective.value, 0);
  assert.equal(result.deathsBeforeObjective.readiness, 'research');
});

test('empty item and objective candidates remain unavailable', () => {
  const result = evaluateDeathRules({ selectedHeroId: 54, selectedDeaths: [], keyItems: [], objectives: [] });

  assert.equal(result.deathsAfterKeyItem.value, null);
  assert.equal(result.deathsAfterKeyItem.readiness, 'unavailable');
  assert.equal(result.deathsBeforeObjective.value, null);
  assert.equal(result.deathsBeforeObjective.readiness, 'unavailable');
});
