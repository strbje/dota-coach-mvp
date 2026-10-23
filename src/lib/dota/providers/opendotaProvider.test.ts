import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOpenDotaPath, fetchOpenDotaPathResearch, OpenDotaHttpError } from './opendotaProvider';

test('bounded provider preserves retry-after and aborts a stalled request', async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response('limited', { status: 429, headers: { 'retry-after': '90' } })) as typeof fetch;
  try {
    await assert.rejects(fetchOpenDotaPath('/players/1001', { timeoutMs: 100 }), (error: unknown) => error instanceof OpenDotaHttpError && error.status === 429 && error.retryAfterSeconds === 90);
    global.fetch = (async (_input, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }) as typeof fetch;
    // Keep the loop alive while AbortSignal.timeout uses an unref'ed timer.
    const keepAlive = setTimeout(() => undefined, 100);
    try { await assert.rejects(fetchOpenDotaPath('/players/1001', { timeoutMs: 10 }), { name: 'TimeoutError' }); }
    finally { clearTimeout(keepAlive); }
  } finally { global.fetch = original; }
});

test('research fetch retains HTTP diagnostics and a bounded body preview', async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response('upstream denied '.repeat(100), {
    status: 429,
    headers: { 'content-type': 'text/plain' }
  })) as typeof fetch;
  try {
    const result = await fetchOpenDotaPathResearch('/heroes/54/itemPopularity');
    assert.equal(result.status, 429);
    assert.equal(result.contentType, 'text/plain');
    assert.equal(result.rawPreview?.length, 500);
    assert.equal(result.url, 'https://api.opendota.com/api/heroes/54/itemPopularity');
  } finally {
    global.fetch = original;
  }
});

test('research fetch reports an unexpected successful non-JSON body', async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response('<html>maintenance</html>', {
    status: 200,
    headers: { 'content-type': 'text/html' }
  })) as typeof fetch;
  try {
    const result = await fetchOpenDotaPathResearch('/heroes/54/itemPopularity');
    assert.equal(result.status, 200);
    assert.equal(result.error, 'OpenDota returned invalid JSON');
    assert.equal(result.rawPreview, '<html>maintenance</html>');
  } finally {
    global.fetch = original;
  }
});

test('research fetch sends the API key but redacts it from diagnostics', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENDOTA_API_KEY;
  let requestedUrl = '';
  process.env.OPENDOTA_API_KEY = 'super-secret-key';
  global.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await fetchOpenDotaPathResearch('/heroes/54/itemPopularity');
    assert.match(requestedUrl, /api_key=super-secret-key/);
    assert.doesNotMatch(result.url, /api_key|super-secret-key/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENDOTA_API_KEY;
    else process.env.OPENDOTA_API_KEY = originalKey;
  }
});

test('research fetch redacts the API key from an upstream error body', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENDOTA_API_KEY;
  process.env.OPENDOTA_API_KEY = 'super-secret-key';
  global.fetch = (async () => new Response('denied api_key=super-secret-key', {
    status: 403,
    headers: { 'content-type': 'text/plain' }
  })) as typeof fetch;
  try {
    const result = await fetchOpenDotaPathResearch('/heroes/54/itemPopularity');
    assert.doesNotMatch(result.rawPreview ?? '', /super-secret-key/);
    assert.match(result.rawPreview ?? '', /api_key=\[REDACTED\]/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENDOTA_API_KEY;
    else process.env.OPENDOTA_API_KEY = originalKey;
  }
});

test('research fetch redacts the API key from thrown errors', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENDOTA_API_KEY;
  process.env.OPENDOTA_API_KEY = 'super-secret-key';
  global.fetch = (async () => { throw new Error('request failed for super-secret-key'); }) as typeof fetch;
  try {
    const result = await fetchOpenDotaPathResearch('/heroes/54/itemPopularity');
    assert.doesNotMatch(result.error ?? '', /super-secret-key/);
    assert.match(result.error ?? '', /\[REDACTED\]/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENDOTA_API_KEY;
    else process.env.OPENDOTA_API_KEY = originalKey;
  }
});
