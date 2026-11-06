import { runCarryPostMatchRules, type CarryHeroOverride } from '../roleRules/carryRules';
import { normalizeOpenDotaMatch } from '../../adapters/normalizeOpenDotaMatch';
import type { OpenDotaMatchResponse } from '../../types/providers';
import { setHeroConstants } from '../../data/heroConstants';
import { normalizeFarmEvents } from '../../normalize/farmEvents';

/** Entirely synthetic. 9000066 is a fixture ID, not the owner's screenshot match. */
export async function syntheticPostMatch(options: { matchId?: number; lastHitsAt10?: number; accountId?: number; startTime?: number; partial?: boolean; empty?: boolean; lowLane?: boolean; won?: boolean; temporal?: boolean; product?: boolean; resources?: 'gold' | 'xp'; farmTargets?: boolean; farm?: 'complete' | 'partial' | 'partialOnly' | 'gap' } = {}) {
  setHeroConstants({ heroKeyById: { 42: 'skeleton_king' }, heroNameByKey: { skeleton_king: 'Wraith King' } });
  const times = Array.from({ length: 39 }, (_, minute) => minute * 60);
  const lhAt10 = options.lastHitsAt10 ?? 51;
  const selected = {
    player_slot: 0, hero_id: 42, account_id: options.accountId ?? 1000066, isRadiant: true, lane_role: 1,
    kills: 8, assists: 11, deaths: 5, last_hits: 282, hero_damage: 34616, tower_damage: 3000,
    gold_per_min: 561, xp_per_min: 620, lane_efficiency_pct: options.lowLane ? 48 : 70,
    times, lh_t: times.map((_, i) => i <= 10 ? Math.floor(lhAt10 * i / 10) : lhAt10 + (i - 10) * 8),
    gold_t: times.map((_, i) => i * 540), xp_t: times.map((_, i) => i * 620),
    death_log: [{ time: 410 }, { time: 1390 }, { time: 1850 }, { time: 2010 }, { time: 2225 }],
    purchase_log: [{ key: 'phase_boots', time: 331 }, { key: 'radiance', time: 866 }, { key: 'black_king_bar', time: 1405 }, { key: 'assault', time: 1902 }]
  };
  const payload: OpenDotaMatchResponse = {
    match_id: options.matchId ?? 9000066, duration: 2314, radiant_win: options.won ?? false, start_time: options.startTime ?? 1792666800, game_mode: 22, lobby_type: 7,
    od_data: { has_parsed: !options.product },
    players: [selected],
    radiant_gold_adv: times.map((_, i) => i < 15 ? i * 170 : i < 20 ? 2550 - (i - 15) * 400 : 550 - (i - 20) * 600),
    radiant_xp_adv: times.map((_, i) => i < 15 ? i * 120 : 1800 - (i - 15) * 470),
    objectives: [{ type: 'building_kill', time: 1120, key: 'npc_dota_badguys_tower1_mid' }, { type: 'building_kill', time: 1440, key: 'npc_dota_goodguys_tower2_mid' }, { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1620 }, { type: 'building_kill', time: 2200, key: 'npc_dota_goodguys_melee_rax_mid' }]
  };
  if (options.temporal) {
    payload.radiant_gold_adv = times.map((_, i) => [0, 100, NaN, 300][i] ?? NaN);
    payload.radiant_xp_adv = times.map((_, i) => [0, 150, 230, 400][i] ?? NaN);
    selected.purchase_log[0].time = -30;
    if (Array.isArray(payload.objectives)) payload.objectives.push({ type: 'building_kill', time: 1405, key: 'npc_dota_badguys_tower2_top' });
  }
  if (options.partial || options.empty) {
    delete payload.radiant_gold_adv;
    delete payload.radiant_xp_adv;
    delete payload.objectives;
  }
  if (options.empty) payload.players = [{ player_slot: 0, hero_id: 42, isRadiant: true }];
  if (options.resources === 'gold') delete payload.radiant_xp_adv;
  if (options.resources === 'xp') delete payload.radiant_gold_adv;
  if (options.farm === 'gap') selected.lh_t[23] = NaN;
  // Constants must be stubbed by the offline test/capture harness; never call live providers for fixtures.
  const normalized = await normalizeOpenDotaMatch(payload, { playerSlot: 0 });
  normalized.selectedPlayer.role = 'carry';
  if (options.farm === 'partialOnly') delete normalized.player!.lastHitsByMinute;
  const syntheticEvents = [25, 26, 40, 45, 15, 0, 20, 9].flatMap((count, window) => Array.from({ length: count }, (_, i) => ({
    time: window * 300 + 10 + Math.floor(i * (Math.min(300, 2314 - window * 300) - 20) / count),
    isCreep: i % 4 === 0, isNeutral: i % 4 === 1, isAncient: i % 4 === 2,
    npcId: options.farmTargets && i % 4 === 3 ? [111, 265, 863, 21, 133, 861, 9999][Math.floor(i / 4) % 7] : undefined
  })));
  const farmEvents = options.farm && options.farm !== 'gap'
    ? normalizeFarmEvents(options.farm === 'complete' ? syntheticEvents : syntheticEvents.slice(0, -2), syntheticEvents.length, 2314, options.farmTargets ? 190 : undefined)
    : undefined;
  if (options.product) {
    delete normalized.player!.economyCheckpoints;
    delete normalized.player!.economyByPhase;
    delete normalized.player!.lastHitsByMinute;
    normalized.player!.laneReview = { source: 'opendota', deathsBefore10: 0 };
    normalized.player!.itemTimings = [];
  }
  const benchmarks = options.product ? { heroBenchmarks: { available: true, metrics: {
    gold_per_min: [{ percentile: 40, value: 500 }, { percentile: 50, value: 600 }],
    last_hits_per_min: [{ percentile: 95, value: 7 }, { percentile: 99, value: 12 }],
    hero_damage_per_min: [{ percentile: 30, value: 800 }, { percentile: 40, value: 1000 }]
  } } } : {};
  const override: CarryHeroOverride = { key: 'synthetic-carry', heroId: 42, heroName: 'Wraith King', position: 'POSITION_1', earlyItemKey: '', timingItemKey: '', getFallbackItemTarget: () => undefined, coreItems: [], suspiciousItems: [], timingItemLateFinding: () => '', timingItemOnTimeFinding: () => '', suspiciousItemFinding: () => '' };
  return { analysis: runCarryPostMatchRules(normalized, farmEvents ? { farmEvents } : undefined, benchmarks, override), debug: { synthetic: true } };
}
