import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from './route';

test('parse request is explicit, validates input, handles upstream failure and never claims parsed data', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  let response = () => Response.json({ job: { jobId: 12345 } });
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, '/api/request/9000076');
    assert.equal(init?.method, 'POST');
    assert.ok(init?.signal);
    return response();
  };
  const request = (body: string) => POST(new Request('http://localhost/api/post-match/parse', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }));
  try {
    for (const value of ['{', '{}', 'null', JSON.stringify({ matchId: -1 }), JSON.stringify({ matchId: '9000076' }), JSON.stringify({ matchId: 1.1 })]) {
      assert.equal((await request(value)).status, 400);
    }
    assert.equal(calls, 0);
    assert.deepEqual(await (await request('{"matchId":9000076}')).json(), { jobId: '12345' });
    response = () => Response.json({ error: 'secret-provider-detail' }, { status: 429 });
    const limited = await request('{"matchId":9000076}');
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: 'rate_limit' });
    response = () => Response.json({});
    assert.deepEqual(await (await request('{"matchId":9000076}')).json(), { error: 'invalid_response' });
    for (const jobId of ['0', 'invalid', -1, 1.1, null, Number.MAX_SAFE_INTEGER + 1]) {
      response = () => Response.json({ job: { jobId } });
      assert.deepEqual(await (await request('{"matchId":9000076}')).json(), { error: 'invalid_response' });
    }
    response = () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.equal((await request('{"matchId":9000076}')).status, 504);
  } finally { globalThis.fetch = oldFetch; }
});
