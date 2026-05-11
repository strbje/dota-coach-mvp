const OPENDOTA_BASE = 'https://api.opendota.com/api';

export async function fetchOpenDotaPath(path: string): Promise<unknown> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}${path}`);
  if (key) url.searchParams.set('api_key', key);

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`OpenDota request failed with status ${response.status}`);
  }

  return response.json();
}
