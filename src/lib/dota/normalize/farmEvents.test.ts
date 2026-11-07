import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFarmEvents } from './farmEvents';

const lane = { time: 60, isCreep: true, isNeutral: false, isAncient: false };

test('same-time and controlled-unit last hits are retained as separate player-attributed events', () => {
  const result = normalizeFarmEvents([lane, lane, { ...lane, attacker: 179, isFromIllusion: true }], 3, 600)!;
  assert.equal(result.coverage, 'complete');
  assert.equal(result.events.length, 3);
  assert.ok(result.events.every((event) => event.category === 'lane'));
});

test('only explicit exclusive flags classify last hits; unknown, overlap and missing flags remain separate', () => {
  const result = normalizeFarmEvents([
    lane, { ...lane, isCreep: false, isNeutral: true }, { ...lane, isCreep: false, isAncient: true },
    { ...lane, isCreep: false }, { ...lane, isCreep: null }, { ...lane, isNeutral: true },
    { time: 60, isAncient: true }, { ...lane, isCreep: false, isNeutral: true, isAncient: true }
  ], 8, 600)!;
  assert.deepEqual(result.events.map((event) => event.category), ['lane', 'neutral', 'ancient', 'unclassified', 'unclassified', 'unclassified', 'unclassified', 'unclassified']);
});

test('missing playback is not confirmed zero and incomplete counts cannot establish full coverage', () => {
  assert.equal(normalizeFarmEvents(null, 0, 600), undefined);
  assert.equal(normalizeFarmEvents([], 0, 600)?.coverage, 'complete');
  for (const total of [undefined, null, '0', 2, -1, 1.2]) assert.equal(normalizeFarmEvents([], total, 600)?.coverage, 'partial');
  assert.equal(normalizeFarmEvents([lane, lane], 1, 600)?.coverage, 'partial');
  assert.equal(normalizeFarmEvents([], 0, undefined)?.coverage, 'partial');
});

test('invalid/out-of-match times prevent completeness even if valid count matches the reported total', () => {
  const result = normalizeFarmEvents([lane, null, {}, { time: -1 }, { time: 601 }, { time: NaN }, { time: '60' }], 1, 600)!;
  assert.equal(result.rejectedEvents, 6);
  assert.equal(result.events.length, 1);
  assert.equal(result.coverage, 'partial');
});

// Minimal excerpts from the owner's saved real response, capture SHA256
// 2e8b153a247b862d8f713c41e069891fe0c25627b4be06226c0eed2ba79501b0.
// Without the verified game version these IDs must not be used for classification.
test('real frog and ward events without a verified version remain counted without a guessed category', () => {
  const events = [{"time": 676, "attacker": 42, "npcId": 897, "isCreep": false, "isNeutral": false, "isAncient": false}, {"time": 121, "attacker": 42, "npcId": 111, "isCreep": false, "isNeutral": false, "isAncient": false}];
  const farm = normalizeFarmEvents(events, 2, 2400)!;
  assert.equal(farm.coverage, 'complete');
  assert.equal(farm.events.length, 2);
  assert.deepEqual(farm.events.map((e) => e.category), ['unclassified', 'unclassified']);
});

const unflagged = { time: 60, isCreep: false, isNeutral: false, isAncient: false };

test('verified version separates ordinary/ancient frogs, named other targets and unknown IDs', () => {
  const farm = normalizeFarmEvents([897, 898, 863, 265, 111, 133, 861, 21, 9999]
    .map((npcId) => ({ ...unflagged, npcId })), 9, 600, 190)!;
  assert.equal(farm.coverage, 'complete');
  assert.deepEqual(farm.events.map((e) => e.category), ['neutral', 'ancient', 'other', 'other', 'other', 'other', 'other', 'other', 'unclassified']);
  assert.deepEqual(farm.events.map((e) => e.target?.kind), [undefined, undefined, 'summon', 'summon', 'ward', 'roshan', 'tormentor', 'building', undefined]);
  assert.equal(farm.events[2].target?.label, 'Бесы Warlock');
  assert.equal(farm.events[3].target?.label, 'Скелеты Clinkz');
});

test('unverified versions and invalid IDs do not borrow the verified dictionary', () => {
  for (const version of [undefined, null, 189, 191, '190', 190.1]) {
    assert.equal(normalizeFarmEvents([{ ...unflagged, npcId: 111 }], 1, 600, version)?.events[0].category, 'unclassified');
  }
  for (const npcId of [undefined, null, '111', 111.1, -1, NaN]) {
    assert.equal(normalizeFarmEvents([{ ...unflagged, npcId }], 1, 600, 190)?.events[0].category, 'unclassified');
  }
});

test('verified IDs never conceal missing, overlapping or contradictory flags', () => {
  const farm = normalizeFarmEvents([
    { ...unflagged, npcId: 111, isCreep: undefined }, { ...lane, npcId: 111 },
    { ...lane, npcId: 897 }, { ...unflagged, npcId: 898, isNeutral: true, isAncient: true },
    { ...unflagged, npcId: 897, isNeutral: true }
  ], 5, 600, 190)!;
  assert.deepEqual(farm.events.map((e) => e.category), ['unclassified', 'unclassified', 'unclassified', 'unclassified', 'neutral']);
  assert.ok(farm.events.every((e) => e.target === undefined));
});

test('target identity, not the attacking summon, determines the category without deduplication', () => {
  const events = [{ ...lane, npcId: 3, attacker: 265 }, { ...unflagged, npcId: 265, attacker: 42 },
    { ...unflagged, npcId: 265, attacker: 42, isFromIllusion: true }];
  const farm = normalizeFarmEvents(events, 3, 600, 190)!;
  assert.equal(farm.coverage, 'complete');
  assert.deepEqual(farm.events.map((e) => e.category), ['lane', 'other', 'other']);
});
