import assert from 'node:assert/strict';
import test from 'node:test';
import { alignMinuteSeries, normalizeObjectiveTimeline, normalizeTeamAdvantage } from './matchContext';
import type { OpenDotaMatchResponse } from '../types/providers';

test('shifted and irregular provider clocks preserve actual times, null is not zero', () => {
  const aligned = alignMinuteSeries([5, 10, null, 30], [120, 180, 240, 600], 630)!;
  assert.equal(aligned[0], undefined);
  assert.equal(aligned[2], 5);
  assert.ok(Number.isNaN(aligned[4]));
  assert.equal(aligned[10], 30);
  assert.equal(alignMinuteSeries([1, 2], [600, 600], 700), null);
  assert.equal(alignMinuteSeries([1, 2], [600], 700), null);
  assert.equal(alignMinuteSeries([1], null, 700), null);
});

test('team advantage uses the shared clock and selected side without interpolating missing gold', () => {
  const raw: OpenDotaMatchResponse = { match_id: 1, radiant_win: false, duration: 240, players: [{ times: [120, 180, 240, 300] }], radiant_gold_adv: [0, null, 500, 800], radiant_xp_adv: [0, 200, 300, 400] };
  assert.deepEqual(normalizeTeamAdvantage(raw, false, 240), [
    { timeSeconds: 120, gold: -0, xp: -0 }, { timeSeconds: 180, gold: undefined, xp: -200 }, { timeSeconds: 240, gold: -500, xp: -300 }
  ]);
  assert.deepEqual(normalizeTeamAdvantage({ ...raw, players: [] }, true, 240), []);
  assert.deepEqual(normalizeTeamAdvantage({ ...raw, players: [{ times: [0, 60] }, { times: [60, 120] }] }, true, 240), []);
});

test('unknown objectives, invalid times and unconfirmed killer attribution stay out of product facts', () => {
  const events = normalizeObjectiveTimeline([
    { type: 'building_kill', time: 100, team: 2, key: 'npc_dota_goodguys_tower1_top' },
    { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 120, team: 3 },
    { type: 'SOMETHING_999', time: 150 }, { type: 'building_kill', time: NaN }, { type: 'building_kill', time: 501 }
  ], 500);
  assert.deepEqual(events.map((event) => event.label), ['Разрушено строение Radiant', 'Убит Рошан']);
  assert.doesNotMatch(JSON.stringify(events), /SOMETHING|team|потому|причин/);
});
