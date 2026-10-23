import assert from 'node:assert/strict';
import test from 'node:test';
import { setHeroConstants } from '../data/heroConstants';
import { getOpenDotaSelectedPlayerMetadata, selectOpenDotaPlayer } from './selectOpenDotaPlayer';
import { normalizeOpenDotaMatch } from './normalizeOpenDotaMatch';
import { handleDebugMatch } from '../debugMatchHandler';
import type { OpenDotaMatchResponse } from '../types/providers';
import { GOLD_REASON_CONTROLS } from '../normalize/goldReasons.fixture';
import { getGoldReasonConstants } from '../providers/opendotaConstantsProvider';
import type { PlayerSelector } from '../selection/playerSelector';

const players = [
  { account_id: 101, player_slot: 0, hero_id: 54 },
  { account_id: 202, player_slot: 1, hero_id: 1 }
];

test('selects the primary OpenDota player by accountId', () => {
  assert.equal(selectOpenDotaPlayer(players, { accountId: 202 }).hero_id, 1);
});

test('selects the primary OpenDota player by playerSlot', () => {
  assert.equal(selectOpenDotaPlayer(players, { playerSlot: 0 }).account_id, 101);
});

test('rejects missing and ambiguous primary OpenDota selections', () => {
  assert.throws(() => selectOpenDotaPlayer(players, { accountId: 999 }), { name: 'PlayerSelectionError' });
  assert.throws(
    () => selectOpenDotaPlayer([...players, { account_id: 303, player_slot: 2, hero_id: 1 }], { heroId: 1 }),
    { name: 'PlayerSelectionError' }
  );
});

test('normalizes selected hero metadata through the constants registry', () => {
  setHeroConstants({
    heroKeyById: { 1: 'antimage', 54: 'life_stealer' },
    heroNameByKey: { antimage: 'Anti-Mage', life_stealer: 'Lifestealer' }
  });
  assert.deepEqual(getOpenDotaSelectedPlayerMetadata(players[1]), {
    accountId: 202, playerSlot: 1, heroId: 1, heroName: 'Anti-Mage', role: undefined
  });
});

function economyPayload(player: Record<string, unknown>): OpenDotaMatchResponse {
  return { match_id: 123, radiant_win: true, duration: 40 * 60, players: [{ player_slot: 0, hero_id: 54, isRadiant: true, ...player }] };
}

test('adapter derives full, partial and unavailable economy states from usable phase intervals', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const values = Array.from({ length: 26 }, (_, minute) => minute * 10);
    const full = await normalizeOpenDotaMatch(economyPayload({ gold_t: values, lh_t: values, xp_t: values }), { playerSlot: 0 });
    assert.equal(full.player?.economyByPhaseSource, 'gold_t/lh_t');
    assert.equal(full.player?.economyByPhase?.midGame?.endMinute, 25);

    const partial = await normalizeOpenDotaMatch(economyPayload({ lh_t: values }), { playerSlot: 0 });
    assert.equal(partial.player?.economyByPhaseSource, 'partial');
    assert.equal(partial.player?.economyByPhase?.midGame?.lhDelta, 50);

    const unavailable = await normalizeOpenDotaMatch(economyPayload({ gold_t: [0, Number.NaN], lh_t: [undefined, null], xp_t: [] }), { playerSlot: 0 });
    assert.equal(unavailable.player?.economyByPhaseSource, 'unavailable');
    assert.equal(unavailable.player?.economyByPhase, undefined);
    assert.equal(unavailable.player?.economyCheckpoints, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('explicit sample times govern the 10-minute goal and missing totals stay unknown', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const payload = economyPayload({ times: [120, 180, 600, 660], lh_t: [8, 15, 51, 60], lane_efficiency_pct: 70 });
    const result = await normalizeOpenDotaMatch(payload, { playerSlot: 0 });
    assert.equal(result.player?.laneReview?.lhAt10, 51);
    assert.equal(result.player?.laneReview?.laneEfficiencyPct, undefined);
    assert.equal(result.player?.economyCheckpoints?.find((p) => p.minute === 10)?.cs, 51);
    assert.equal(result.player?.deaths, undefined);
    assert.equal(result.player?.gpm, undefined);
    assert.equal(result.player?.heroDamage, undefined);
    assert.equal(result.player?.lastHitsPerMin, undefined);
    const truncated = await normalizeOpenDotaMatch(economyPayload({ times: [120, 180], lh_t: [8, 15, 60] }), { playerSlot: 0 });
    assert.equal(truncated.player?.laneReview?.lhAt10, undefined);
    const dire = await normalizeOpenDotaMatch({ ...payload, players: [{ hero_id: 54, player_slot: 128 }] }, { playerSlot: 128 });
    assert.equal(dire.player?.isRadiant, false);
  } finally { globalThis.fetch = originalFetch; }
});

async function runDebug(url: string, id = '123') {
  const selectors: PlayerSelector[] = [];
  const response = await handleDebugMatch(new Request(url), { params: Promise.resolve({ id }) }, {
    fetchMatch: async () => economyPayload({ gold_reasons: { 13: 10 } }),
    normalizeMatch: async (_payload, selector) => {
      selectors.push(selector);
      return { matchId: 123, didRadiantWin: true, durationSeconds: 0, selectedPlayer: { heroId: 54, heroName: 'Lifestealer' } };
    },
    getConstants: async () => ({ 13: { id: 13, key: 'creep_kill', label: 'Creep Kill', group: 'creeps' } })
  });
  return { response, body: await response.json() as Record<string, unknown>, selectors };
}

test('debug handler preserves slot zero and validates combined selectors together', async () => {
  const slotZero = await runDebug('http://localhost/api/debug/match/123?playerSlot=0');
  assert.equal(slotZero.response.status, 200);
  assert.deepEqual(slotZero.selectors, [{ playerSlot: 0 }]);

  const combined = await runDebug('http://localhost/api/debug/match/123?playerSlot=0&heroId=54');
  assert.equal(combined.response.status, 200);
  assert.deepEqual(combined.selectors, [{ playerSlot: 0, heroId: 54 }]);
});

test('debug handler rejects empty selectors and invalid match ids without applying fallback', async () => {
  for (const url of [
    'http://localhost/api/debug/match/123?playerSlot=',
    'http://localhost/api/debug/match/123?heroId=%20%20',
    'http://localhost/api/debug/match/123?playerSlot=&heroId=54',
    'http://localhost/api/debug/match/123?playerSlot=0&heroId=%20%20'
  ]) {
    const result = await runDebug(url);
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.selectors, []);
  }
  for (const id of ['0', '-1', '1.5', '9007199254740992', ' ']) {
    assert.equal((await runDebug('http://localhost/api/debug/match/123', id)).response.status, 400);
  }
  const fallback = await runDebug('http://localhost/api/debug/match/123');
  assert.deepEqual(fallback.selectors, [{ heroId: 54 }]);
});


test('debug and product adapter preserve the selected control player and independently expected gold categories', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"Not Found"}', { status: 404 });
  try {
    for (const control of GOLD_REASON_CONTROLS) {
      // Synthetic envelope around the anonymous live gold excerpt; no role claim.
      const payload = economyPayload({});
      payload.match_id = control.matchId;
      payload.players = [
        { player_slot: 4, hero_id: 1, gold_reasons: { 12: 999999 } },
        { player_slot: control.playerSlot, hero_id: control.heroId, gold_reasons: control.raw }
      ];
      const response = await handleDebugMatch(new Request(`http://localhost/api/debug/match/${control.matchId}?playerSlot=${control.playerSlot}`), { params: Promise.resolve({ id: String(control.matchId) }) }, {
        fetchMatch: async () => payload, normalizeMatch: normalizeOpenDotaMatch, getConstants: getGoldReasonConstants
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.normalized.selectedPlayer.playerSlot, control.playerSlot);
      assert.equal(body.normalized.selectedPlayer.heroId, control.heroId);
      assert.deepEqual(body.goldReasonsDebug, body.normalized.player.goldReasons);
      assert.deepEqual(Object.fromEntries(body.goldReasonsDebug.groups.map((entry: { group: string; amount: number }) => [entry.group, entry.amount])),
        Object.fromEntries(Object.entries(control.expected).filter(([, value]) => value !== undefined)));
    }
  } finally { globalThis.fetch = originalFetch; }
});
