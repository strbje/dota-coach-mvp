import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const OPENDOTA_BASE = 'https://api.opendota.com/api';

export async function fetchOpenDotaMatch(matchId: number): Promise<OpenDotaMatchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}/matches/${matchId}`);
  if (key) url.searchParams.set('api_key', key);

  const response = await fetch(url, { next: { revalidate: 0 } });
  if (!response.ok) {
    throw new Error(`OpenDota request failed with status ${response.status}`);
  }

  return (await response.json()) as OpenDotaMatchResponse;
}
