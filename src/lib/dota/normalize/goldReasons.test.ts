import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoldReasons } from './goldReasons';

test('keeps lane, neutral and objective economy in separate groups', () => {
  const result = normalizeGoldReasons({ 12: 100, 13: 200, 16: 300 }, {
    12: { label: 'Creep Kill', group: 'creeps' },
    13: { label: 'Neutral Kill', group: 'neutral' },
    16: { label: 'Tower Kill', group: 'buildings' }
  });
  assert.deepEqual(result.groups.map(({ group, amount }) => ({ group, amount })), [{ group: 'creeps', amount: 100 }, { group: 'neutral', amount: 200 }, { group: 'buildings', amount: 300 }]);
  assert.equal(result.breakdownComplete, true);
});

test('leaves unconfirmed reason ids unknown without exposing raw ids in labels', () => {
  const result = normalizeGoldReasons({ 0: 10, 6: 20, 21: 30 }, {});
  assert.deepEqual(result.unknownKeys, ['0', '6', '21']);
  assert.equal(result.unknownAmount, 60);
  assert.equal(result.breakdownComplete, false);
  assert.ok(result.decoded.every((entry) => entry.label === 'Unknown reason' && entry.group === 'unknown'));
  assert.deepEqual(result.grouped, [{ group: 'unknown', label: 'Другое / нераспознано', amount: 60 }]);
});

test('treats a constant assigned to the unknown group as product-unknown', () => {
  const result = normalizeGoldReasons({ 21: 75 }, {
    21: { label: 'Unconfirmed', group: 'unknown' }
  });
  assert.deepEqual(result.unknownKeys, ['21']);
  assert.equal(result.unknownAmount, 75);
  assert.equal(result.breakdownComplete, false);
  assert.equal(result.constantsAvailable, false);
});
