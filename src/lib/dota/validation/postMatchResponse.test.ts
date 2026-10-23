import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostMatchSuccessPayload } from './postMatchResponse';

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
});
