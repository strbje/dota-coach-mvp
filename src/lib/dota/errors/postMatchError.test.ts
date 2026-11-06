import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPostMatchRole, PostMatchRoleVerificationError, toPublicPostMatchError, UnsupportedPostMatchRoleError, type RoleVerificationErrorCode } from './postMatchError';
import { detectRole } from '../role/detectRole';
import { getPostMatchErrorCopy } from '../../i18n/uiCopy';
import { PlayerSelectionError } from '../selection/playerSelector';

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

test('maps a confirmed unsupported role to a controlled response', () => {
  assert.deepEqual(toPublicPostMatchError(new UnsupportedPostMatchRoleError('support')), {
    errorCode: 'UNSUPPORTED_POST_MATCH_ROLE',
    error: 'Для выбранного игрока определена другая роль. Сейчас разбор доступен только для керри.',
    status: 422
  });
});

test('missing, failed and inconclusive role verification stay distinct and localized', () => {
  const codes: RoleVerificationErrorCode[] = ['STRATZ_NOT_CONFIGURED', 'STRATZ_AUTH_FAILED', 'STRATZ_TIMEOUT', 'STRATZ_UNAVAILABLE', 'STRATZ_INVALID_RESPONSE', 'STRATZ_PLAYER_MISMATCH', 'POST_MATCH_ROLE_UNCONFIRMED'];
  for (const code of codes) {
    const result = toPublicPostMatchError(new PostMatchRoleVerificationError(code));
    assert.equal(result.errorCode, code);
    assert.equal(getPostMatchErrorCopy('ru', code), result.error);
    assert.notEqual(getPostMatchErrorCopy('en', code), getPostMatchErrorCopy('en', 'POST_MATCH_FAILED'));
    assert.doesNotMatch(result.error, /token|Bearer|query|POSITION|steamAccountId/);
  }
});

test('role errors distinguish unavailable evidence from a confirmed other role without weakening eligibility', () => {
  const selector = { playerSlot: 128, heroId: 42 };
  assert.throws(() => assertPostMatchRole(detectRole({ openDotaLaneRole: 1 }), selector, 'STRATZ_TIMEOUT'), { code: 'STRATZ_TIMEOUT' });
  assert.throws(() => assertPostMatchRole(detectRole({}), selector), { code: 'POST_MATCH_ROLE_UNCONFIRMED' });
  assert.throws(() => assertPostMatchRole(detectRole({ stratzRole: 'CORE', stratzLane: 'MID_LANE' }), selector), { code: 'POST_MATCH_ROLE_UNCONFIRMED' });
  assert.throws(() => assertPostMatchRole(detectRole({ stratzPosition: 'POSITION_3', openDotaLaneRole: 1 }), selector), UnsupportedPostMatchRoleError);
  assert.doesNotThrow(() => assertPostMatchRole(detectRole({ stratzPosition: 'POSITION_1' }), selector));
  assert.doesNotThrow(() => assertPostMatchRole(detectRole({}), { heroId: 54 }, 'STRATZ_NOT_CONFIGURED'));
});

test('maps wrapped player selection failures to a controlled response', () => {
  const error = new Error('Post-match normalize stage failed', {
    cause: new PlayerSelectionError('Selected player was not found in OpenDota payload')
  });
  assert.deepEqual(toPublicPostMatchError(error), {
    errorCode: 'INVALID_PLAYER_SELECTOR',
    error: 'Не удалось однозначно определить выбранного игрока. Выберите игрока ещё раз.',
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
