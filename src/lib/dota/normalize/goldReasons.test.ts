import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoldReasons } from './goldReasons';
import { getGoldReasonConstants, normalizeGoldReasonConstants } from '../providers/opendotaConstantsProvider';
import { GOLD_REASON_CONTROLS } from './goldReasons.fixture';

const constants = normalizeGoldReasonConstants(null);

for (const control of GOLD_REASON_CONTROLS) {
  test(`independent OpenDota control ${control.matchId}: correct 11–17 meanings, signed death loss and raw preservation`, () => {
    const raw = Object.fromEntries(Object.entries(control.raw).filter(([, value]) => value !== undefined));
    const before = structuredClone(raw);
    const result = normalizeGoldReasons(raw, constants);
    const expected = Object.fromEntries(Object.entries(control.expected).filter(([, value]) => value !== undefined));
    assert.deepEqual(Object.fromEntries(result.groups.map(({ group, amount }) => [group, amount])), expected);
    assert.deepEqual(result.unknownKeys, ['0']);
    assert.equal(result.unknownAmount, raw[0]);
    assert.equal(result.breakdownComplete, false);
    assert.equal(result.groups.find(({ group }) => group === 'roshan')?.label, 'Рошан');
    assert.equal(result.groups.find(({ group }) => group === 'death')?.label, 'Потери при смерти');
    assert.deepEqual(raw, before);
    assert.deepEqual(result.raw, before);
  });
}

test('unavailable constants endpoint uses verified fallback, including buyback, ability gold and wards', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"Not Found"}', { status: 404 });
  try {
    const fallback = await getGoldReasonConstants();
    assert.deepEqual(normalizeGoldReasons({ 1: -55, 2: -500, 6: 2255, 19: 100, 20: 30, 21: 155 }, fallback).groups, [
      { group: 'death', label: 'Потери при смерти', amount: -55 },
      { group: 'buyback', label: 'Выкуп', amount: -500 },
      { group: 'sale', label: 'Продажа предметов', amount: 2255 },
      { group: 'ability', label: 'Способности', amount: 100 },
      { group: 'wards', label: 'Варды', amount: 30 },
      { group: 'courierBonus', label: 'Личная награда за курьера', amount: 155 }
    ]);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await getGoldReasonConstants(), fallback);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider labels cannot reintroduce old mappings or guess unknown IDs from gold/starting keywords', () => {
  const result = normalizeGoldReasons({ 0: 800, 11: 50, 14: 100, 19: 40, 20: 20, 99: 75 }, normalizeGoldReasonConstants({
    0: 'Starting Gold', 11: 'Hero Kill', 14: 'Roshan Kill', 19: 'Buyback', 20: 'Abandon', 99: { label: 'Hero Gold' }
  }));
  assert.deepEqual(result.unknownKeys, ['0', '99']);
  assert.deepEqual(result.groups.map(({ group, amount }) => [group, amount]), [
    ['neutral', 100], ['buildings', 50], ['ability', 40], ['wards', 20]
  ]);
  assert.equal(result.breakdownComplete, false);
});

test('unknown positive and negative sums remain visible even when their net is zero and no mapping is available', () => {
  const result = normalizeGoldReasons({ 98: 100, 99: -100 }, {});
  assert.deepEqual(result.grouped, [
    { group: 'unknown', label: 'Источник не определён', amount: 100 },
    { group: 'unknown', label: 'Причина потерь не определена', amount: -100 }
  ]);
  assert.equal(result.constantsAvailable, false);
  assert.equal(result.breakdownComplete, false);
  assert.equal(result.totalPositiveGold, 100);
  assert.equal(result.totalNegativeGold, 100);
  assert.deepEqual(result.unknownKeys, ['98', '99']);
});

test('opposing values in a known category are not netted either', () => {
  const result = normalizeGoldReasons({ 12: 100, 99: -100 }, {
    ...constants, 99: { label: 'Synthetic correction', group: 'heroes' }
  });
  assert.deepEqual(result.groups.map(({ amount }) => amount), [100, -100]);
});

test('invalid/missing amounts make decoding incomplete, without inventing zeros; confirmed zero survives', () => {
  const raw = { 1: null, 2: undefined, 11: Number.NaN, 12: '100', 13: true, 14: 0, 15: 25, 16: Infinity, 17: {} };
  const result = normalizeGoldReasons(raw, constants);
  assert.deepEqual(result.decoded.map(({ key, amount }) => ({ key, amount })), [{ key: '14', amount: 0 }, { key: '15', amount: 25 }]);
  assert.deepEqual(result.invalidKeys, ['1', '2', '11', '12', '13', '16', '17']);
  assert.deepEqual(result.raw, raw);
  assert.equal(result.breakdownComplete, false);
  assert.deepEqual(normalizeGoldReasons({}, constants).grouped, []);
  assert.equal(normalizeGoldReasons({}, constants).breakdownComplete, false);
  assert.equal(normalizeGoldReasons({ 14: 0 }, constants).breakdownComplete, true);
});
