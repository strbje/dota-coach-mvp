import { challengeProgress, type TrainingChallenge } from './trainingChallenge';
import type { ChallengeHistory, ChallengeMatch } from './challengeMatches';
import type { TrainingObservation } from '../types/domain';
import { isPostMatchSuccessPayload } from '../validation/postMatchResponse';

export type MatchCheckResult = ChallengeMatch & { status: 'checked' | 'pending' | 'skipped'; message: string };
export type ChallengeScan = { history: ChallengeHistory; queue: ChallengeMatch[]; results: MatchCheckResult[] };
export class ChallengeCheckError extends Error {}
type Fetcher = typeof fetch;

// The timeout covers the response body too, and releases timers on success/cancellation.
async function requestJson(path: string, init: RequestInit, signal: AbortSignal, timeoutMs: number, fetcher: Fetcher) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    signal.throwIfAborted();
    const response = await fetcher(path, { ...init, cache: 'no-store', signal: controller.signal });
    const body: unknown = await response.json();
    controller.signal.throwIfAborted();
    return { response, body };
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

export async function startChallengeScan(challenge: TrainingChallenge, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<ChallengeScan> {
  const params = new URLSearchParams(Object.entries({ ...challenge.scope, since: Math.max(challenge.acceptedAt, challenge.sourceStartTime + 1) }).map(([key, value]) => [key, String(value)]));
  const { response, body } = await requestJson(`/api/post-match/challenge-matches?${params}`, {}, signal, 20_000, fetcher);
  if (!response.ok) {
    throw new ChallengeCheckError(response.status === 403 ? 'История аккаунта недоступна. Можно проверить цель, открыв разбор конкретного матча.'
      : response.status === 429 ? 'Сервис ограничил запросы. Попробуй проверить матчи позже.' : 'Не удалось получить историю матчей. Попробуй ещё раз.');
  }
  const history = body as ChallengeHistory;
  const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (!history || !Array.isArray(history.matches) || history.matches.length > 300 || typeof history.partial !== 'boolean'
    || !integer(history.fetchedAt) || history.matches.some((match) => !match || !integer(match.matchId) || !integer(match.startTime))) {
    throw new ChallengeCheckError('Пришёл неполный список матчей. Попробуй проверить ещё раз.');
  }
  const matches = new Map<number, ChallengeMatch>();
  for (const match of [...history.matches, ...challenge.checks]) {
    if (match.matchId !== challenge.sourceMatchId && match.startTime >= challenge.acceptedAt && match.startTime > challenge.sourceStartTime) matches.set(match.matchId, { matchId: match.matchId, startTime: match.startTime });
  }
  return { history, queue: relevantMatches([...matches.values()], challenge), results: [] };
}

function relevantMatches(matches: ChallengeMatch[], challenge: TrainingChallenge) {
  const third = challengeProgress(challenge).counted[2];
  return matches.filter((match) => !third || match.startTime < third.startTime || match.startTime === third.startTime && match.matchId <= third.matchId)
    .sort((a, b) => a.startTime - b.startTime || a.matchId - b.matchId);
}

/** At most three sequential analyses / 60 seconds per click; explicit continuation, no polling. */
export async function checkChallengeBatch(options: {
  challenge: TrainingChallenge; scan: ChallengeScan; signal: AbortSignal;
  save: (observation: TrainingObservation) => TrainingChallenge;
  update: (scan: ChallengeScan, checking?: number) => void;
  fetcher?: Fetcher; budgetMs?: number; requestMs?: number;
}): Promise<ChallengeScan> {
  const { signal, save, update, fetcher = fetch } = options;
  let challenge = options.challenge;
  let scan = { ...options.scan, queue: relevantMatches(options.scan.queue, challenge) };
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  for (let count = 0; count < 3 && scan.queue.length && Date.now() < deadline; count++) {
    signal.throwIfAborted();
    const match = scan.queue[0];
    update(scan, match.matchId);
    let result: MatchCheckResult;
    const { response, body } = await requestJson('/api/post-match/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: match.matchId, selector: { accountId: challenge.scope.accountId, heroId: challenge.scope.heroId } })
    }, signal, Math.min(options.requestMs ?? 40_000, deadline - Date.now()), fetcher);
    signal.throwIfAborted();
    const code = (body as { errorCode?: unknown } | null)?.errorCode;
    if (!response.ok) {
      if ((code === 'UNSUPPORTED_POST_MATCH_ROLE' || code === 'POST_MATCH_ROLE_UNCONFIRMED')
        && challenge.checks.some((entry) => entry.matchId === match.matchId && entry.actual !== undefined)) {
        throw new ChallengeCheckError('При повторной проверке роль не подтвердилась. Ранее подтверждённый результат сохранён; попробуй позже.');
      }
      if (code === 'UNSUPPORTED_POST_MATCH_ROLE') result = { ...match, status: 'skipped', message: 'Другая роль — не входит в челлендж.' };
      else if (code === 'POST_MATCH_ROLE_UNCONFIRMED') result = { ...match, status: 'pending', message: 'Роль пока не подтверждена. Проверь позже.' };
      else throw new ChallengeCheckError(code === 'STRATZ_NOT_CONFIGURED' || code === 'STRATZ_AUTH_FAILED'
        ? 'Не удалось подключиться к проверке роли. Нужна настройка STRATZ на сервере; матч пока не засчитан.'
        : response.status === 429 ? 'Сервис ограничил запросы. Продолжи проверку позже.'
        : 'Не удалось проверить матч. Продолжи позже — уже полученные результаты сохранены.');
    } else {
      if (!isPostMatchSuccessPayload(body)) throw new ChallengeCheckError('Пришёл неполный разбор. Продолжи проверку позже.');
      const observation = body.analysis.training.observation;
      // Never silently accept another match, account, role, mode, or a conflicting timestamp.
      if (observation.matchId !== match.matchId || observation.startTime !== match.startTime) {
        throw new ChallengeCheckError('Данные матча не совпали с условиями цели. Результат не изменён.');
      }
      const scopeMatches = Object.entries(challenge.scope).every(([key, value]) => observation[key as keyof TrainingObservation] === value);
      if (!scopeMatches) throw new ChallengeCheckError('Данные игрока не совпали с условиями цели. Результат не изменён.');
      // Persist each match before proceeding. This callback also checks the current storage cycle.
      challenge = save(observation);
      const confirmed = challenge.checks.find((entry) => entry.matchId === match.matchId)?.actual;
      result = { ...match, status: confirmed === undefined ? 'pending' : 'checked', message: confirmed === undefined
        ? 'Нет добиваний к 10:00 — ожидаем данные.' : `${confirmed} из ${challenge.goal.target} · ${confirmed >= challenge.goal.target ? 'цель взята' : 'ниже цели'}` };
    }
    scan = { ...scan, queue: relevantMatches(scan.queue.slice(1), challenge), results: [...scan.results.filter((entry) => entry.matchId !== match.matchId), result] };
    update(scan);
  }
  return scan;
}
