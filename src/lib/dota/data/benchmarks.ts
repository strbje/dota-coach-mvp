import { normalizeHeroBenchmarks } from '@/lib/dota/adapters/normalizeBenchmarks';
import { fetchOpenDotaPath } from '@/lib/dota/providers/opendotaProvider';
import { withTimeout } from '@/lib/dota/async/withTimeout';

const OPTIONAL_SOURCE_TIMEOUT_MS = 4_000;

export async function getHeroBenchmarks(heroId: number) {
  try {
    const payload = await withTimeout(fetchOpenDotaPath(`/benchmarks?hero_id=${heroId}`), OPTIONAL_SOURCE_TIMEOUT_MS, 'OpenDota benchmarks');
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
