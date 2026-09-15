import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePreGameAnalyze } from './handler';

test('unsupported hero or role returns the stable validation error code', async () => {
  for (const input of [
    { hero: 'Sven', role: 'carry' },
    { hero: 'Lifestealer', role: 'mid' }
  ]) {
    const result = await handlePreGameAnalyze(input, async () => ({ plan: true }));
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { errorCode: 'UNSUPPORTED_PRE_GAME_INPUT' });
  }
});

test('internal errors return a stable code without leaking the raw message', async () => {
  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };

  try {
    const result = await handlePreGameAnalyze(
      { hero: 'Lifestealer', role: 'carry' },
      async () => { throw new Error('private upstream failure'); }
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { errorCode: 'PRE_GAME_FAILED' });
    assert.doesNotMatch(JSON.stringify(result.body), /private upstream failure/);
    assert.equal(logged[0]?.[1] instanceof Error, true);
  } finally {
    console.error = originalConsoleError;
  }
});
