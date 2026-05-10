import { getItemNameByKey } from '@/lib/dota/constants/items';
import type { MatchPhase } from '@/lib/dota/types/domain';
import type { NormalizedItemBenchmark } from '@/lib/dota/normalize/normalizeItemBenchmarks';

export type ItemStatus = {
  key: string;
  name: string;
  time: string;
  phase: MatchPhase;
  popularityStatus: 'typical' | 'uncommon' | 'rare' | 'unknown';
  timingStatus: 'early' | 'normal' | 'late' | 'unknown';
};

export function evaluateItemStatus(
  purchased: Array<{ key: string; time: string; timeSeconds: number; phase: MatchPhase }>,
  benchmarks: Record<string, NormalizedItemBenchmark>
): ItemStatus[] {
  return purchased.map((item) => {
    const benchmark = benchmarks[item.key];
    const timingStatus = !benchmark?.typicalTimingSeconds
      ? 'unknown'
      : item.timeSeconds <= benchmark.typicalTimingSeconds - 90
        ? 'early'
        : item.timeSeconds <= benchmark.typicalTimingSeconds + 120
          ? 'normal'
          : 'late';

    return {
      key: item.key,
      name: getItemNameByKey(item.key),
      time: item.time,
      phase: item.phase,
      popularityStatus: benchmark?.popularityTier ?? 'unknown',
      timingStatus
    };
  });
}
