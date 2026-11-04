export type FarmCategory = 'lane' | 'neutral' | 'ancient' | 'unclassified';
export type FarmEvents = {
  durationSeconds?: number;
  events: Array<{ timeSeconds: number; category: FarmCategory }>;
  reportedLastHits?: number;
  rejectedEvents: number;
  coverage: 'complete' | 'partial';
};

function category(entry: Record<string, unknown>): FarmCategory {
  const flags = [entry.isCreep, entry.isNeutral, entry.isAncient];
  // Overlapping/missing flags have no verified category contract. Never guess from NPC IDs.
  if (!flags.every((flag) => typeof flag === 'boolean') || flags.filter(Boolean).length !== 1) return 'unclassified';
  return entry.isCreep ? 'lane' : entry.isNeutral ? 'neutral' : 'ancient';
}

/** Player-attributed last hits include controlled units. Same-second records are distinct events. */
export function normalizeFarmEvents(raw: unknown, reported: unknown, durationSeconds: number | undefined): FarmEvents | undefined {
  if (!Array.isArray(raw)) return undefined;
  const reportedLastHits = typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : undefined;
  const events = raw.flatMap((entry): FarmEvents['events'] => {
    if (!entry || typeof entry !== 'object' || typeof entry.time !== 'number' || !Number.isFinite(entry.time)
      || entry.time < 0 || durationSeconds === undefined || !Number.isFinite(durationSeconds)
      || durationSeconds <= 0 || entry.time > durationSeconds) return [];
    return [{ timeSeconds: entry.time, category: category(entry) }];
  }).sort((a, b) => a.timeSeconds - b.timeSeconds);
  const rejectedEvents = raw.length - events.length;
  return { events, reportedLastHits, rejectedEvents, durationSeconds,
    coverage: durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0
      && rejectedEvents === 0 && events.length === reportedLastHits ? 'complete' : 'partial' };
}
