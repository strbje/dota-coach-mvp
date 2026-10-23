const OPENDOTA_BASE = 'https://api.opendota.com/api';

export type OpenDotaResearchResponse = {
  url: string;
  status: number | null;
  contentType: string | null;
  payload?: unknown;
  rawPreview?: string;
  error?: string;
};

function redactDiagnostics(value: string, apiKey: string | undefined): string {
  let redacted = value.replace(/(api_key=)[^&\s"']+/gi, '$1[REDACTED]');
  if (apiKey) {
    redacted = redacted.split(apiKey).join('[REDACTED]');
    const encodedKey = encodeURIComponent(apiKey);
    redacted = redacted.split(encodedKey).join('[REDACTED]');
  }
  return redacted;
}

const preview = (body: string, apiKey: string | undefined) => redactDiagnostics(body.replace(/\s+/g, ' ').trim(), apiKey).slice(0, 500);

/** Fetches an OpenDota endpoint without throwing so debug routes retain HTTP diagnostics. */
export async function fetchOpenDotaPathResearch(path: string): Promise<OpenDotaResearchResponse> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}${path}`);
  if (key) url.searchParams.set('api_key', key);
  const publicUrl = new URL(url);
  publicUrl.searchParams.delete('api_key');

  try {
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const contentType = response.headers.get('content-type');
    const body = await response.text();
    const rawPreview = preview(body, key);

    if (!response.ok) {
      return { url: publicUrl.toString(), status: response.status, contentType, rawPreview, error: `OpenDota request failed with status ${response.status}` };
    }

    try {
      return { url: publicUrl.toString(), status: response.status, contentType, payload: JSON.parse(body), rawPreview };
    } catch {
      return { url: publicUrl.toString(), status: response.status, contentType, rawPreview, error: 'OpenDota returned invalid JSON' };
    }
  } catch (error) {
    return {
      url: publicUrl.toString(),
      status: null,
      contentType: null,
      error: redactDiagnostics(error instanceof Error ? error.message : 'OpenDota request failed', key)
    };
  }
}

export class OpenDotaHttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfterSeconds?: number) {
    super(`OpenDota request failed with status ${status}`);
    this.name = 'OpenDotaHttpError';
  }
}

export async function fetchOpenDotaPath(path: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = new URL(`${OPENDOTA_BASE}${path}`);
  if (key) url.searchParams.set('api_key', key);

  const timeout = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(Math.max(1, Math.ceil(options.timeoutMs)));
  const signal = options.signal && timeout ? AbortSignal.any([options.signal, timeout]) : options.signal ?? timeout;
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) {
    const retryHeader = response.headers.get('retry-after');
    const seconds = retryHeader === null ? NaN : /^\d+$/.test(retryHeader) ? Number(retryHeader) : (Date.parse(retryHeader) - Date.now()) / 1000;
    // Release the response body before a bounded retry in the caller.
    await response.body?.cancel();
    throw new OpenDotaHttpError(response.status, Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : undefined);
  }

  return response.json();
}
