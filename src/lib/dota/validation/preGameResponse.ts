import type { PreGameAnalysis } from '../types/domain';
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
export function isPreGameAnalysis(value: unknown): value is PreGameAnalysis {
  if (!record(value) || value.hero !== 'Lifestealer' || value.role !== 'carry' || !record(value.lane)
    || !['easy', 'medium', 'hard', 'unknown'].includes(String(value.lane.difficulty)) || !strings(value.lane.reasons)
    || !strings(value.threats) || !strings(value.mistakesToAvoid)) return false;
  if (!Array.isArray(value.startingItems) || !value.startingItems.every((entry) => record(entry) && typeof entry.name === 'string' && typeof entry.reason === 'string')
    || !Array.isArray(value.buildBranches) || !value.buildBranches.every((entry) => record(entry) && typeof entry.tag === 'string' && typeof entry.title === 'string' && typeof entry.when === 'string' && strings(entry.items))
    || !Array.isArray(value.stagePlan) || !value.stagePlan.every((entry) => record(entry) && typeof entry.stage === 'string' && strings(entry.goals))) return false;
  return record(value.targetPriority) && strings(value.targetPriority.primary) && strings(value.targetPriority.avoidOpeningOn) && strings(value.targetPriority.notes)
    && record(value.mapPlan) && strings(value.mapPlan.early) && strings(value.mapPlan.mid) && strings(value.mapPlan.late)
    && record(value.meta) && strings(value.meta.source) && typeof value.meta.confidence === 'number' && Number.isFinite(value.meta.confidence);
}
