import { normalizeHeroBenchmarks } from '@/lib/dota/adapters/normalizeBenchmarks';
import { fetchOpenDotaPath } from '@/lib/dota/providers/opendotaProvider';

export async function getHeroBenchmarks(heroId: number) {
  try {
    const payload = await fetchOpenDotaPath(`/benchmarks?hero_id=${heroId}`);
    return normalizeHeroBenchmarks(heroId, payload);
  } catch (error) {
    return {
      source: 'opendota' as const,
      heroId,
      available: false,
      metrics: {},
      errors: [error instanceof Error ? error.message : 'OpenDota benchmarks unavailable']
    };
  }
}
