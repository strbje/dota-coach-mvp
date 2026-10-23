// Synthetic IDs/names only. Never a live OpenDota acceptance fixture.
import { setHeroConstants } from '../data/heroConstants';
import { normalizeRoster, sample } from './calculation';
import type { ParticipantResult, Plan, Results } from './types';

export const FIXTURE_TIME = 1780000000;
export const fixtureFilters = { rankedOnly: true, excludeTurbo: true };
export function fixtureMatch(matchId = 9000067, start = FIXTURE_TIME - 86400, selected = 0) {
  return { match_id: matchId, start_time: start, duration: 2400, lobby_type: 7, game_mode: 22, radiant_win: true,
    players: Array.from({ length: 10 }, (_, index) => ({ account_id: 1000 + index, player_slot: index < 5 ? index : index + 123, hero_id: index + 1, personaname: `Участник ${index + 1}`, ...(index === selected ? { personaname: 'Выбранный игрок' } : {}) })) };
}
export function fixtureRow(id = 1, overrides: Record<string, unknown> = {}) {
  return { match_id: id, start_time: FIXTURE_TIME - 2 * 86400, duration: 2400, lobby_type: 7, game_mode: 22, player_slot: 0, radiant_win: true, ...overrides };
}
export function fixturePlan(mode: 'match' | 'series' = 'match'): Plan {
  const keys = ['antimage', 'axe', 'bane', 'bloodseeker', 'crystal_maiden', 'drow_ranger', 'earthshaker', 'juggernaut', 'mirana', 'morphling'];
  const names = ['Anti-Mage', 'Axe', 'Bane', 'Bloodseeker', 'Crystal Maiden', 'Drow Ranger', 'Earthshaker', 'Juggernaut', 'Mirana', 'Morphling'];
  setHeroConstants({ heroKeyById: Object.fromEntries(keys.map((key, index) => [index + 1, key])), heroNameByKey: Object.fromEntries(keys.map((key, index) => [key, names[index]])) });
  const match = normalizeRoster(fixtureMatch(), 9000067);
  const entries = [{ matchId: match.matchId, match: { ...match, selectedSlot: 0 } }];
  if (mode === 'series') {
    const second = normalizeRoster(fixtureMatch(9000068, FIXTURE_TIME - 2 * 86400), 9000068);
    // Same participant meets the selected player on the other side in the second game.
    [second.players[1].accountId, second.players[5].accountId] = [second.players[5].accountId, second.players[1].accountId];
    entries.push({ matchId: second.matchId, match: { ...second, selectedSlot: 0 } });
  }
  return { query: { ...fixtureFilters, id: mode === 'match' ? 9000067 : 1000, mode, days: 10, basis: 'match' }, capturedAt: FIXTURE_TIME,
    matches: entries, ...(mode === 'series' ? { series: { found: 2, shown: 2, remainingIds: [], status: 'ready' as const, history: { stop: 'exhausted' as const, scanned: 2, invalid: 0, oldest: FIXTURE_TIME - 2 * 86400, ordered: true, fetchedAt: FIXTURE_TIME, expiresAt: FIXTURE_TIME + 300 } } } : {}) };
}
export function fixtureResult(id: number, matchId = 9000067, asOf = FIXTURE_TIME - 86400, wins = 3, games = 5): ParticipantResult {
  const history = { rows: Array.from({ length: games }, (_, index) => ({ matchId: index + 1, startTime: asOf - 3600 * (index + 1), duration: 1800, playerSlot: 0, win: index < wins })),
    stop: 'exhausted' as const, scanned: games, invalid: 0, oldest: asOf - 3600 * games, ordered: true, fetchedAt: FIXTURE_TIME, expiresAt: FIXTURE_TIME + 300 };
  const { rows, ...summary } = history; void rows;
  return { accountId: id, matchId, basis: 'match', asOf, capturedAt: FIXTURE_TIME, status: games ? 'ready' : 'empty', samples: { 7: sample(history, 7, asOf, matchId), 30: sample(history, 30, asOf, matchId) }, history: summary, fetchedAt: FIXTURE_TIME, expiresAt: FIXTURE_TIME + 300 };
}
export function fixtureResults(plan: Plan): Results {
  return Object.fromEntries(plan.matches.flatMap(({ match }) => match?.players.filter((player) => player.accountId !== 1000).map((player, index) => [`${match.matchId}:${player.accountId}`, fixtureResult(player.accountId!, match.matchId, match.startTime, index % 4, 5)]) ?? []));
}
