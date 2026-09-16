import https from 'node:https';
import type { OpenDotaMatchResponse } from '../types/providers';

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const OPENDOTA_TOTAL_BUDGET_MS = 20_000;
const OPENDOTA_PRIMARY_TIMEOUT_MS = 15_000;
const RETRYABLE_NETWORK_ERRORS = [
  'terminated',
  'fetch failed',
  'ECONNRESET',
  'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'OpenDota request timed out',
  'OpenDota returned empty response body',
  'OpenDota returned invalid JSON payload'
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

async function requestOpenDotaWithFetch(url: URL, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function requestOpenDotaWithHttps(url: URL, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const request = https.request(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
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
          finish(() => reject(error));
        });

        response.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            finish(() => reject(buildOpenDotaError(statusCode)));
            return;
          }

          finish(() => resolve(Buffer.concat(chunks).toString('utf8')));
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('OpenDota https request timed out'));
    });

    request.on('error', (error) => {
      finish(() => reject(error));
    });

    const timeoutId = setTimeout(() => {
      request.destroy(new Error('OpenDota https request timed out'));
    }, timeoutMs);
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

  const text = await requestOpenDotaWithFetch(url, OPENDOTA_PRIMARY_TIMEOUT_MS);
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

export async function fetchOpenDotaMatch(
  matchId: number,
  timeoutOptions: { totalBudgetMs?: number; primaryTimeoutMs?: number } = {}
): Promise<OpenDotaMatchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}/matches/${matchId}`);
  if (key) url.searchParams.set('api_key', key);

  const fetchStart = Date.now();
  const totalBudgetMs = timeoutOptions.totalBudgetMs ?? OPENDOTA_TOTAL_BUDGET_MS;
  const primaryTimeoutMs = Math.min(timeoutOptions.primaryTimeoutMs ?? OPENDOTA_PRIMARY_TIMEOUT_MS, totalBudgetMs);

  try {
    const text = await requestOpenDotaWithFetch(url, primaryTimeoutMs);

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
    const remainingBudgetMs = totalBudgetMs - (fallbackStart - fetchStart);
    if (remainingBudgetMs <= 0) {
      throw new Error('OpenDota request timed out');
    }

    try {
      const text = await requestOpenDotaWithHttps(url, remainingBudgetMs);

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
