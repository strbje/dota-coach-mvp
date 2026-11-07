import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { earlyDamageValues, normalizeEarlyHeroDamage } from './earlyHeroDamage';
import { normalizeOpenDotaMatch } from '../adapters/normalizeOpenDotaMatch';
import { runCarryPostMatchRules } from '../rules/roleRules/carryRules';
import { lifestealerCarryOverride } from '../rules/heroOverrides/lifestealer';
import type { OpenDotaMatchResponse } from '../types/providers';

const player = () => ({ player_slot: 0, hero_id: 54, lane: 1, times: [0, 300, 600], hero_damage_t: [100, 1100, 3100] });

test('early damage subtracts pregame damage and splits cumulative values, retaining zero', () => {
  assert.deepEqual(earlyDamageValues(player(), 600), { damage: 3000, firstFive: 1000, nextFive: 2000 });
  assert.deepEqual(earlyDamageValues({ ...player(), hero_damage_t: [100, 100, 100] }, 600), { damage: 0, firstFive: 0, nextFive: 0 });
  assert.deepEqual(earlyDamageValues({ ...player(), hero_damage_t: [100, null, 3100] }, 600), { damage: 3000 });
});

test('missing, shifted, short, invalid and decreasing samples never imply zero or lane pressure', () => {
  for (const patch of [
    { hero_damage_t: undefined, hero_damage: 99999 }, { hero_damage_t: [] },
    { hero_damage_t: [0, 200, null] }, { hero_damage_t: [0, 200, 199] },
    { hero_damage_t: [0, -1, 300] }, { hero_damage_t: [0, NaN, 300] }, { hero_damage_t: [0, '200', 300] },
    { times: undefined }, { times: [60, 360, 660] }, { times: [0, 300] }, { times: [0, 300, 300] },
    { hero_damage_t: [null, 200, 300] }, { hero_damage_t: [0, 2.5, 3] }
  ]) assert.deepEqual(earlyDamageValues({ ...player(), ...patch }, 900), {}, JSON.stringify(patch));
  assert.deepEqual(earlyDamageValues(player(), 599), {});
  assert.deepEqual(earlyDamageValues({ ...player(), times: [-60, 0, 300, 600], hero_damage_t: [0, 100, 1100, 3100] }, 600), { damage: 3000, firstFive: 1000, nextFive: 2000 });
});

test('comparison groups the absolute lane, not safelane role, excludes roamers and ambiguous slots', () => {
  const selected = player();
  const players = [selected, { ...player(), player_slot: 1 }, { ...player(), player_slot: 128, lane_role: 3 },
    { ...player(), player_slot: 129, lane: 3, lane_role: 1 }, { ...player(), player_slot: 2, is_roaming: true },
    { ...player(), player_slot: 130 }, { ...player(), player_slot: 130 }];
  const report = normalizeEarlyHeroDamage(players, selected, 600)!;
  assert.deepEqual(report.players.map((p) => [p.playerSlot, p.ally, p.selected]), [[0, true, true], [1, true, false], [128, false, false]]);
  for (const lane of [undefined, null, '1', 4]) {
    const withoutLane = { ...selected, lane };
    assert.equal(normalizeEarlyHeroDamage([withoutLane, ...players.slice(1)], withoutLane, 600)?.players.length, 1);
  }
  const roaming = { ...selected, is_roaming: true };
  assert.equal(normalizeEarlyHeroDamage([roaming, ...players.slice(1)], roaming, 600)?.players.length, 1);
});

test('live OpenDota excerpts reproduce missing Anti-Mage and available WK data, with no score changes', async () => {
  const capture = JSON.parse(readFileSync('docs/evidence/early-damage/opendota-controls.json', 'utf8')) as { matches: Array<{ selectedSlot: number; payload: OpenDotaMatchResponse }> };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({});
  try {
    const [am, wk] = await Promise.all(capture.matches.map(({ selectedSlot, payload }) => normalizeOpenDotaMatch(payload, { playerSlot: selectedSlot })));
    assert.equal(am.openDotaParsed, false);
    assert.equal(am.earlyHeroDamage?.players.find((p) => p.selected)?.damage, undefined);
    assert.equal(am.teamAdvantage?.length, 0);
    assert.equal(am.player?.itemTimings?.length, 0);
    assert.equal(wk.openDotaParsed, true);
    assert.equal(wk.teamAdvantage?.length, 38);
    assert.ok((wk.player?.itemTimings?.length ?? 0) > 0);
    assert.equal(wk.player?.laneReview?.lhAt10, 46);
    assert.deepEqual(earlyDamageValues(capture.matches[1].payload.players!.find((p) => p.player_slot === 130)!, 2227), { damage: 6335, firstFive: 2038, nextFive: 4297 });
    assert.equal(wk.earlyHeroDamage?.players.find((p) => p.selected)?.damage, 6335);
    const before = runCarryPostMatchRules({ ...wk, earlyHeroDamage: undefined }, undefined, {}, lifestealerCarryOverride);
    const after = runCarryPostMatchRules(wk, undefined, {}, lifestealerCarryOverride);
    assert.deepEqual(after.grades, before.grades);
    assert.deepEqual(after.training, before.training);
    assert.deepEqual(after.priorities, before.priorities);
    assert.deepEqual(after.review, before.review);
  } finally { globalThis.fetch = oldFetch; }
});
