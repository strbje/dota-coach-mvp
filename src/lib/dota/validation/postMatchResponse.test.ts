import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostMatchSuccessPayload } from './postMatchResponse';
import { buildFarmIntervals } from '../analyze/farmIntervals';
import { normalizeFarmEvents } from '../normalize/farmEvents';

test('a successful response without analysis is rejected at the product boundary', () => {
  assert.equal(isPostMatchSuccessPayload({ debug: {} }), false);
  assert.equal(isPostMatchSuccessPayload({ analysis: null, debug: {} }), false);
  assert.equal(isPostMatchSuccessPayload({ analysis: {}, debug: {} }), false);
});

test('a response with analysis is accepted', () => {
  assert.equal(isPostMatchSuccessPayload({
    analysis: { matchId: 123, hero: 'Lifestealer', durationSeconds: 2400, grades: {}, finalVerdict: {}, priorities: [], itemTimings: [],
      review: { headline: 'Победа', summary: 'Разбор', factors: [], strengths: [], timeline: [], advantage: [] },
      training: { observation: { matchId: 123, heroId: 54, role: 'carry', durationSeconds: 2400 } } },
    debug: {}
  }), true);
});

test('malformed report sections are rejected before the UI consumes them', () => {
  const analysis = { matchId: 123, hero: 'Test', durationSeconds: 2400, grades: {}, finalVerdict: {}, priorities: [], itemTimings: [],
    review: { headline: 'Победа', summary: 'Разбор', factors: [], strengths: [], timeline: [], advantage: [] },
    training: { observation: { matchId: 123, heroId: 54, role: 'carry', durationSeconds: 2400 } } };
  for (const patch of [{ timeline: [null] }, { factors: [{}] }, { strengths: [42] }, { advantage: [{ timeSeconds: 0, gold: '10' }] }]) {
    assert.equal(isPostMatchSuccessPayload({ analysis: { ...analysis, review: { ...analysis.review, ...patch } } }), false);
  }
  assert.equal(isPostMatchSuccessPayload({ analysis: { ...analysis, training: { observation: { ...analysis.training.observation, matchId: 456 } } } }), false);
  assert.equal(isPostMatchSuccessPayload({ analysis: { ...analysis, priorities: [null] } }), false);
  for (const laneFacts of [null, { deathsAt10: '0' }, { deathsAt10: -1 }, { efficiencyPct: NaN }, { efficiencyPct: {} }]) {
    assert.equal(isPostMatchSuccessPayload({ analysis: { ...analysis, laneFacts } }), false);
  }
  for (const laneFacts of [{}, { deathsAt10: 0, efficiencyPct: 70 }]) {
    assert.equal(isPostMatchSuccessPayload({ analysis: { ...analysis, laneFacts } }), true);
  }
});

test('farm payload rejects unsafe coverage, counts and highlight indices before rendering', () => {
  const analysis = { matchId: 123, hero: 'Test', durationSeconds: 600, grades: {}, finalVerdict: {}, priorities: [], itemTimings: [],
    review: { headline: '', summary: '', factors: [], strengths: [], timeline: [], advantage: [] },
    training: { observation: { matchId: 123, heroId: 54, role: 'carry', durationSeconds: 600 } } };
  const farm = buildFarmIntervals(600, [0, 10, 20, 30, 40, 50, 51, 52, 53, 54, 55]);
  const accept = (farmIntervals: unknown) => isPostMatchSuccessPayload({ analysis: { ...analysis, farmIntervals } });
  assert.equal(accept(farm), true);
  assert.equal(accept(buildFarmIntervals(600)), true);
  for (const farmIntervals of [null, {}, { ...farm, intervals: [null] }, { ...farm, highlightIndex: -1 }, { ...farm, highlightIndex: 0 },
    { ...farm, highlightIndex: 2 }, { ...farm, receivedEvents: -1 }, { ...farm, source: 'guess' },
    { ...farm, source: 'stratz', eventCoverage: 'complete', reportedLastHits: undefined },
    { ...farm, intervals: [{ ...farm.intervals[0], perMinute: null }] },
    { ...farm, highlightIndex: undefined, intervals: [{ ...farm.intervals[0], breakdown: { lane: '5' } }] }]) assert.equal(accept(farmIntervals), false);
  const targets = buildFarmIntervals(600, undefined, normalizeFarmEvents([
    { time: 60, npcId: 111, isCreep: false, isNeutral: false, isAncient: false }
  ], 1, 600, 190));
  assert.equal(accept(targets), true);
  const target = targets.intervals[0].otherTargets![0];
  for (const otherTargets of [null, {}, [null], [target, target], [{ ...target, count: 2 }],
    [{ ...target, count: -1 }], [{ ...target, count: '1' }], [{ ...target, npcId: 1.2 }],
    [{ ...target, kind: 'guess' }], [{ ...target, label: null }], [{ ...target, label: '' }]]) {
    assert.equal(accept({ ...targets, intervals: [{ ...targets.intervals[0], otherTargets }, targets.intervals[1]] }), false);
  }
});

test('early damage rejects malformed players, wrong identity, missing endpoints and inconsistent split', () => {
  const analysis = { matchId: 123, hero: 'Test', durationSeconds: 600, grades: {}, finalVerdict: {}, priorities: [], itemTimings: [],
    review: { headline: '', summary: '', factors: [], strengths: [], timeline: [], advantage: [] },
    training: { observation: { matchId: 123, heroId: 54, role: 'carry', durationSeconds: 600 } } };
  const row = { playerSlot: 0, heroId: 54, hero: 'Lifestealer', selected: true, ally: true, damage: 300, firstFive: 100, nextFive: 200 };
  const accept = (earlyHeroDamage: unknown) => isPostMatchSuccessPayload({ analysis: { ...analysis, earlyHeroDamage } });
  assert.equal(accept({ source: 'opendota', lane: 1, players: [row] }), true);
  assert.equal(accept({ source: 'opendota', players: [{ ...row, damage: 0, firstFive: 0, nextFive: 0 }] }), true);
  for (const patch of [{ damage: undefined }, { damage: -1 }, { firstFive: 20 }, { nextFive: undefined }, { heroId: 1 }, { selected: false }, { heroKey: {} }, { playerSlot: 5 }]) {
    assert.equal(accept({ source: 'opendota', players: [{ ...row, ...patch }] }), false);
  }
  for (const players of [null, [], [null], [row, row]]) assert.equal(accept({ source: 'opendota', players }), false);
});
