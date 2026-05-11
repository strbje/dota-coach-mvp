import { normalizeItemTimingScenarios } from '@/lib/dota/adapters/normalizeBenchmarks';
import { fetchHeroItemTimings } from '@/lib/dota/clients/opendotaScenarios';
import { fetchOpenDotaPath } from '@/lib/dota/providers/opendotaProvider';

export type ItemTimingScenarioRow = {
  itemKey: string;
  timeSeconds: number;
  role?: string;
};

export async function getHeroItemTimingScenarios(heroId: number): Promise<ItemTimingScenarioRow[] | null> {
  const rows = await fetchHeroItemTimings(heroId);
  if (!rows) return null;

  const normalized: ItemTimingScenarioRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Record<string, unknown>;
    const itemKey = typeof raw.item === 'string' ? raw.item : typeof raw.item_name === 'string' ? raw.item_name : null;
    const timeSeconds = typeof raw.time === 'number' ? raw.time : typeof raw.avg_time === 'number' ? raw.avg_time : null;
    if (!itemKey || typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) continue;
    normalized.push({
      itemKey,
      timeSeconds,
      role: typeof raw.role === 'string' ? raw.role : undefined
    });
  }
  return normalized;
}

export async function getHeroItemTimingScenariosResearch(heroId: number, itemKey?: string) {
  try {
    const query = itemKey ? `/scenarios/itemTimings?hero_id=${heroId}&item=${encodeURIComponent(itemKey)}` : `/scenarios/itemTimings?hero_id=${heroId}`;
    const payload = await fetchOpenDotaPath(query);
    return normalizeItemTimingScenarios(heroId, payload);
  } catch (error) {
    return {
      source: 'opendota' as const,
      heroId,
      available: false,
      items: [],
      errors: [error instanceof Error ? error.message : 'OpenDota itemTimings unavailable']
    };
  }
}
