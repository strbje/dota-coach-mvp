import { normalizeStratzHeroAverage } from '@/lib/dota/adapters/normalizeBenchmarks';
import { fetchStratzHeroAverage } from '@/lib/dota/providers/stratzProvider';

export async function getStratzHeroAverage(matchId: number, heroId: number) {
  try {
    const payload = await fetchStratzHeroAverage(matchId);
    return normalizeStratzHeroAverage(matchId, heroId, payload);
  } catch (error) {
    return {
      source: 'stratz' as const,
      matchId,
      selectedHeroId: heroId,
      available: false,
      samples: [],
      methodologyStatus: 'unknown' as const,
      warnings: [error instanceof Error ? error.message : 'STRATZ heroAverage unavailable']
    };
  }
}
