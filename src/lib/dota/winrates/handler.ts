import { failure, SourceError } from './source';
import { InputError, parseBatch, parseParticipantQuery, parseQuery, winrateService, type WinrateService } from './service';

export async function handleWinrate(request: Request, kind: 'plan' | 'participant' | 'batch', service: WinrateService = winrateService): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    // Bounded reading also handles chunked bodies without trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new InputError('Missing body');
    let body = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2048) { await reader.cancel(); throw new InputError('Large body'); }
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new InputError('Invalid JSON'); }
    const batch = kind === 'batch' ? parseBatch(parsed) : undefined;
    const result = batch ? await service.batch(batch.query, batch.matchIds, batch.capturedAt, request.signal) : kind === 'plan'
      ? await service.plan(parseQuery(parsed), request.signal)
      : await service.participant(parseParticipantQuery(parsed), request.signal);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof InputError) return Response.json({ error: 'invalid_input' }, { status: 400, headers });
    const code = failure(error);
    const retryAfter = error instanceof SourceError ? error.retryAfter : undefined;
    return Response.json({ error: code, retryAfter }, { status: code === 'rate_limit' ? 429 : 503, headers: { ...headers, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } });
  }
}
