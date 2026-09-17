import assert from 'node:assert/strict';
import test from 'node:test';
import { getMatchPlayerOptions } from './matchPlayers';

test('exposes every match player by slot without a Lifestealer product default', () => {
  const players = getMatchPlayerOptions({ match_id: 42, radiant_win: true, duration: 1200, players: Array.from({ length: 10 }, (_, index) => ({ player_slot: index < 5 ? index : 128 + index - 5, hero_id: index + 1, account_id: index === 3 ? undefined : 1000 + index, personaname: index === 0 ? 'Carry Player' : undefined, kills: 7, deaths: 2, assists: 8, isRadiant: index < 5 })) });
  assert.equal(players.length, 10);
  assert.deepEqual(players.map((player) => player.playerSlot), [0, 1, 2, 3, 4, 128, 129, 130, 131, 132]);
  assert.equal(players[0].heroId, 1);
  assert.equal(players.some((player) => player.heroId === 54), false);
  assert.equal('accountId' in players[3], false);
  assert.deepEqual({ playerName: players[0].playerName, kills: players[0].kills, deaths: players[0].deaths, assists: players[0].assists }, { playerName: 'Carry Player', kills: 7, deaths: 2, assists: 8 });
});

test('filters invalid hero ids and player slots from product options', () => {
  const players = getMatchPlayerOptions({ match_id: 42, radiant_win: true, duration: 1200, players: [
    { player_slot: 0.5, hero_id: 1 }, { player_slot: 5, hero_id: 1 }, { player_slot: 128, hero_id: 0 },
    { player_slot: 129, hero_id: 2.5 }, { player_slot: 132, hero_id: 2, name: 'Valid Player' }
  ] });
  assert.deepEqual(players.map(({ playerSlot, heroId, playerName }) => ({ playerSlot, heroId, playerName })), [{ playerSlot: 132, heroId: 2, playerName: 'Valid Player' }]);
});
