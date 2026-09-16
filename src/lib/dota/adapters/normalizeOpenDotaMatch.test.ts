import assert from 'node:assert/strict';
import test from 'node:test';
import { setHeroConstants } from '../data/heroConstants';
import { getOpenDotaSelectedPlayerMetadata, selectOpenDotaPlayer } from './selectOpenDotaPlayer';

const players = [
  { account_id: 101, player_slot: 0, hero_id: 54 },
  { account_id: 202, player_slot: 1, hero_id: 1 }
];

test('selects the primary OpenDota player by accountId', () => {
  assert.equal(selectOpenDotaPlayer(players, { accountId: 202 }).hero_id, 1);
});

test('selects the primary OpenDota player by playerSlot', () => {
  assert.equal(selectOpenDotaPlayer(players, { playerSlot: 0 }).account_id, 101);
});

test('rejects missing and ambiguous primary OpenDota selections', () => {
  assert.throws(() => selectOpenDotaPlayer(players, { accountId: 999 }), { name: 'PlayerSelectionError' });
  assert.throws(
    () => selectOpenDotaPlayer([...players, { account_id: 303, player_slot: 2, hero_id: 1 }], { heroId: 1 }),
    { name: 'PlayerSelectionError' }
  );
});

test('normalizes selected hero metadata through the constants registry', () => {
  setHeroConstants({
    heroKeyById: { 1: 'antimage', 54: 'life_stealer' },
    heroNameByKey: { antimage: 'Anti-Mage', life_stealer: 'Lifestealer' }
  });
  assert.deepEqual(getOpenDotaSelectedPlayerMetadata(players[1]), {
    accountId: 202, playerSlot: 1, heroId: 1, heroName: 'Anti-Mage', role: undefined
  });
});
