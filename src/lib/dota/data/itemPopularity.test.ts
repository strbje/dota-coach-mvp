import assert from 'node:assert/strict';
import test from 'node:test';
import { getHeroItemPopularityResearch } from './itemPopularity';
import { getItemKeyById, setItemConstants } from './itemConstants';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

test('research path hydrates a non-fallback item id from remote constants', async () => {
  const original = global.fetch;
  setItemConstants({ itemKeyById: { 7777: 'product_item' }, itemByKey: { product_item: { dname: 'Product Item' } } });
  global.fetch = (async (input) => {
    const url = String(input);
    if (url.includes('/itemPopularity')) return json({ start_game_items: { '9999': 12 } });
    if (url.includes('/constants/item_ids')) return json({ '9999': 'test_item' });
    if (url.includes('/constants/items')) return json({ test_item: { dname: 'Test Item' } });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  try {
    const result = await getHeroItemPopularityResearch(54);
    assert.equal(result.available, true);
    assert.deepEqual(result.topItemsByPhase.start[0], {
      itemId: 9999, key: 'test_item', name: 'Test Item', count: 12
    });
    assert.equal(result.errors, undefined);
    assert.equal(getItemKeyById(7777), 'product_item');
    assert.equal(getItemKeyById(9999), null);
  } finally {
    global.fetch = original;
  }
});

test('research path retains counts and reports a temporary constants failure', async () => {
  const original = global.fetch;
  global.fetch = (async (input) => {
    if (String(input).includes('/itemPopularity')) return json({ start_game_items: { '9998': 4 } });
    return json({ message: 'temporarily unavailable' }, 503);
  }) as typeof fetch;
  try {
    const result = await getHeroItemPopularityResearch(54);
    assert.equal(result.available, true);
    assert.deepEqual(result.topItemsByPhase.start[0], { itemId: 9998, key: undefined, name: undefined, count: 4 });
    assert.match(result.errors?.join(' ') ?? '', /item constants unavailable.*status 503/i);
  } finally {
    global.fetch = original;
  }
});
