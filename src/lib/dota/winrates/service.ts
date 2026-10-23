import { setHeroConstants } from '../data/heroConstants';
import { normalizeHeroes } from '../providers/opendotaConstantsProvider';
import { accountId, DAY, eligible, inWindow, normalizeRoster, positiveId, record, sample } from './calculation';
import { readHistory } from './history';
import { failure, SourceError, type Source, winrateSource } from './source';
import type { Basis, Filters, History, MatchEntry, ParticipantResult, Plan, Query } from './types';

export class InputError extends Error {}
export function parseQuery(value: unknown): Query {
  const raw = record(value);
  if ((raw.mode !== 'match' && raw.mode !== 'series') || (raw.basis !== 'match' && raw.basis !== 'now')
    || typeof raw.rankedOnly !== 'boolean' || typeof raw.excludeTurbo !== 'boolean'
    || ![7, 10, 30].includes(Number(raw.days)) || typeof raw.days !== 'number'
    || !(raw.mode === 'series' ? accountId(raw.id) : positiveId(raw.id))) throw new InputError('Invalid query');
  return { mode: raw.mode, basis: raw.basis, rankedOnly: raw.rankedOnly, excludeTurbo: raw.excludeTurbo, days: raw.days as Query['days'], id: raw.id as number };
}

export type ParticipantQuery = Filters & { matchId: number; accountId: number; basis: Basis; capturedAt: number };
export function parseParticipantQuery(value: unknown, now = Math.floor(Date.now() / 1000)): ParticipantQuery {
  const raw = record(value);
  if (!positiveId(raw.matchId) || !accountId(raw.accountId) || !positiveId(raw.capturedAt)
    || raw.capturedAt > now + 5 || raw.capturedAt < now - DAY
    || (raw.basis !== 'match' && raw.basis !== 'now') || typeof raw.rankedOnly !== 'boolean' || typeof raw.excludeTurbo !== 'boolean') throw new InputError('Invalid participant query');
  return raw as ParticipantQuery;
}

export function parseBatch(value: unknown, now = Math.floor(Date.now() / 1000)) {
  const raw = record(value);
  const query = parseQuery(value);
  if (query.mode !== 'series' || !positiveId(raw.capturedAt) || raw.capturedAt > now + 5 || raw.capturedAt < now - DAY
    || !Array.isArray(raw.matchIds) || !raw.matchIds.length || raw.matchIds.length > 3 || !raw.matchIds.every(positiveId)
    || new Set(raw.matchIds).size !== raw.matchIds.length) throw new InputError('Invalid batch');
  return { query, capturedAt: raw.capturedAt, matchIds: raw.matchIds as number[] };
}

export function calculationKey(query: ParticipantQuery, asOf: number) {
  return JSON.stringify(['v1', query.accountId, query.matchId, [7, 30], query.rankedOnly, query.excludeTurbo, query.basis, asOf]);
}

const blankHistory = (now: number): History => ({ rows: [], stop: 'unavailable', scanned: 0, invalid: 0, oldest: null, ordered: true, fetchedAt: now, expiresAt: now });
export const historySummary = ({ rows, ...summary }: History) => { void rows; return summary; };

function profileInfo(value: unknown) {
  const profile = record(record(value).profile);
  return {
    restricted: profile.fh_unavailable === true && profile.is_pro !== true,
    knownOpen: profile.fh_unavailable === false,
    name: typeof profile.personaname === 'string' ? profile.personaname.slice(0, 120) : undefined
  };
}

export class WinrateService {
  private results = new Map<string, ParticipantResult>();
  constructor(private readonly source: Source = winrateSource) {}

  private async match(id: number, deadline: number, signal?: AbortSignal) {
    const resource = await this.source.get(`/matches/${id}`, deadline, signal);
    let match;
    try { match = normalizeRoster(resource.value, id); } catch { throw new SourceError('unavailable'); }
    return { ...resource, match };
  }

  async plan(query: Query, signal?: AbortSignal): Promise<Plan> {
    const capturedAt = Math.floor(Date.now() / 1000);
    const deadline = Date.now() + 18000;
    // Optional hero metadata shares the same bounded, cached source as everything else.
    const heroes = this.source.get('/constants/heroes', deadline, signal)
      .then((resource) => setHeroConstants(normalizeHeroes(resource.value))).catch(() => undefined);
    if (query.mode === 'match') {
      await heroes;
      const { match } = await this.match(query.id, deadline, signal);
      if (match.startTime + match.duration >= capturedAt) throw new SourceError('unavailable');
      return { query, capturedAt, matches: [{ matchId: query.id, match }] };
    }
    let history = blankHistory(capturedAt);
    let status: ParticipantResult['status'] = 'unavailable';
    try {
      const profile = profileInfo((await this.source.get(`/players/${query.id}`, deadline, signal)).value);
      if (profile.restricted) status = 'private';
      else {
        history = await readHistory(this.source, query.id, query, capturedAt, query.days, deadline, signal);
        status = history.scanned ? 'ready' : history.stop === 'exhausted' ? profile.knownOpen ? 'empty' : 'unavailable' : history.stop as ParticipantResult['status'];
      }
    } catch (error) { if (signal?.aborted) throw error; status = failure(error); }
    await heroes;
    const candidates = history.rows.filter((row) => inWindow(row, capturedAt - query.days * DAY, capturedAt));
    const matches = await this.batch(query, candidates.slice(0, 3).map((row) => row.matchId), capturedAt, signal, deadline);
    if (status === 'ready' && !candidates.length) status = history.invalid || !history.ordered ? 'unavailable' : 'empty';
    if (status === 'unavailable' && !history.scanned) history.stop = 'unavailable';
    return { query, capturedAt, matches, series: { found: candidates.length, shown: matches.length, remainingIds: candidates.slice(3).map((row) => row.matchId), history: historySummary(history), status } };
  }

  async batch(query: Query, ids: number[], capturedAt: number, signal?: AbortSignal, deadline = Date.now() + 18000): Promise<MatchEntry[]> {
    const matches: MatchEntry[] = [];
    await Promise.all(ids.map(async (id, index) => {
      try {
        const { match, value } = await this.match(id, deadline, signal);
        const selected = match.players.find((player) => player.accountId === query.id);
        if (!selected || eligible(record(value), query) !== true || match.startTime < capturedAt - query.days * DAY || match.startTime + match.duration >= capturedAt) throw new SourceError('unavailable');
        matches[index] = { matchId: id, match: { ...match, selectedSlot: selected.slot } };
      } catch (error) { if (signal?.aborted) throw error; matches[index] = { matchId: id, error: failure(error) }; }
    }));
    return matches;
  }

  async participant(query: ParticipantQuery, signal?: AbortSignal): Promise<ParticipantResult> {
    const deadline = Date.now() + 14000;
    const target = await this.match(query.matchId, deadline, signal);
    if (target.match.startTime + target.match.duration >= query.capturedAt || !target.match.players.some((player) => player.accountId === query.accountId)) throw new InputError('Participant does not belong to completed match');
    const asOf = query.basis === 'match' ? target.match.startTime : query.capturedAt;
    const key = calculationKey(query, asOf);
    const cached = this.results.get(key);
    if (cached && cached.expiresAt * 1000 > Date.now()) return { ...cached, capturedAt: query.capturedAt };
    this.results.delete(key);
    let history = blankHistory(Math.floor(Date.now() / 1000));
    let status: ParticipantResult['status'] = 'unavailable';
    let name: string | undefined;
    let retryAfter: number | undefined;
    let fetchedAt = target.fetchedAt;
    let expiresAt = target.expiresAt;
    try {
      const resource = await this.source.get(`/players/${query.accountId}`, deadline, signal);
      const profile = profileInfo(resource.value);
      name = profile.name;
      fetchedAt = Math.min(fetchedAt, resource.fetchedAt);
      expiresAt = Math.min(expiresAt, resource.expiresAt);
      if (profile.restricted) status = 'private';
      else {
        history = await readHistory(this.source, query.accountId, query, asOf, 30, deadline, signal);
        const hasGames = history.rows.some((row) => inWindow(row, asOf - 30 * DAY, asOf, query.matchId));
        status = hasGames ? 'ready' : history.invalid || !history.ordered ? 'unavailable' : history.stop === 'exhausted' || history.stop === 'boundary'
          ? history.scanned || profile.knownOpen ? 'empty' : 'unavailable'
          : history.stop === 'cap' ? 'unavailable' : history.stop;
        if (status === 'unavailable' && !history.scanned) history.stop = 'unavailable';
        fetchedAt = Math.min(fetchedAt, history.fetchedAt);
        expiresAt = Math.min(expiresAt, history.expiresAt);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      status = failure(error);
      if (error instanceof SourceError) retryAfter = error.retryAfter;
    }
    const result: ParticipantResult = { accountId: query.accountId, matchId: query.matchId, basis: query.basis, asOf, capturedAt: query.capturedAt, status, name,
      samples: { 7: sample(history, 7, asOf, query.matchId), 30: sample(history, 30, asOf, query.matchId) }, history: historySummary(history), fetchedAt, expiresAt, ...(retryAfter ? { retryAfter } : {}) };
    if (['ready', 'empty'].includes(status) && result.samples[30].complete) {
      this.results.set(key, result);
      while (this.results.size > 128) this.results.delete(this.results.keys().next().value!);
    }
    return result;
  }
}

export const winrateService = new WinrateService();
