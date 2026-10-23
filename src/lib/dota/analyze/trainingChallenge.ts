import type { TrainingGoal, TrainingObservation } from '../types/domain';

type Scope = { accountId: number; heroId: number; role: 'carry'; gameMode: number; lobbyType: number };
export type ChallengeCheck = { matchId: number; startTime: number; actual?: number };
export type TrainingChallenge = {
  version: 1;
  scope: Scope;
  sourceMatchId: number;
  sourceStartTime: number;
  acceptedAt: number;
  goal: TrainingGoal;
  checks: ChallengeCheck[];
};

const integer = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
export function challengeScope(observation: TrainingObservation): Scope | null {
  // OpenDota uses 4294967295 for anonymous players. Slots and hero IDs are not player identity.
  if (!integer(observation.accountId, 1) || observation.accountId >= 4294967295 || !integer(observation.heroId, 1)
    || observation.role !== 'carry' || !integer(observation.gameMode, 1) || !integer(observation.lobbyType)) return null;
  return { accountId: observation.accountId, heroId: observation.heroId, role: 'carry', gameMode: observation.gameMode, lobbyType: observation.lobbyType };
}

export function challengeStorageKey(observation: TrainingObservation): string | null {
  const scope = challengeScope(observation);
  return scope ? `dota-coach:challenge:v1:${scope.accountId}:${scope.role}:${scope.heroId}:${scope.gameMode}:${scope.lobbyType}` : null;
}

export function makeTrainingGoal(lastHitsAt10: number | undefined): TrainingGoal | undefined {
  if (!integer(lastHitsAt10) || !Number.isSafeInteger(lastHitsAt10 + 5)) return undefined;
  return { metric: 'lastHitsAt10', title: 'Ещё пять добиваний к 10:00', baseline: lastHitsAt10, target: lastHitsAt10 + 5, source: 'training',
    action: 'На первых волнах заранее выбирай крипа для добивания. После игры проверь пропущенные добивания на линии и сравни результат к 10:00.' };
}

export function acceptChallenge(observation: TrainingObservation, goal: TrainingGoal, acceptedAt: number): TrainingChallenge | null {
  const scope = challengeScope(observation);
  if (!scope || !integer(observation.matchId, 1) || !integer(observation.startTime, 1) || !integer(acceptedAt, 1)
    || !Number.isFinite(observation.durationSeconds) || observation.durationSeconds < 600 || !integer(goal.baseline) || !integer(goal.target) || goal.baseline !== observation.lastHitsAt10 || goal.target !== goal.baseline + 5) return null;
  return { version: 1, scope, sourceMatchId: observation.matchId, sourceStartTime: observation.startTime, acceptedAt, goal, checks: [] };
}

/** Unknown/partial matches stay pending; a later partial response cannot erase confirmed progress. */
export function checkChallenge(challenge: TrainingChallenge, observation: TrainingObservation): TrainingChallenge {
  const scope = challengeScope(observation);
  if (!scope || Object.entries(challenge.scope).some(([key, value]) => scope[key as keyof Scope] !== value)
    || observation.matchId === challenge.sourceMatchId || !integer(observation.matchId, 1)
    || !integer(observation.startTime, 1) || observation.startTime <= challenge.sourceStartTime
    || observation.startTime < challenge.acceptedAt) return challenge;
  const actual = observation.durationSeconds >= 600 && integer(observation.lastHitsAt10) ? observation.lastHitsAt10 : undefined;
  const previous = challenge.checks.find((entry) => entry.matchId === observation.matchId);
  if (actual === undefined && previous?.actual !== undefined) return challenge;
  const check: ChallengeCheck = { matchId: observation.matchId, startTime: observation.startTime, ...(actual === undefined ? {} : { actual }) };
  const ordered = [...challenge.checks.filter((entry) => entry.matchId !== check.matchId), check]
    .sort((a, b) => a.startTime - b.startTime || a.matchId - b.matchId);
  const countedIds = new Set(ordered.filter((entry) => entry.actual !== undefined).slice(0, 3).map((entry) => entry.matchId));
  // Preserve the counted games even after many pending/revisited matches; bound browser storage.
  const checks = [...ordered.filter((entry) => countedIds.has(entry.matchId)), ...ordered.filter((entry) => !countedIds.has(entry.matchId)).slice(-47)]
    .sort((a, b) => a.startTime - b.startTime || a.matchId - b.matchId);
  return { ...challenge, checks };
}

export function challengeProgress(challenge: TrainingChallenge) {
  const counted = challenge.checks.filter((check) => check.actual !== undefined).slice(0, 3);
  return { counted, successes: counted.filter((check) => check.actual! >= challenge.goal.target).length, complete: counted.length === 3 };
}

/** Treat localStorage as untrusted; old/corrupt schemas cannot produce invented progress. */
export function readChallenge(raw: string | null, observation: TrainingObservation): TrainingChallenge | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TrainingChallenge;
    const expected = challengeScope(observation);
    if (!value || value.version !== 1 || !expected || !value.scope || Object.entries(expected).some(([key, v]) => value.scope[key as keyof Scope] !== v)
      || !integer(value.sourceMatchId, 1) || !integer(value.sourceStartTime, 1) || !integer(value.acceptedAt, 1)
      || !value.goal || value.goal.metric !== 'lastHitsAt10' || value.goal.source !== 'training'
      || !integer(value.goal.baseline) || !integer(value.goal.target) || value.goal.target !== value.goal.baseline + 5
      || !Array.isArray(value.checks) || value.checks.length > 50) return null;
    const ids = new Set<number>();
    for (const check of value.checks) {
      if (!check || !integer(check.matchId, 1) || check.matchId === value.sourceMatchId || ids.has(check.matchId)
        || !integer(check.startTime, 1) || check.startTime <= value.sourceStartTime || check.startTime < value.acceptedAt
        || (check.actual !== undefined && !integer(check.actual))) return null;
      ids.add(check.matchId);
    }
    // User-facing text is reconstructed, never trusted from the storage payload.
    return { ...value, scope: expected, goal: makeTrainingGoal(value.goal.baseline)!, checks: [...value.checks].sort((a, b) => a.startTime - b.startTime || a.matchId - b.matchId) };
  } catch { return null; }
}
