import { getHeroNameById } from '../data/heroConstants';
import { normalizeOptionalNumber } from '../adapters/normalizeOptionalNumber';
import type { OpenDotaMatchResponse } from '../types/providers';

export type MatchPlayerOption = {
  playerSlot: number;
  heroId: number;
  heroName: string;
  playerName?: string;
  accountId?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  isRadiant: boolean;
};

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const normalized = normalizeOptionalNumber(value);
  return normalized !== undefined && Number.isInteger(normalized) && normalized >= 0 ? normalized : undefined;
}

export function getMatchPlayerOptions(payload: OpenDotaMatchResponse): MatchPlayerOption[] {
  return (payload.players ?? []).flatMap((raw) => {
    const playerSlot = optionalNonNegativeInteger(raw.player_slot);
    const heroId = optionalNonNegativeInteger(raw.hero_id);
    const validPlayerSlot = playerSlot !== undefined && (playerSlot <= 4 || (playerSlot >= 128 && playerSlot <= 132));
    if (!validPlayerSlot || heroId === undefined || heroId === 0) return [];

    const accountId = optionalNonNegativeInteger(raw.account_id);
    const playerName = [raw.personaname, raw.name].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    const kills = optionalNonNegativeInteger(raw.kills);
    const deaths = optionalNonNegativeInteger(raw.deaths);
    const assists = optionalNonNegativeInteger(raw.assists);
    return [{
      playerSlot,
      heroId,
      heroName: getHeroNameById(heroId) ?? `Hero #${heroId}`,
      ...(playerName ? { playerName: playerName.trim() } : {}),
      ...(accountId === undefined ? {} : { accountId }),
      ...(kills === undefined ? {} : { kills }),
      ...(deaths === undefined ? {} : { deaths }),
      ...(assists === undefined ? {} : { assists }),
      isRadiant: typeof raw.isRadiant === 'boolean' ? raw.isRadiant : playerSlot < 128
    }];
  });
}
