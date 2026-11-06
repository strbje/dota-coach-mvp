import { challengeProgress, challengeStorageKey, readChallenge, type TrainingChallenge } from './analyze/trainingChallenge';
import type { TrainingObservation } from './types/domain';

export const RECENT_MATCHES_KEY = 'dota-coach:recent-matches:v1';
export type RecentMatch = { matchId: number; playerSlot: number; hero: string; heroId: number; accountId?: number; heroKey?: string; openedAt: number };
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export function readRecentMatches(raw: string | null): RecentMatch[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((entry): entry is RecentMatch => {
      if (!entry || !positive(entry.matchId) || !positive(entry.heroId) || !positive(entry.openedAt)
        || !Number.isInteger(entry.playerSlot) || ![0, 1, 2, 3, 4, 128, 129, 130, 131, 132].includes(entry.playerSlot)
        || typeof entry.hero !== 'string' || !entry.hero.trim() || entry.hero.length > 100
        || (entry.accountId !== undefined && (!positive(entry.accountId) || entry.accountId >= 4294967295))
        || (entry.heroKey !== undefined && (typeof entry.heroKey !== 'string' || !/^[a-z][a-z0-9_]*$/.test(entry.heroKey)))) return false;
      const key = `${entry.matchId}:${entry.playerSlot}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a, b) => b.openedAt - a.openedAt).slice(0, 5).map(({ matchId, playerSlot, hero, heroId, accountId, heroKey, openedAt }) => ({ matchId, playerSlot, hero, heroId, accountId, heroKey, openedAt }));
  } catch { return []; }
}
export function rememberMatch(storage: BrowserStorage, match: RecentMatch) {
  const previous = readRecentMatches(storage.getItem(RECENT_MATCHES_KEY));
  storage.setItem(RECENT_MATCHES_KEY, JSON.stringify(readRecentMatches(JSON.stringify([{ ...match, accountId: positive(match.accountId) && match.accountId < 4294967295 ? match.accountId : undefined }, ...previous]))));
}
export function recentMatchHref(match: Pick<RecentMatch, 'matchId' | 'playerSlot'>) {
  return `/post-match?matchId=${match.matchId}&playerSlot=${match.playerSlot}`;
}
export function activeChallenges(storage: BrowserStorage): TrainingChallenge[] {
  const goals: TrainingChallenge[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith('dota-coach:challenge:v1:')) continue;
    try {
      const raw = storage.getItem(key), value = JSON.parse(raw ?? 'null');
      if (!value?.scope) continue;
      const observation: TrainingObservation = { ...value.scope, matchId: value.sourceMatchId, startTime: value.sourceStartTime, durationSeconds: 600 };
      const challenge = readChallenge(raw, observation);
      if (challenge && challengeStorageKey(observation) === key && !challengeProgress(challenge).complete) goals.push(challenge);
    } catch { /* Ignore one damaged entry without hiding other valid goals. */ }
  }
  return goals.sort((a, b) => b.acceptedAt - a.acceptedAt);
}
