export type EconomyPhaseKey = 'laning' | 'earlyMid' | 'midGame' | 'lateGame';

export type EconomyPhaseValue = {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  goldStart: number;
  goldEnd: number;
  goldDelta: number;
  goldPerMinuteInPhase: number;
  lhStart: number;
  lhEnd: number;
  lhDelta: number;
  lhPerMinuteInPhase: number;
  xpStart: number;
  xpEnd: number;
  xpDelta: number;
  xpPerMinuteInPhase: number;
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
  gold: number[],
  lastHits: number[],
  xp: number[],
  durationSeconds: number,
  deathsByPhase?: Partial<Record<EconomyPhaseKey, number>>
) {
  const lastSnapshotMinute = Math.min(
    Math.floor(durationSeconds / 60),
    gold.length - 1,
    lastHits.length - 1,
    xp.length - 1
  );

  const economyByPhase: Partial<Record<EconomyPhaseKey, EconomyPhaseValue>> = {};
  for (const { phase, start, end } of PHASE_RANGES) {
    const endMinute = Math.min(end ?? lastSnapshotMinute, lastSnapshotMinute);
    if (endMinute <= start) continue;
    const durationMinutes = endMinute - start;
    economyByPhase[phase] = {
      startMinute: start,
      endMinute,
      durationMinutes,
      goldStart: gold[start], goldEnd: gold[endMinute], goldDelta: gold[endMinute] - gold[start], goldPerMinuteInPhase: (gold[endMinute] - gold[start]) / durationMinutes,
      lhStart: lastHits[start], lhEnd: lastHits[endMinute], lhDelta: lastHits[endMinute] - lastHits[start], lhPerMinuteInPhase: (lastHits[endMinute] - lastHits[start]) / durationMinutes,
      xpStart: xp[start], xpEnd: xp[endMinute], xpDelta: xp[endMinute] - xp[start], xpPerMinuteInPhase: (xp[endMinute] - xp[start]) / durationMinutes,
      deaths: deathsByPhase?.[phase]
    };
  }

  const checkpoints = [10, 20, 35]
    .filter((minute) => minute <= lastSnapshotMinute)
    .map((minute) => ({ minute, cs: lastHits[minute], totalGold: gold[minute] }));

  return { economyByPhase, checkpoints, lastSnapshotMinute };
}
