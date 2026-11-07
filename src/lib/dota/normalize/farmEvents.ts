import { verifiedFarmTarget, type OtherFarmTarget } from './farmTargets';

export type FarmCategory = 'lane' | 'neutral' | 'ancient' | 'other' | 'unclassified';
export type FarmEvents = {
  durationSeconds?: number;
  events: Array<{ timeSeconds: number; category: FarmCategory; target?: OtherFarmTarget }>;
  reportedLastHits?: number;
  rejectedEvents: number;
  coverage: 'complete' | 'partial';
};

function classify(entry: Record<string, unknown>, gameVersionId: unknown): Pick<FarmEvents['events'][number], 'category' | 'target'> {
  const flags = [entry.isCreep, entry.isNeutral, entry.isAncient];
  const unknown = { category: 'unclassified' } as const;
  // Missing/contradictory flags stay unresolved, even with a known ID.
  if (!flags.every((flag) => typeof flag === 'boolean') || flags.filter(Boolean).length > 1) return unknown;
  const target = verifiedFarmTarget(entry.npcId, gameVersionId);
  if (flags.some(Boolean)) {
    const category = entry.isCreep ? 'lane' : entry.isNeutral ? 'neutral' : 'ancient';
    return target && target.category !== category ? unknown : { category };
  }
  if (!target) return unknown;
  return target.category === 'other'
    ? { category: 'other', target: { npcId: entry.npcId as number, kind: target.kind, label: target.label } }
    : { category: target.category };
}

/** Player-attributed last hits include controlled units. Same-second records are distinct events. */
export function normalizeFarmEvents(raw: unknown, reported: unknown, durationSeconds: number | undefined, gameVersionId?: unknown): FarmEvents | undefined {
  if (!Array.isArray(raw)) return undefined;
  const reportedLastHits = typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : undefined;
  const events = raw.flatMap((entry): FarmEvents['events'] => {
    if (!entry || typeof entry !== 'object' || typeof entry.time !== 'number' || !Number.isFinite(entry.time)
      || entry.time < 0 || durationSeconds === undefined || !Number.isFinite(durationSeconds)
      || durationSeconds <= 0 || entry.time > durationSeconds) return [];
    return [{ timeSeconds: entry.time, ...classify(entry, gameVersionId) }];
  }).sort((a, b) => a.timeSeconds - b.timeSeconds);
  const rejectedEvents = raw.length - events.length;
  return { events, reportedLastHits, rejectedEvents, durationSeconds,
    coverage: durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0
      && rejectedEvents === 0 && events.length === reportedLastHits ? 'complete' : 'partial' };
}
