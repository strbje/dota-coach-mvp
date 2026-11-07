import type { FarmCategory, FarmEvents } from '../normalize/farmEvents';
import type { OtherFarmTarget } from '../normalize/farmTargets';

export type FarmInterval = {
  from: number;
  to: number;
  coveredTo?: number;
  lastHits?: number;
  perMinute?: number;
  breakdown?: Record<FarmCategory, number>;
  otherTargets?: Array<OtherFarmTarget & { count: number }>;
};
export type FarmIntervalReport = {
  source: 'opendota' | 'stratz' | 'unavailable';
  intervals: FarmInterval[];
  eventCoverage: 'complete' | 'partial' | 'unavailable';
  receivedEvents: number;
  reportedLastHits?: number;
  rejectedEvents: number;
  highlightIndex?: number;
};

const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Fixed five-minute windows. No interpolation, external targets, scores or causal claims. */
export function buildFarmIntervals(durationSeconds: number, minutes?: Array<number | null>, farm?: FarmEvents): FarmIntervalReport {
  const completeEvents = farm?.coverage === 'complete' && farm.durationSeconds === durationSeconds;
  const eligibleEvents = farm?.events.filter((event) => event.timeSeconds <= durationSeconds);
  const source = completeEvents ? 'stratz' : minutes?.some(validCount) ? 'opendota' : 'unavailable';
  const report: FarmIntervalReport = { source, intervals: [], eventCoverage: farm ? completeEvents ? 'complete' : 'partial' : 'unavailable',
    receivedEvents: eligibleEvents?.length ?? 0, reportedLastHits: farm?.reportedLastHits,
    rejectedEvents: (farm?.rejectedEvents ?? 0) + (farm?.events.length ?? 0) - (eligibleEvents?.length ?? 0) };
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return report;
  for (let from = 0; from < durationSeconds; from += 300) {
    const to = Math.min(from + 300, durationSeconds);
    const interval: FarmInterval = { from, to };
    // Half-open windows; the last one includes a possible event at the exact match end.
    const events = eligibleEvents?.filter((event) => event.timeSeconds >= from
      && (event.timeSeconds < to || to === durationSeconds && event.timeSeconds === to));
    if (events?.length || completeEvents) {
      interval.breakdown = { lane: 0, neutral: 0, ancient: 0, other: 0, unclassified: 0 };
      const targets = new Map<number, OtherFarmTarget & { count: number }>();
      for (const event of events ?? []) {
        interval.breakdown[event.category]++;
        if (event.category === 'other' && event.target) {
          const target = targets.get(event.target.npcId);
          if (target) target.count++;
          else targets.set(event.target.npcId, { ...event.target, count: 1 });
        }
      }
      if (targets.size) interval.otherTargets = [...targets.values()].sort((a, b) => a.npcId - b.npcId);
    }
    if (source === 'stratz') {
      interval.lastHits = events!.length;
      interval.coveredTo = to;
    } else if (source === 'opendota') {
      const start = from / 60;
      const end = Math.floor(to / 60);
      // Stop at the first missing/invalid/regressing snapshot. Later windows may recover.
      if (validCount(minutes?.[start])) {
        let coveredMinute = start;
        while (coveredMinute < end && validCount(minutes?.[coveredMinute + 1])
          && minutes![coveredMinute + 1]! >= minutes![coveredMinute]!) coveredMinute++;
        if (coveredMinute > start) {
          interval.lastHits = minutes![coveredMinute]! - minutes![start]!;
          interval.coveredTo = coveredMinute * 60;
        }
      }
    }
    if (interval.lastHits !== undefined && interval.coveredTo !== undefined) {
      interval.perMinute = interval.lastHits / ((interval.coveredTo - from) / 60);
    }
    report.intervals.push(interval);
  }
  let largestDrop = 0;
  report.intervals.forEach((current, index) => {
    const previous = report.intervals[index - 1];
    if (!previous || [previous, current].some((window) => window.to - window.from !== 300
      || window.coveredTo !== window.to || window.perMinute === undefined)) return;
    // Equal five-minute windows: compare integer counts to avoid floating-point tie drift.
    const drop = previous.lastHits! - current.lastHits!;
    if (drop > largestDrop) { largestDrop = drop; report.highlightIndex = index; }
  });
  return report;
}
