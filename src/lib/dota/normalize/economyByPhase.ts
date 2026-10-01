export type EconomyPhaseKey = 'laning' | 'earlyMid' | 'midGame' | 'lateGame';

export type EconomyPhaseValue = {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  goldStart?: number;
  goldEnd?: number;
  goldDelta?: number;
  goldPerMinuteInPhase?: number;
  lhStart?: number;
  lhEnd?: number;
  lhDelta?: number;
  lhPerMinuteInPhase?: number;
  xpStart?: number;
  xpEnd?: number;
  xpDelta?: number;
  xpPerMinuteInPhase?: number;
  deaths?: number;
};

const PHASE_RANGES: Array<{ phase: EconomyPhaseKey; start: number; end?: number }> = [
  { phase: 'laning', start: 0, end: 10 },
  { phase: 'earlyMid', start: 10, end: 20 },
  { phase: 'midGame', start: 20, end: 35 },
  { phase: 'lateGame', start: 35 }
];

function finiteSnapshotAt(timeline: number[] | null, minute: number, durationSeconds: number) {
  if (!timeline || durationSeconds < minute * 60) return undefined;
  const value = timeline[minute];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Lane checkpoints are independent of the combined gold/LH/XP phase timeline. */
export function normalizeLaneEconomyAt10(gold: number[] | null, lastHits: number[] | null, durationSeconds: number) {
  return {
    lhAt10: finiteSnapshotAt(lastHits, 10, durationSeconds),
    goldAt10: finiteSnapshotAt(gold, 10, durationSeconds)
  };
}

export function normalizeEconomyTimeline(
  gold: number[] | null,
  lastHits: number[] | null,
  xp: number[] | null,
  durationSeconds: number,
  deathsByPhase?: Partial<Record<EconomyPhaseKey, number>>
) {
  const matchEndMinute = Math.floor(durationSeconds / 60);
  const lastSnapshotMinute = Math.min(matchEndMinute, Math.max(
    gold?.length ? gold.length - 1 : -1,
    lastHits?.length ? lastHits.length - 1 : -1,
    xp?.length ? xp.length - 1 : -1
  ));

  const metricAt = (timeline: number[] | null, minute: number) => {
    const value = timeline?.[minute];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };

  const economyByPhase: Partial<Record<EconomyPhaseKey, EconomyPhaseValue>> = {};
  for (const { phase, start, end } of PHASE_RANGES) {
    const requestedEndMinute = Math.min(end ?? matchEndMinute, matchEndMinute);
    const candidateTimelines = [gold, lastHits, xp].filter((timeline): timeline is number[] => {
      if (!timeline || metricAt(timeline, start) === undefined) return false;
      return timeline.some((_, minute) => minute > start && minute <= requestedEndMinute && metricAt(timeline, minute) !== undefined);
    });
    const endMinute = Math.max(start, ...candidateTimelines.map((timeline) => {
      for (let minute = Math.min(requestedEndMinute, timeline.length - 1); minute > start; minute -= 1) {
        if (metricAt(timeline, minute) !== undefined) return minute;
      }
      return start;
    }));
    if (endMinute <= start) continue;
    const durationMinutes = endMinute - start;
    const goldStart = metricAt(gold, start); const goldEnd = metricAt(gold, endMinute);
    const lhStart = metricAt(lastHits, start); const lhEnd = metricAt(lastHits, endMinute);
    const xpStart = metricAt(xp, start); const xpEnd = metricAt(xp, endMinute);
    if ((goldStart === undefined || goldEnd === undefined)
      && (lhStart === undefined || lhEnd === undefined)
      && (xpStart === undefined || xpEnd === undefined)) continue;
    economyByPhase[phase] = {
      startMinute: start,
      endMinute,
      durationMinutes,
      ...(goldStart !== undefined && goldEnd !== undefined ? { goldStart, goldEnd, goldDelta: goldEnd - goldStart, goldPerMinuteInPhase: (goldEnd - goldStart) / durationMinutes } : {}),
      ...(lhStart !== undefined && lhEnd !== undefined ? { lhStart, lhEnd, lhDelta: lhEnd - lhStart, lhPerMinuteInPhase: (lhEnd - lhStart) / durationMinutes } : {}),
      ...(xpStart !== undefined && xpEnd !== undefined ? { xpStart, xpEnd, xpDelta: xpEnd - xpStart, xpPerMinuteInPhase: (xpEnd - xpStart) / durationMinutes } : {}),
      deaths: deathsByPhase?.[phase]
    };
  }

  const checkpoints = [10, 20, 35]
    .filter((minute) => minute <= matchEndMinute)
    .map((minute) => ({ minute, cs: metricAt(lastHits, minute), totalGold: metricAt(gold, minute) }))
    .filter((sample) => sample.cs !== undefined || sample.totalGold !== undefined);

  return { economyByPhase, checkpoints, lastSnapshotMinute };
}
