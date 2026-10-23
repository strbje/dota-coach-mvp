import { runCarryPostMatchRules, type CarryHeroOverride } from '../roleRules/carryRules';
import { normalizeOpenDotaMatch } from '../../adapters/normalizeOpenDotaMatch';
import type { OpenDotaMatchResponse } from '../../types/providers';
import { setHeroConstants } from '../../data/heroConstants';

/** Entirely synthetic. 9000066 is a fixture ID, not the owner's screenshot match. */
export async function syntheticPostMatch(options: { matchId?: number; lastHitsAt10?: number; accountId?: number; startTime?: number; partial?: boolean; empty?: boolean; lowLane?: boolean; won?: boolean } = {}) {
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
    players: [selected],
    radiant_gold_adv: times.map((_, i) => i < 15 ? i * 170 : i < 20 ? 2550 - (i - 15) * 400 : 550 - (i - 20) * 600),
    radiant_xp_adv: times.map((_, i) => i < 15 ? i * 120 : 1800 - (i - 15) * 470),
    objectives: [{ type: 'building_kill', time: 1120, key: 'npc_dota_badguys_tower1_mid' }, { type: 'building_kill', time: 1440, key: 'npc_dota_goodguys_tower2_mid' }, { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1620 }, { type: 'building_kill', time: 2200, key: 'npc_dota_goodguys_melee_rax_mid' }]
  };
  if (options.partial || options.empty) {
    delete payload.radiant_gold_adv;
    delete payload.radiant_xp_adv;
    delete payload.objectives;
  }
  if (options.empty) payload.players = [{ player_slot: 0, hero_id: 42, isRadiant: true }];
  // Constants must be stubbed by the offline test/capture harness; never call live providers for fixtures.
  const normalized = await normalizeOpenDotaMatch(payload, { playerSlot: 0 });
  normalized.selectedPlayer.role = 'carry';
  const override: CarryHeroOverride = { key: 'synthetic-carry', heroId: 42, heroName: 'Wraith King', position: 'POSITION_1', earlyItemKey: '', timingItemKey: '', getFallbackItemTarget: () => undefined, coreItems: [], suspiciousItems: [], timingItemLateFinding: () => '', timingItemOnTimeFinding: () => '', suspiciousItemFinding: () => '' };
  return { analysis: runCarryPostMatchRules(normalized, undefined, {}, override), debug: { synthetic: true } };
}
