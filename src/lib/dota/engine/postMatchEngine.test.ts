import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePostMatch } from './postMatchEngine';
import { toPublicPostMatchError, type PostMatchErrorCode } from '../errors/postMatchError';

// Synthetic transport fixtures exercise the real request, adapter and eligibility path.
// They do not establish the role of the owner's real match.
const matchId = 9000075;
const accountId = 1000075;
const selected = { steamAccountId: accountId, playerSlot: 128, heroId: 42, isRadiant: false };
const match = {
  match_id: matchId, duration: 1200, start_time: 1700000000, radiant_win: false,
  game_mode: 22, lobby_type: 7,
  players: [{ account_id: accountId, player_slot: 128, hero_id: 42, lane_role: 1,
    kills: 1, deaths: 2, assists: 3, times: [0, 300, 600, 900, 1200], lh_t: [0, 20, 40, 60, 80] }]
};
const response = (players: unknown, extra: Record<string, unknown> = {}) => Response.json({ data: { match: { id: matchId, durationSeconds: 1200, players } }, ...extra });

test('post-match preserves role verification failures through the full engine and can recover on retry', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.STRATZ_API_TOKEN;
  let events: () => Response | Promise<Response> = () => response([{ ...selected, position: 'POSITION_1' }]);
  let eventRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes(`/matches/${matchId}`)) return Response.json(match);
    if (url.includes('api.stratz.com')) {
      const request = JSON.parse(String(init?.body));
      if (request.query.includes('query DebugStratzEvents')) {
        eventRequests += 1;
        assert.deepEqual(request.variables, { id: matchId, farmAccountId: accountId, includeFarm: true });
        return events();
      }
    }
    return Response.json({});
  };
  const expectCode = async (code: PostMatchErrorCode, status: number) => {
    await assert.rejects(analyzePostMatch(matchId, { playerSlot: 128 }), (error: unknown) => {
      const publicError = toPublicPostMatchError(error);
      assert.equal(publicError.errorCode, code);
      assert.equal(publicError.status, status);
      assert.doesNotMatch(JSON.stringify(publicError), /synthetic-secret|Bearer|secret-provider-detail/);
      return true;
    });
  };
  try {
    await t.test('no token is not classified as another role and never calls STRATZ', async () => {
      delete process.env.STRATZ_API_TOKEN;
      await expectCode('STRATZ_NOT_CONFIGURED', 503);
      assert.equal(eventRequests, 0);
    });
    process.env.STRATZ_API_TOKEN = 'synthetic-secret';
    for (const status of [401, 403]) await t.test(`HTTP ${status} cannot confirm a role even if the body contains one`, async () => {
      events = () => Response.json({ data: { match: { players: [{ ...selected, position: 'POSITION_1' }] } } }, { status });
      await expectCode('STRATZ_AUTH_FAILED', 503);
    });
    await t.test('HTTP failure remains STRATZ failure', async () => {
      events = () => new Response('secret-provider-detail', { status: 503 });
      await expectCode('STRATZ_UNAVAILABLE', 503);
    });
    await t.test('network failure is not reclassified as OpenDota', async () => {
      events = () => { throw new Error('fetch failed: secret-provider-detail'); };
      await expectCode('STRATZ_UNAVAILABLE', 503);
    });
    await t.test('upstream timeout status is reported as STRATZ timeout', async () => {
      events = () => new Response('upstream timeout', { status: 504 });
      await expectCode('STRATZ_TIMEOUT', 504);
    });
    await t.test('deadline is distinguishable from missing or unsupported role', async () => {
      events = () => new Promise<Response>(() => {});
      await expectCode('STRATZ_TIMEOUT', 504);
    });
    await t.test('malformed JSON and rejected GraphQL query have controlled errors', async () => {
      events = () => new Response('{bad json', { headers: { 'Content-Type': 'application/json' } });
      await expectCode('STRATZ_INVALID_RESPONSE', 502);
      events = () => Response.json({ errors: [{ message: 'secret-provider-detail' }] });
      await expectCode('STRATZ_INVALID_RESPONSE', 502);
    });
    await t.test('no match or no roster means the role is unconfirmed, not another role', async () => {
      events = () => Response.json({ data: { match: null } });
      await expectCode('POST_MATCH_ROLE_UNCONFIRMED', 422);
      events = () => response([]);
      await expectCode('POST_MATCH_ROLE_UNCONFIRMED', 422);
    });
    await t.test('another player cannot supply the role', async () => {
      events = () => response([{ ...selected, steamAccountId: accountId + 1, position: 'POSITION_1' }]);
      await expectCode('STRATZ_PLAYER_MISMATCH', 422);
    });
    await t.test('OpenDota safe lane and hero identity do not bypass role verification', async () => {
      events = () => response([selected]);
      await expectCode('POST_MATCH_ROLE_UNCONFIRMED', 422);
    });
    await t.test('confirmed offlane still blocks the carry report', async () => {
      events = () => response([{ ...selected, position: 'POSITION_3' }]);
      await expectCode('UNSUPPORTED_POST_MATCH_ROLE', 422);
    });
    await t.test('retry with confirmed carry recovers; optional farm GraphQL errors do not erase valid role evidence', async () => {
      events = () => response([{ ...selected, position: 'POSITION_1' }], { errors: [{ message: 'farm unavailable', path: ['match', 'farmPlayers'] }] });
      const result = await analyzePostMatch(matchId, { playerSlot: 128 });
      assert.equal(result.analysis.matchId, matchId);
      assert.equal(result.analysis.training.observation.role, 'carry');
      assert.equal(result.debug.summary.roleDetection.source, 'stratz');
      assert.equal(result.analysis.farmIntervals?.source, 'opendota');
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.STRATZ_API_TOKEN;
    else process.env.STRATZ_API_TOKEN = previousToken;
  }
});
