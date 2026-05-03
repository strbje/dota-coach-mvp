import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const OPENDOTA_TIMEOUT_MS = 20_000;
const RETRYABLE_NETWORK_ERRORS = ['terminated', 'fetch failed', 'ECONNRESET', 'UND_ERR_SOCKET', 'UND_ERR_BODY_TIMEOUT'];
const MAX_ATTEMPTS = 2;

function buildOpenDotaError(status: number): Error {
  if (status === 400) {
    return new Error('OpenDota bad request: verify match id format');
  }

  if (status === 401 || status === 403) {
    return new Error('OpenDota auth error: check OPENDOTA_API_KEY or use free tier without key');
  }

  if (status === 404) {
    return new Error('OpenDota match not found or not parsed');
  }

  if (status === 429) {
    return new Error('OpenDota rate limit exceeded. Try again later.');
  }

  if (status >= 500) {
    return new Error('OpenDota service unavailable');
  }

  return new Error(`OpenDota request failed with status ${status}`);
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${(error.cause as { message?: string } | undefined)?.message ?? ''}`;
  return RETRYABLE_NETWORK_ERRORS.some((marker) => message.includes(marker));
}

export async function fetchOpenDotaMatch(matchId: number): Promise<OpenDotaMatchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}/matches/${matchId}`);
  if (key) url.searchParams.set('api_key', key);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENDOTA_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'dota-coach-mvp/0.1 local-dev',
          Connection: 'close'
        }
      });

      if (!response.ok) {
        const httpError = buildOpenDotaError(response.status);

        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          lastError = httpError;
          continue;
        }

        throw httpError;
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error('OpenDota returned empty response body');
      }

      try {
        return JSON.parse(text) as OpenDotaMatchResponse;
      } catch {
        throw new Error('OpenDota returned invalid JSON payload');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('OpenDota request timed out');
        if (attempt < MAX_ATTEMPTS) {
          lastError = timeoutError;
          continue;
        }
        throw timeoutError;
      }

      if (isRetryableNetworkError(error) && attempt < MAX_ATTEMPTS) {
        lastError = error instanceof Error ? error : new Error('OpenDota request failed');
        continue;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('OpenDota request failed');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('OpenDota request failed');
}
