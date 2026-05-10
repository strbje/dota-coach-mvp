import { fetchHeroItemPopularity } from '@/lib/dota/clients/opendotaScenarios';

export type ItemPopularityRow = {
  itemKey: string;
  stage: 'start' | 'early' | 'mid' | 'late';
  matches?: number;
  winRate?: number;
};

export async function getHeroItemPopularity(heroId: number): Promise<ItemPopularityRow[] | null> {
  const rows = await fetchHeroItemPopularity(heroId);
  if (!rows) return null;

  const normalized: ItemPopularityRow[] = [];
  for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const raw = row as Record<string, unknown>;
      const itemKey = typeof raw.item === 'string' ? raw.item : typeof raw.item_name === 'string' ? raw.item_name : null;
      const stageRaw = typeof raw.stage === 'string' ? raw.stage.toLowerCase() : 'mid';
      const stage = (['start', 'early', 'mid', 'late'].includes(stageRaw) ? stageRaw : 'mid') as ItemPopularityRow['stage'];
      if (!itemKey) continue;
      normalized.push({
        itemKey,
        stage,
        matches: typeof raw.games === 'number' ? raw.games : typeof raw.matches === 'number' ? raw.matches : undefined,
        winRate: typeof raw.win_rate === 'number' ? raw.win_rate : undefined
      });
  }
  return normalized;
}
