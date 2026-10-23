import { getMatchPlayerOptions } from '../selection/matchPlayers';
import type { OpenDotaMatchResponse } from '../types/providers';
import type { Encounter, Filters, History, HistoryRow, Plan, Results, RosterPlayer, Sample, Sort, TargetMatch, WindowDays } from './types';

export const DAY = 86400;
export const SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const accountId = (value: unknown): value is number => positiveId(value) && value < 4294967295;
const validTime = (value: unknown): value is number => positiveId(value);

export function eligible(raw: Record<string, unknown>, filters: Filters): boolean | null {
  if (filters.rankedOnly && !Number.isInteger(raw.lobby_type)) return null;
  if (filters.excludeTurbo && !Number.isInteger(raw.game_mode)) return null;
  return (!filters.rankedOnly || raw.lobby_type === 7) && (!filters.excludeTurbo || raw.game_mode !== 23);
}

export function normalizeHistoryRow(value: unknown, filters: Filters): HistoryRow | 'filtered' | null {
  const raw = record(value);
  const matchesFilter = eligible(raw, filters);
  if (matchesFilter === false) return 'filtered';
  if (matchesFilter === null || !positiveId(raw.match_id) || !validTime(raw.start_time)
    || !positiveId(raw.duration) || typeof raw.radiant_win !== 'boolean'
    || typeof raw.player_slot !== 'number' || !SLOTS.includes(raw.player_slot)) return null;
  return { matchId: raw.match_id, startTime: raw.start_time, duration: raw.duration, playerSlot: raw.player_slot, win: raw.radiant_win === (raw.player_slot < 128) };
}

export function inWindow(row: HistoryRow, from: number, asOf: number, excludeMatchId?: number) {
  return row.matchId !== excludeMatchId && row.startTime >= from && row.startTime + row.duration < asOf;
}

export function sample(history: History, days: WindowDays, asOf: number, excludeMatchId: number): Sample {
  const from = asOf - days * DAY;
  const rows = history.rows.filter((row) => inWindow(row, from, asOf, excludeMatchId));
  const wins = rows.filter((row) => row.win).length;
  const reached = history.stop === 'exhausted' || (history.oldest !== null && history.oldest < from);
  const complete = reached && history.ordered && history.invalid === 0;
  return {
    days, from, to: asOf, wins, games: rows.length, rate: rows.length ? wins / rows.length * 100 : null,
    first: rows.length ? Math.min(...rows.map((row) => row.startTime)) : null,
    last: rows.length ? Math.max(...rows.map((row) => row.startTime)) : null,
    complete, limitedBy: complete ? null : !history.ordered ? 'order' : history.invalid ? 'invalid' : history.stop
  };
}

export function normalizeRoster(payload: unknown, requestedId: number): TargetMatch {
  const raw = record(payload);
  if (raw.match_id !== requestedId || !validTime(raw.start_time) || !positiveId(raw.duration) || !Array.isArray(raw.players)) throw new Error('Invalid match response');
  const rawPlayers = raw.players.map(record);
  const options = getMatchPlayerOptions({ ...raw, players: rawPlayers } as unknown as OpenDotaMatchResponse);
  const players: RosterPlayer[] = SLOTS.map((slot) => {
    const matches = rawPlayers.filter((player) => player.player_slot === slot);
    const option = options.find((player) => player.playerSlot === slot);
    if (matches.length !== 1) return { slot, heroName: 'Герой неизвестен', missing: matches.length ? 'ambiguous' : 'roster_missing' };
    const id = matches[0].account_id;
    const name = option?.playerName ?? (typeof matches[0].personaname === 'string' ? String(matches[0].personaname).slice(0, 120) : undefined);
    return { slot, heroName: option?.heroName.replace(/^Hero #/, 'Герой №') ?? 'Герой неизвестен', name: name?.slice(0, 120), ...(accountId(id) ? { accountId: id } : { missing: 'anonymous' as const }) };
  });
  const ids = players.flatMap((player) => player.accountId ? [player.accountId] : []);
  for (const player of players) {
    if (player.accountId && ids.filter((id) => id === player.accountId).length > 1) {
      delete player.accountId;
      player.missing = 'ambiguous';
    }
  }
  return { matchId: requestedId, startTime: raw.start_time, duration: raw.duration, players };
}

export function encounters(plan: Plan, selectedSlot?: number): Encounter[] {
  return plan.matches.flatMap(({ match }) => {
    if (!match) return [];
    const slot = plan.query.mode === 'match' ? selectedSlot : match.selectedSlot;
    if (slot === undefined || !SLOTS.includes(slot)) return [];
    return match.players.filter((player) => player.slot !== slot).map((player) => ({
      key: `${match.matchId}:${player.slot}`, matchId: match.matchId, startTime: match.startTime, player,
      side: (player.slot < 128) === (slot < 128) ? 'with' as const : 'against' as const
    }));
  });
}

export const resultKey = (matchId: number, id: number) => `${matchId}:${id}`;
export const resultFor = (row: Encounter, results: Results) => row.player.accountId ? results[resultKey(row.matchId, row.player.accountId)] : undefined;

export function groupMean(rows: Encounter[], results: Results, days: WindowDays, side: 'with' | 'against') {
  const values = rows.filter((row) => row.side === side).flatMap((row) => {
    const value = resultFor(row, results)?.samples[days];
    return value?.rate !== null && value?.rate !== undefined ? [value] : [];
  });
  return { mean: values.length ? values.reduce((sum, value) => sum + value.rate!, 0) / values.length : null, available: values.length, expected: side === 'with' ? 4 : 5, complete: values.filter((value) => value.complete).length };
}

export function seriesMean(rows: Encounter[], results: Results, days: WindowDays) {
  const pairs = [...new Set(rows.map((row) => row.matchId))].map((id) => {
    const matchRows = rows.filter((row) => row.matchId === id);
    return { with: groupMean(matchRows, results, days, 'with'), against: groupMean(matchRows, results, days, 'against') };
  }).filter((pair) => pair.with.mean !== null && pair.against.mean !== null);
  const mean = (side: 'with' | 'against') => pairs.length ? pairs.reduce((sum, pair) => sum + pair[side].mean!, 0) / pairs.length : null;
  return { with: mean('with'), against: mean('against'), pairs: pairs.length };
}

export function uniquePlayers(rows: Encounter[]) {
  const people = new Map<number, { accountId: number; name?: string; with: number[]; against: number[] }>();
  for (const row of rows) {
    const id = row.player.accountId;
    if (!id) continue;
    const person = people.get(id) ?? { accountId: id, name: row.player.name, with: [], against: [] };
    if (!person[row.side].includes(row.matchId)) person[row.side].push(row.matchId);
    people.set(id, person);
  }
  return [...people.values()].sort((a, b) => (b.with.length + b.against.length) - (a.with.length + a.against.length) || a.accountId - b.accountId);
}

export function sortEncounters(rows: Encounter[], results: Results, days: WindowDays, sort: Sort) {
  return [...rows].sort((a, b) => {
    if (sort === 'name') return (a.player.name ?? a.player.heroName).localeCompare(b.player.name ?? b.player.heroName, 'ru') || a.key.localeCompare(b.key);
    if (sort === 'rate_asc' || sort === 'rate_desc') {
      const ar = resultFor(a, results)?.samples[days].rate;
      const br = resultFor(b, results)?.samples[days].rate;
      if (ar == null && br != null) return 1;
      if (br == null && ar != null) return -1;
      if (ar != null && br != null && ar !== br) return sort === 'rate_asc' ? ar - br : br - ar;
    }
    return b.startTime - a.startTime || (a.side === b.side ? a.player.slot - b.player.slot : a.side === 'with' ? -1 : 1);
  });
}
