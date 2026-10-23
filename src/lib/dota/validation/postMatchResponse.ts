import type { PostMatchAnalysis } from '../types/domain';

export type PostMatchSuccessPayload = { analysis: PostMatchAnalysis; debug: unknown };

export function isPostMatchSuccessPayload(value: unknown): value is PostMatchSuccessPayload {
  if (!value || typeof value !== 'object') return false;
  const analysis = (value as { analysis?: unknown }).analysis;
  if (!analysis || typeof analysis !== 'object') return false;
  const candidate = analysis as Partial<PostMatchAnalysis>;
  const review = candidate.review;
  const observation = candidate.training?.observation;
  const goal = candidate.training?.goal;
  const laneFacts = candidate.laneFacts;
  return Number.isFinite(candidate.matchId)
    && typeof candidate.hero === 'string'
    && Boolean(candidate.grades && typeof candidate.grades === 'object')
    && Boolean(candidate.finalVerdict && typeof candidate.finalVerdict === 'object')
    && Array.isArray(candidate.priorities) && candidate.priorities.every((priority) => priority
      && ['id', 'title', 'fact', 'meaning', 'action'].every((key) => typeof priority[key as keyof typeof priority] === 'string')
      && (priority.target === undefined || Boolean(priority.target && typeof priority.target.text === 'string')))
    && Array.isArray(candidate.itemTimings)
    && Number.isFinite(candidate.durationSeconds)
    && (laneFacts === undefined || Boolean(laneFacts && typeof laneFacts === 'object'
      && (laneFacts.deathsAt10 === undefined || Number.isInteger(laneFacts.deathsAt10) && laneFacts.deathsAt10 >= 0)
      && (laneFacts.efficiencyPct === undefined || Number.isFinite(laneFacts.efficiencyPct) && laneFacts.efficiencyPct >= 0)))
    && Boolean(review && typeof review.headline === 'string' && typeof review.summary === 'string'
      && Array.isArray(review.factors) && review.factors.every((factor) => factor && typeof factor.id === 'string'
        && typeof factor.title === 'string' && typeof factor.fact === 'string' && typeof factor.meaning === 'string'
        && typeof factor.evidenceId === 'string' && Number.isFinite(factor.timeSeconds)
        && (factor.confidence === 'observation' || factor.confidence === 'possible-factor')
        && (factor.stat === undefined || Boolean(factor.stat && typeof factor.stat.value === 'string' && typeof factor.stat.label === 'string')))
      && Array.isArray(review.strengths) && review.strengths.every((text) => typeof text === 'string')
      && Array.isArray(review.timeline) && review.timeline.every((event) => event && typeof event.id === 'string'
        && typeof event.label === 'string' && Number.isFinite(event.timeSeconds) && (event.detail === undefined || typeof event.detail === 'string'))
      && Array.isArray(review.advantage) && review.advantage.every((point) => point && Number.isFinite(point.timeSeconds)
        && (point.gold === undefined || typeof point.gold === 'number' && Number.isFinite(point.gold))
        && (point.xp === undefined || typeof point.xp === 'number' && Number.isFinite(point.xp))))
    && Boolean(observation && observation.matchId === candidate.matchId && Number.isFinite(observation.heroId)
      && typeof observation.role === 'string' && Number.isFinite(observation.durationSeconds))
    && (goal === undefined || Boolean(goal && goal.metric === 'lastHitsAt10' && goal.source === 'training'
      && Number.isSafeInteger(goal.baseline) && goal.baseline >= 0 && goal.baseline === observation?.lastHitsAt10
      && Number.isSafeInteger(goal.target) && goal.target === goal.baseline + 5
      && typeof goal.title === 'string' && typeof goal.action === 'string'));
}
