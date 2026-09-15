import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostMatchErrorCopy, getUiCopy } from './uiCopy';

test('localizes Match ID form copy', () => {
  assert.equal(getUiCopy('ru').postMatch.matchIdHint, 'Числовой ID завершённого матча');
  assert.equal(getUiCopy('en').postMatch.matchIdHint, 'Numeric ID of a completed match');
});

test('localizes every controlled post-match error code', () => {
  assert.equal(getPostMatchErrorCopy('en', 'OPENDOTA_INVALID_RESPONSE'), 'OpenDota returned an invalid response. Please try again in a few seconds.');
  assert.equal(getPostMatchErrorCopy('en', 'OPENDOTA_TIMEOUT'), 'OpenDota is taking too long to respond. Please try again.');
  assert.equal(getPostMatchErrorCopy('en', 'OPENDOTA_NOT_FOUND'), 'The match was not found or has not been processed by OpenDota yet.');
  assert.equal(getPostMatchErrorCopy('en', 'OPENDOTA_RATE_LIMIT'), 'OpenDota has temporarily limited requests. Please try again later.');
  assert.equal(getPostMatchErrorCopy('en', 'OPENDOTA_UNAVAILABLE'), 'OpenDota is temporarily unavailable. Please try again later.');
  assert.equal(getPostMatchErrorCopy('en', 'POST_MATCH_FAILED'), 'Could not review the match. Please try again.');
  assert.equal(getPostMatchErrorCopy('en', 'INVALID_MATCH_ID'), 'Enter a valid Match ID.');
});

test('unknown post-match error codes use locale-specific generic copy', () => {
  assert.equal(getPostMatchErrorCopy('ru', 'UNKNOWN'), 'Не удалось разобрать матч. Попробуйте ещё раз.');
  assert.equal(getPostMatchErrorCopy('en', 'UNKNOWN'), 'Could not review the match. Please try again.');
});
