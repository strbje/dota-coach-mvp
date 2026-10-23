import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenDotaHttpError } from '../providers/opendotaProvider';
import { OpenDotaSource, SourceError } from './source';

test('source deduplicates concurrent reads and bounds provider concurrency at two', async () => {
  let count = 0; let active = 0; let peak = 0;
  const source = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { count++; active++; peak = Math.max(peak, active); await delay(15); active--; return { ok: true }; } });
  const results = await Promise.all(['/a', '/a', '/b', '/c', '/d'].map((path) => source.get(path, Date.now() + 1000)));
  assert.equal(count, 4); assert.equal(peak, 2); assert.equal(results[0], results[1]);
  await source.get('/a', Date.now() + 1000); assert.equal(count, 4);
});

test('resource TTL expires, entries are bounded, and timestamps are preserved on a cache hit', async () => {
  let calls = 0;
  const source = new OpenDotaSource({ spacingMs: 0, ttlMs: 2000, maxEntries: 1, fetcher: async () => ++calls });
  const first = await source.get('/a', Date.now() + 1000);
  assert.deepEqual(await source.get('/a', Date.now() + 1000), first); assert.equal(calls, 1);
  await source.get('/b', Date.now() + 1000); await source.get('/a', Date.now() + 1000); assert.equal(calls, 3);
  await delay(2100);
  await source.get('/a', Date.now() + 1000); assert.equal(calls, 4);
});

test('cancelling one subscriber cannot poison another subscriber to the same request', async () => {
  let calls = 0;
  const source = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { calls++; await delay(30); return 'ok'; } });
  const abort = new AbortController();
  const first = source.get('/shared', Date.now() + 1000, abort.signal);
  const second = source.get('/shared', Date.now() + 1000);
  abort.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal((await second).value, 'ok'); assert.equal(calls, 1);
});

test('429 establishes cooldown without retrying or holding a long HTTP request', async () => {
  let calls = 0;
  const source = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { calls++; throw new OpenDotaHttpError(429, 120); } });
  for (const path of ['/a', '/b']) await assert.rejects(source.get(path, Date.now() + 1000), (error: unknown) => error instanceof SourceError && error.code === 'rate_limit' && error.retryAfter === 120);
  assert.equal(calls, 1);
});

test('transient failures retry once, permanent errors do not retry', async () => {
  let calls = 0;
  const source = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { if (!calls++) throw new OpenDotaHttpError(503); return true; } });
  assert.equal((await source.get('/retry', Date.now() + 2000)).value, true); assert.equal(calls, 2);
  calls = 0;
  const broken = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { calls++; throw new OpenDotaHttpError(500); } });
  await assert.rejects(broken.get('/fail', Date.now() + 2000), { code: 'provider_error' }); assert.equal(calls, 2);
  calls = 0;
  const missing = new OpenDotaSource({ spacingMs: 0, fetcher: async () => { calls++; throw new OpenDotaHttpError(404); } });
  await assert.rejects(missing.get('/missing', Date.now() + 2000), { code: 'provider_error' }); assert.equal(calls, 1);
});

test('queued work expires without starting after its deadline and requests respect spacing', async () => {
  const starts: number[] = [];
  const source = new OpenDotaSource({ spacingMs: 40, fetcher: async () => { starts.push(Date.now()); return true; } });
  await source.get('/first', Date.now() + 500);
  await assert.rejects(source.get('/expired', Date.now() + 5), { code: 'timeout' });
  await source.get('/last', Date.now() + 500);
  assert.equal(starts.length, 2); assert.ok(starts[1] - starts[0] >= 35);
});
