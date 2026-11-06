import type { FarmIntervalReport } from './farmIntervals';

export const farmTypes = [
  { key: 'lane', label: 'Крипы на линии' },
  { key: 'neutral', label: 'Нейтралы' },
  { key: 'ancient', label: 'Эншенты' },
  { key: 'unclassified', label: 'Тип не определён' }
] as const;

// A partial event stream must never be drawn as the composition of a complete total.
export function farmChart(report: FarmIntervalReport) {
  const bars = report.intervals.map((interval) => {
    const minutes = ((interval.coveredTo ?? interval.to) - interval.from) / 60;
    const breakdown = interval.breakdown;
    const canSplit = report.source === 'stratz' && report.eventCoverage === 'complete' && breakdown
      && minutes > 0 && farmTypes.reduce((sum, type) => sum + breakdown[type.key], 0) === interval.lastHits;
    return {
      ...interval,
      partial: interval.coveredTo !== undefined && interval.coveredTo < interval.to,
      short: interval.to - interval.from < 300,
      segments: canSplit ? farmTypes.map((type) => ({ ...type, rate: breakdown[type.key] / minutes })) : undefined
    };
  });
  return { bars, max: Math.max(1, ...bars.map((bar) => bar.perMinute ?? 0)) };
}
