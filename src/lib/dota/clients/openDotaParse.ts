export type ParseRequestCode = 'rate_limit' | 'timeout' | 'unavailable' | 'invalid_response';
export class ParseRequestError extends Error {
  constructor(readonly code: ParseRequestCode) { super(code); }
}

/** Explicit user action only. Queue acceptance is not proof that a replay was parsed. */
export async function requestMatchParse(matchId: number): Promise<{ jobId: string }> {
  const url = new URL(`https://api.opendota.com/api/request/${matchId}`);
  if (process.env.OPENDOTA_API_KEY) url.searchParams.set('api_key', process.env.OPENDOTA_API_KEY);
  try {
    const response = await fetch(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'User-Agent': 'dota-coach-mvp/0.1 local-dev' } });
    if (!response.ok) throw new ParseRequestError(response.status === 429 ? 'rate_limit' : 'unavailable');
    const result: unknown = await response.json();
    const jobId = (result as { job?: { jobId?: unknown } } | null)?.job?.jobId;
    if ((typeof jobId !== 'string' && typeof jobId !== 'number') || !/^[1-9]\d{0,19}$/.test(String(jobId))
      || typeof jobId === 'number' && (!Number.isSafeInteger(jobId) || jobId <= 0)) throw new ParseRequestError('invalid_response');
    return { jobId: String(jobId) };
  } catch (error) {
    if (error instanceof ParseRequestError) throw error;
    throw new ParseRequestError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unavailable');
  }
}
