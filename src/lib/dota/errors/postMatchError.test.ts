import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicPostMatchError, UnsupportedPostMatchRoleError } from './postMatchError';

test('maps known OpenDota failures without exposing the internal chain', () => {
  const cases = [
    ['OpenDota returned empty response body', 'OPENDOTA_INVALID_RESPONSE'],
    ['OpenDota request timed out', 'OPENDOTA_TIMEOUT'],
    ['OpenDota match not found or not parsed', 'OPENDOTA_NOT_FOUND'],
    ['OpenDota rate limit exceeded. Try again later.', 'OPENDOTA_RATE_LIMIT'],
    ['OpenDota service unavailable', 'OPENDOTA_UNAVAILABLE']
  ] as const;
  for (const [message, errorCode] of cases) {
    const result = toPublicPostMatchError(new Error(`Post-match fetch stage failed: ${message}`));
    assert.equal(result.errorCode, errorCode);
    assert.doesNotMatch(result.error, /fetch stage|invalid JSON|rate limit/i);
  }
});

test('maps unexpected errors to a stable generic response', () => {
  assert.deepEqual(toPublicPostMatchError(new Error('secret provider detail')), { errorCode: 'POST_MATCH_FAILED', error: 'Не удалось разобрать матч. Попробуйте ещё раз.', status: 502 });
});

test('maps unsupported or ambiguous roles to a controlled response', () => {
  assert.deepEqual(toPublicPostMatchError(new UnsupportedPostMatchRoleError('unknown')), {
    errorCode: 'UNSUPPORTED_POST_MATCH_ROLE',
    error: 'Пока разбор доступен только для игроков, надёжно определённых как carry.',
    status: 422
  });
});

test('definitive fallback HTTP errors take priority over the initial fetch failure', () => {
  const cases = [
    ['OpenDota match not found or not parsed', 'OPENDOTA_NOT_FOUND'],
    ['OpenDota rate limit exceeded. Try again later.', 'OPENDOTA_RATE_LIMIT'],
    ['OpenDota service unavailable', 'OPENDOTA_UNAVAILABLE']
  ] as const;

  for (const [fallbackMessage, expectedCode] of cases) {
    const error = new Error('OpenDota fetch failed', { cause: new Error(fallbackMessage) });
    assert.equal(toPublicPostMatchError(error).errorCode, expectedCode);
  }
});
