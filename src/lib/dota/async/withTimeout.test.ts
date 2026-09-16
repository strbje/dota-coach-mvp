import assert from 'node:assert/strict';
import test from 'node:test';
import { withTimeout } from './withTimeout';

test('optional enrichment timeout is controlled without waiting for the source', async () => {
  const never = new Promise<never>(() => undefined);
  await assert.rejects(withTimeout(never, 10, 'optional source'), /optional source timed out/);
});
