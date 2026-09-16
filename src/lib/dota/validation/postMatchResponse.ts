import type { PostMatchAnalysis } from '../types/domain';

export type PostMatchSuccessPayload = { analysis: PostMatchAnalysis; debug: unknown };

export function isPostMatchSuccessPayload(value: unknown): value is PostMatchSuccessPayload {
  if (!value || typeof value !== 'object') return false;
  const analysis = (value as { analysis?: unknown }).analysis;
  if (!analysis || typeof analysis !== 'object') return false;
  const candidate = analysis as Partial<PostMatchAnalysis>;
  return Number.isFinite(candidate.matchId)
    && typeof candidate.hero === 'string'
    && Boolean(candidate.grades && typeof candidate.grades === 'object')
    && Boolean(candidate.finalVerdict && typeof candidate.finalVerdict === 'object');
}
