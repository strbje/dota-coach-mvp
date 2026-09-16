import { getHeroNameById } from '../data/heroConstants';
import { selectPlayer, type PlayerSelector } from '../selection/playerSelector';
import { normalizeOptionalNumber } from './normalizeOptionalNumber';

export function selectOpenDotaPlayer(players: Array<Record<string, unknown>>, selector: PlayerSelector) {
  return selectPlayer(players, selector, (player) => ({
    accountId: normalizeOptionalNumber(player.account_id),
    playerSlot: normalizeOptionalNumber(player.player_slot),
    heroId: normalizeOptionalNumber(player.hero_id)
  }), 'OpenDota');
}

export function getOpenDotaSelectedPlayerMetadata(player: Record<string, unknown>) {
  const heroId = normalizeOptionalNumber(player.hero_id) ?? 0;
  return {
    accountId: normalizeOptionalNumber(player.account_id),
    playerSlot: normalizeOptionalNumber(player.player_slot),
    heroId,
    heroName: getHeroNameById(heroId) ?? `Hero #${heroId}`,
    role: typeof player.lane_role === 'number' ? `lane_role_${player.lane_role}` : undefined
  };
}
