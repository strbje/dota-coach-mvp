import type { ItemPopularityRow } from '@/lib/dota/data/itemPopularity';
import type { ItemTimingScenarioRow } from '@/lib/dota/data/itemTimingScenarios';

export type NormalizedItemBenchmark = {
  itemKey: string;
  popularityTier: 'typical' | 'uncommon' | 'rare' | 'unknown';
  typicalTimingSeconds?: number;
};

export function normalizeItemBenchmarks(popularity: ItemPopularityRow[] | null, timings: ItemTimingScenarioRow[] | null): Record<string, NormalizedItemBenchmark> {
  const result: Record<string, NormalizedItemBenchmark> = {};

  for (const row of popularity ?? []) {
    if (!result[row.itemKey]) result[row.itemKey] = { itemKey: row.itemKey, popularityTier: 'unknown' };
    const matches = row.matches ?? 0;
    result[row.itemKey].popularityTier = matches >= 200 ? 'typical' : matches >= 70 ? 'uncommon' : 'rare';
  }

  for (const row of timings ?? []) {
    if (!result[row.itemKey]) result[row.itemKey] = { itemKey: row.itemKey, popularityTier: 'unknown' };
    result[row.itemKey].typicalTimingSeconds = row.timeSeconds;
  }

  return result;
}
