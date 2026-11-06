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
// Target labels come from the existing replay decode; product normalization cannot infer them.
test('real frog and ward events with all flags false remain counted without a guessed category', () => {
  const events = [{"time": 676, "attacker": 42, "npcId": 897, "isCreep": false, "isNeutral": false, "isAncient": false}, {"time": 121, "attacker": 42, "npcId": 111, "isCreep": false, "isNeutral": false, "isAncient": false}];
  const farm = normalizeFarmEvents(events, 2, 2400)!;
  assert.equal(farm.coverage, 'complete');
  assert.equal(farm.events.length, 2);
  assert.deepEqual(farm.events.map((e) => e.category), ['unclassified', 'unclassified']);
});
