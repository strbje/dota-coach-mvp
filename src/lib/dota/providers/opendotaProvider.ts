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
