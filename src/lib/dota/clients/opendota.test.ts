import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import https from 'node:https';
import { fetchOpenDotaMatch } from './opendota';

function mockHttps(body: string) {
  const original = https.request;
  let calls = 0;
  https.request = ((url: URL, options: unknown, callback: (response: EventEmitter & { statusCode: number }) => void) => {
    calls += 1;
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    request.end = () => { const response = new EventEmitter() as EventEmitter & { statusCode: number }; response.statusCode = 200; callback(response); queueMicrotask(() => { response.emit('data', Buffer.from(body)); response.emit('end'); }); };
    request.destroy = (error) => request.emit('error', error);
    return request;
  }) as unknown as typeof https.request;
  return { calls: () => calls, restore: () => { https.request = original; } };
}

async function withFetch(body: string, status = 200, run: () => Promise<void>) {
  const original = global.fetch;
  global.fetch = (async () => new Response(body, { status })) as typeof fetch;
  try { await run(); } finally { global.fetch = original; }
}

test('invalid JSON invokes the https fallback', async () => {
  const fallback = mockHttps('{"match_id":123}');
  try { await withFetch('<html>', 200, async () => { const result = await fetchOpenDotaMatch(123); assert.equal(result.match_id, 123); assert.equal(fallback.calls(), 1); }); } finally { fallback.restore(); }
});

test('empty response invokes the https fallback', async () => {
  const fallback = mockHttps('{"match_id":124}');
  try { await withFetch('', 200, async () => { await fetchOpenDotaMatch(124); assert.equal(fallback.calls(), 1); }); } finally { fallback.restore(); }
});

test('a second invalid response ends in a controlled error after one fallback', async () => {
  const fallback = mockHttps('not-json');
  try { await withFetch('not-json', 200, async () => { await assert.rejects(fetchOpenDotaMatch(125), /fetch failed and https fallback failed: OpenDota returned invalid JSON payload/); assert.equal(fallback.calls(), 1); }); } finally { fallback.restore(); }
});

test('HTTP 404 does not invoke the fallback', async () => {
  const fallback = mockHttps('{"match_id":126}');
  try { await withFetch('', 404, async () => { await assert.rejects(fetchOpenDotaMatch(126), /match not found/); assert.equal(fallback.calls(), 0); }); } finally { fallback.restore(); }
});

test('a hanging response body aborts with a controlled timeout', async () => {
  const original = global.fetch;
  global.fetch = ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })) as typeof fetch;
  try {
    await assert.rejects(fetchOpenDotaMatch(127, { totalBudgetMs: 20, primaryTimeoutMs: 20 }), /timed out/);
  } finally {
    global.fetch = original;
  }
});

test('https fallback only receives the remaining total budget', async () => {
  const originalFetch = global.fetch;
  const originalRequest = https.request;
  global.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  https.request = (() => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    request.end = () => undefined;
    request.destroy = (error) => request.emit('error', error);
    return request;
  }) as unknown as typeof https.request;
  const started = Date.now();
  try {
    await assert.rejects(fetchOpenDotaMatch(128, { totalBudgetMs: 30, primaryTimeoutMs: 20 }), /fallback failed.*timed out/);
    assert.ok(Date.now() - started < 100, 'fallback must not start a second full timeout budget');
  } finally {
    global.fetch = originalFetch;
    https.request = originalRequest;
  }
});
