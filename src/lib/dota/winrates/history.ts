import { DAY, normalizeHistoryRow, positiveId, record } from './calculation';
import { failure, type Source } from './source';
import type { Filters, History, HistoryRow } from './types';

export function historyPath(id: number, filters: Filters, offset: number) {
  const params = new URLSearchParams({ limit: '100', offset: String(offset), sort: 'start_time', significant: '0' });
  for (const column of ['match_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'lobby_type', 'game_mode']) params.append('project', column);
  if (filters.rankedOnly) params.set('lobby_type', '7');
  return `/players/${id}/matches?${params}`;
}

export async function readHistory(source: Source, id: number, filters: Filters, asOf: number, days: number, deadline: number, signal?: AbortSignal): Promise<History> {
  const rows = new Map<number, HistoryRow>();
  const conflicted = new Set<number>();
  const history: History = { rows: [], stop: 'cap', scanned: 0, invalid: 0, oldest: null, ordered: true, fetchedAt: Math.floor(Date.now() / 1000), expiresAt: Infinity };
  let previousTime = Infinity;
  for (let page = 0; page < 3; page++) {
    try {
      const resource = await source.get(historyPath(id, filters, page * 100), deadline, signal);
      if (!Array.isArray(resource.value)) throw new Error('Invalid history');
      history.fetchedAt = Math.min(history.fetchedAt, resource.fetchedAt);
      history.expiresAt = Math.min(history.expiresAt, resource.expiresAt);
      const values = resource.value.slice(0, 100);
      if (resource.value.length > 100) history.ordered = false;
      for (const value of values) {
        history.scanned++;
        const start = record(value).start_time;
        if (positiveId(start)) {
          if (start > previousTime) history.ordered = false;
          previousTime = start;
          history.oldest = Math.min(history.oldest ?? Infinity, start);
        } else history.ordered = false;
        const row = normalizeHistoryRow(value, filters);
        if (row === 'filtered') continue;
        if (!row) { history.invalid++; continue; }
        if (conflicted.has(row.matchId)) continue;
        const duplicate = rows.get(row.matchId);
        if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(row)) {
          history.invalid++; rows.delete(row.matchId); conflicted.add(row.matchId);
        } else rows.set(row.matchId, row);
      }
      if (resource.value.length < 100) { history.stop = 'exhausted'; break; }
      if (history.ordered && history.oldest !== null && history.oldest < asOf - days * DAY) { history.stop = 'boundary'; break; }
    } catch (error) {
      if (signal?.aborted) throw error;
      history.stop = failure(error); break;
    }
  }
  history.rows = [...rows.values()].sort((a, b) => b.startTime - a.startTime || b.matchId - a.matchId);
  if (!Number.isFinite(history.expiresAt)) history.expiresAt = history.fetchedAt;
  return history;
}
