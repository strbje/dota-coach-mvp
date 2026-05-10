const OPENDOTA_BASE = 'https://api.opendota.com/api';

async function fetchOpenDotaScenario(path: string): Promise<unknown> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}${path}`);
  if (key) url.searchParams.set('api_key', key);

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) throw new Error(`OpenDota scenarios request failed with status ${response.status}`);
  return response.json();
}

export type OpenDotaItemBenchmarkSource =
  | 'opendota_scenarios'
  | 'opendota_item_popularity'
  | 'manual_mvp_threshold'
  | 'unavailable';

export async function fetchHeroItemTimings(heroId: number): Promise<unknown[] | null> {
  try {
    const payload = await fetchOpenDotaScenario(`/scenarios/itemTimings`);
    if (!Array.isArray(payload)) return null;
    return payload.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const candidate = row as Record<string, unknown>;
      const id = candidate.hero_id;
      return Number(id) === heroId;
    });
  } catch {
    return null;
  }
}

export async function fetchHeroItemPopularity(heroId: number): Promise<unknown[] | null> {
  try {
    const payload = await fetchOpenDotaScenario(`/heroes/${heroId}/itemPopularity`);
    if (!Array.isArray(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}
