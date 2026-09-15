import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItemPopularity } from './normalizeBenchmarks';

test('normalizes OpenDota itemPopularity wire phase keys', () => {
  const result = normalizeItemPopularity(54, {
    start_game_items: { '50': 12 },
    early_game_items: { '135': 25 },
    mid_game_items: { '116': 18 },
    late_game_items: { '156': 7 }
  });

  assert.equal(result.available, true);
  assert.deepEqual(result.topItemsByPhase.start[0], { itemId: 50, key: 'phase_boots', name: 'Phase Boots', count: 12 });
  assert.deepEqual(result.topItemsByPhase.early[0], { itemId: 135, key: 'armlet', name: 'Armlet', count: 25 });
  assert.equal(result.topItemsByPhase.mid[0].key, 'black_king_bar');
  assert.equal(result.topItemsByPhase.late[0].key, 'satanic');
});

test('explains a valid but empty itemPopularity response', () => {
  const result = normalizeItemPopularity(54, {
    start_game_items: {}, early_game_items: {}, mid_game_items: {}, late_game_items: {}
  });
  assert.equal(result.available, false);
  assert.match(result.errors?.[0] ?? '', /no item counts/);
});

test('rejects malformed counts instead of turning them into available zero-count rows', () => {
  const result = normalizeItemPopularity(54, {
    start_game_items: { '50': '12', '135': Number.NaN, '116': Number.POSITIVE_INFINITY, '156': -1 }
  });
  assert.equal(result.available, false);
  assert.deepEqual(result.topItemsByPhase.start, []);
  assert.match(result.errors?.[0] ?? '', /no item counts/);
});
