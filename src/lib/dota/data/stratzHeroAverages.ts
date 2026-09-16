import { normalizeStratzHeroAverage } from '@/lib/dota/adapters/normalizeBenchmarks';
import { fetchStratzHeroAverage } from '@/lib/dota/providers/stratzProvider';
import { withTimeout } from '@/lib/dota/async/withTimeout';

const OPTIONAL_SOURCE_TIMEOUT_MS = 4_000;

export async function getStratzHeroAverage(matchId: number, heroId: number) {
  try {
    const payload = await withTimeout(fetchStratzHeroAverage(matchId), OPTIONAL_SOURCE_TIMEOUT_MS, 'STRATZ heroAverage');
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
