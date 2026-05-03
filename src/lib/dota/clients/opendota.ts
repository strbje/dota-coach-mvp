import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const OPENDOTA_TIMEOUT_MS = 12_000;

function buildOpenDotaError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error('OpenDota auth error: check OPENDOTA_API_KEY or use free tier without key');
  }

  if (status === 404) {
    return new Error('OpenDota match not found or not parsed');
  }

  if (status === 429) {
    return new Error('OpenDota rate limit exceeded');
  }

  if (status >= 500) {
    return new Error('OpenDota service unavailable');
  }

  return new Error(`OpenDota request failed with status ${status}`);
}

export async function fetchOpenDotaMatch(matchId: number): Promise<OpenDotaMatchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}/matches/${matchId}`);
  if (key) url.searchParams.set('api_key', key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENDOTA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw buildOpenDotaError(response.status);
    }

    return (await response.json()) as OpenDotaMatchResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota request timed out');
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('OpenDota request failed');
  } finally {
    clearTimeout(timeoutId);
  }
}
