import type { ParticipantResult, ParticipantState } from './types';

export function applyParticipantUpdate(previous: ParticipantState | undefined, next: ParticipantResult): ParticipantState {
  const error = (['provider_error', 'rate_limit', 'timeout', 'unavailable'] as const).find((code) => code === next.status);
  const hasGames = (result: ParticipantResult) => result.samples[7].games > 0 || result.samples[30].games > 0;
  // The hook also clears state on a new plan, filter change or player selection.
  const sameCalculation = previous && previous.accountId === next.accountId && previous.matchId === next.matchId
    && previous.basis === next.basis && previous.asOf === next.asOf && previous.capturedAt === next.capturedAt;
  const received = previous && (hasGames(previous) || previous.status === 'empty' && (previous.samples[7].complete || previous.samples[30].complete));
  if (previous && sameCalculation && error && received && !hasGames(next)) {
    return { ...previous, refreshError: error };
  }
  return next;
}
