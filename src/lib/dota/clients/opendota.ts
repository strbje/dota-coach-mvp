import https from 'node:https';
import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const OPENDOTA_TIMEOUT_MS = 60_000;
const RETRYABLE_NETWORK_ERRORS = [
  'terminated',
  'fetch failed',
  'ECONNRESET',
  'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT',
  'ETIMEDOUT',
  'EAI_AGAIN'
];

type OpenDotaTransport = 'fetch' | 'https-fallback';

type OpenDotaRequestError = Error & {
  transport?: OpenDotaTransport;
};

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

function isHttpErrorWithoutFallback(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    'OpenDota bad request: verify match id format',
    'OpenDota auth error: check OPENDOTA_API_KEY or use free tier without key',
    'OpenDota match not found or not parsed',
    'OpenDota rate limit exceeded. Try again later.'
  ].includes(error.message);
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const cause = error.cause as { message?: string; code?: string } | undefined;
  const code = (error as { code?: string }).code;
  const haystack = [error.name, error.message, cause?.message, cause?.code, code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return RETRYABLE_NETWORK_ERRORS.some((marker) => haystack.includes(marker.toLowerCase()));
}

async function requestOpenDotaWithFetch(url: URL): Promise<string> {
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
      throw buildOpenDotaError(response.status);
    }

    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function requestOpenDotaWithHttps(url: URL): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        timeout: OPENDOTA_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'dota-coach-mvp/0.1 local-dev',
          Connection: 'close'
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        const statusCode = response.statusCode ?? 0;

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('error', (error) => {
          reject(error);
        });

        response.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(buildOpenDotaError(statusCode));
            return;
          }

          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('OpenDota https request timed out after 60s'));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

function toOpenDotaRequestError(error: unknown, transport: OpenDotaTransport): OpenDotaRequestError {
  const parsed = error instanceof Error ? error : new Error('OpenDota request failed');
  const enriched = parsed as OpenDotaRequestError;
  enriched.transport = transport;
  return enriched;
}

function parseOpenDotaMatch(text: string): OpenDotaMatchResponse {
  if (!text.trim()) {
    throw new Error('OpenDota returned empty response body');
  }

  try {
    return JSON.parse(text) as OpenDotaMatchResponse;
  } catch {
    throw new Error('OpenDota returned invalid JSON payload');
  }
}

async function fetchOpenDotaJson(path: string): Promise<unknown> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}${path}`);
  if (key) url.searchParams.set('api_key', key);

  const text = await requestOpenDotaWithFetch(url);
  return JSON.parse(text);
}

export async function fetchOpenDotaConstants(resource: string): Promise<Record<string, string> | null> {
  try {
    const payload = await fetchOpenDotaJson(`/constants/${resource}`);
    if (!payload || typeof payload !== 'object') return null;
    return payload as Record<string, string>;
  } catch {
    return null;
  }
}

export async function fetchOpenDotaMatch(matchId: number): Promise<OpenDotaMatchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}/matches/${matchId}`);
  if (key) url.searchParams.set('api_key', key);

  const fetchStart = Date.now();

  try {
    const text = await requestOpenDotaWithFetch(url);

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[opendota] request succeeded', {
        matchId,
        transport: 'fetch',
        durationMs: Date.now() - fetchStart
      });
    }

    return parseOpenDotaMatch(text);
  } catch (fetchError) {
    const parsedFetchError = toOpenDotaRequestError(fetchError, 'fetch');

    if (process.env.NODE_ENV !== 'production') {
      const cause = parsedFetchError.cause as { code?: string } | undefined;
      console.error('[opendota] request failed', {
        matchId,
        transport: 'fetch',
        durationMs: Date.now() - fetchStart,
        errorName: parsedFetchError.name,
        errorMessage: parsedFetchError.message,
        errorCauseCode: cause?.code ?? (parsedFetchError as { code?: string }).code
      });
    }

    if (isHttpErrorWithoutFallback(parsedFetchError) || !isRetryableNetworkError(parsedFetchError)) {
      throw parsedFetchError;
    }

    const fallbackStart = Date.now();

    try {
      const text = await requestOpenDotaWithHttps(url);

      if (process.env.NODE_ENV !== 'production') {
        console.warn('[opendota] request succeeded', {
          matchId,
          transport: 'https-fallback',
          durationMs: Date.now() - fallbackStart
        });
      }

      return parseOpenDotaMatch(text);
    } catch (httpsError) {
      const parsedHttpsError = toOpenDotaRequestError(httpsError, 'https-fallback');
      const fallbackCause = parsedHttpsError.cause as { code?: string } | undefined;

      if (process.env.NODE_ENV !== 'production') {
        console.error('[opendota] request failed', {
          matchId,
          transport: 'https-fallback',
          durationMs: Date.now() - fallbackStart,
          errorName: parsedHttpsError.name,
          errorMessage: parsedHttpsError.message,
          errorCauseCode: fallbackCause?.code ?? (parsedHttpsError as { code?: string }).code
        });
      }

      const combinedError = new Error(
        `OpenDota fetch failed and https fallback failed: ${parsedHttpsError.message}`,
        { cause: parsedHttpsError }
      ) as OpenDotaRequestError;
      combinedError.transport = 'https-fallback';
      throw combinedError;
    }
  }
}
