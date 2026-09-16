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
    analysis: { matchId: 123, hero: 'Lifestealer', grades: {}, finalVerdict: {} },
    debug: {}
  }), true);
});
