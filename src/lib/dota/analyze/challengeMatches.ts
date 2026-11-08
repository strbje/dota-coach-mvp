import type { TrainingChallenge } from './trainingChallenge';
import type { Source } from '../winrates/source';

export type ChallengeMatch = { matchId: number; startTime: number };
export type ChallengeHistory = { matches: ChallengeMatch[]; partial: boolean; fetchedAt: number };
export type ChallengeSearch = TrainingChallenge['scope'] & { since: number };
const integer = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseChallengeSearch(params: URLSearchParams, now = Math.floor(Date.now() / 1000)): ChallengeSearch | null {
  const values = ['accountId', 'heroId', 'gameMode', 'lobbyType', 'since'].map((key) => {
    const raw = params.get(key);
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  });
  const [accountId, heroId, gameMode, lobbyType, since] = values;
  if (!integer(accountId, 1) || accountId >= 4294967295 || !integer(heroId, 1) || !integer(gameMode, 1)
    || !integer(lobbyType) || !integer(since, 1) || since > now) return null;
  return { accountId, heroId, gameMode, lobbyType, since, role: 'carry' };
}

export class PrivateChallengeHistoryError extends Error {}

/** Candidate discovery only. A history row never confirms carry or a result at 10:00. */
export async function findChallengeMatches(source: Source, query: ChallengeSearch, signal?: AbortSignal, now = Math.floor(Date.now() / 1000)): Promise<ChallengeHistory> {
  const deadline = Date.now() + 18_000;
  const profile = record(record((await source.get(`/players/${query.accountId}`, deadline, signal)).value).profile);
  if (profile.fh_unavailable === true && profile.is_pro !== true) throw new PrivateChallengeHistoryError();
  const matches = new Map<number, ChallengeMatch>();
  const conflicts = new Set<number>();
  let partial = false, reached = false, previous = Infinity, ordered = true, fetchedAt = now, pages = 0;
  // Same provider queue/cache as win rates. Bound each click to at most 300 history rows.
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: '100', offset: String(page * 100), sort: 'start_time', significant: '0' });
    for (const column of ['match_id', 'start_time', 'duration', 'hero_id', 'game_mode', 'lobby_type']) params.append('project', column);
    try {
      const resource = await source.get(`/players/${query.accountId}/matches?${params}`, deadline, signal);
      if (!Array.isArray(resource.value)) throw new Error('Invalid history');
      pages++;
      fetchedAt = Math.min(fetchedAt, resource.fetchedAt);
      if (resource.value.length > 100) { partial = true; ordered = false; }
      for (const value of resource.value.slice(0, 100)) {
        const row = record(value);
        if (!integer(row.start_time, 1)) { partial = true; ordered = false; continue; }
        if (row.start_time > previous) ordered = false;
        previous = row.start_time;
        if (row.start_time < query.since) continue;
        if (!integer(row.match_id, 1) || !integer(row.duration, 1) || !integer(row.hero_id, 1)
          || !integer(row.game_mode, 1) || !integer(row.lobby_type)) { partial = true; continue; }
        if (row.hero_id !== query.heroId || row.game_mode !== query.gameMode || row.lobby_type !== query.lobbyType
          || row.duration < 600 || row.start_time + row.duration > now) continue;
        const candidate = { matchId: row.match_id, startTime: row.start_time };
        const existing = matches.get(candidate.matchId);
        if (conflicts.has(candidate.matchId)) continue;
        if (existing && existing.startTime !== candidate.startTime) {
          matches.delete(candidate.matchId); conflicts.add(candidate.matchId); partial = true;
        } else matches.set(candidate.matchId, candidate);
      }
      if (resource.value.length < 100 || ordered && previous < query.since) { reached = true; break; }
    } catch (error) {
      if (signal?.aborted || pages === 0) throw error;
      partial = true; break;
    }
  }
  return { matches: [...matches.values()].sort((a, b) => a.startTime - b.startTime || a.matchId - b.matchId), partial: partial || !ordered || !reached, fetchedAt };
}
