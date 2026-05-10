import { fetchHeroItemTimings } from '@/lib/dota/clients/opendotaScenarios';

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
