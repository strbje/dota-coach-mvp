import { getLifestealerMvpItemName } from '@/lib/dota/constants/items';
import type { NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';
import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

function toClock(sec?: number): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return 'n/a';
  const min = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${min}:${rem}`;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeOpenDotaMatch(payload: OpenDotaMatchResponse, heroName = 'Lifestealer'): NormalizedOpenDotaMatch {
  const players = Array.isArray(payload.players) ? payload.players : [];
  const playerRaw = players.find((p) => toNumber((p as Record<string, unknown>).hero_id, -1) === 54) as
    | Record<string, unknown>
    | undefined;

  if (!playerRaw) {
    throw new Error('Target hero/player not found in OpenDota payload');
  }

  const durationSeconds = toNumber(payload.duration);
  const durationMinutes = durationSeconds > 0 ? durationSeconds / 60 : 0;
  const kills = toNumber(playerRaw.kills);
  const assists = toNumber(playerRaw.assists);
  const lastHits = toNumber(playerRaw.last_hits);
  const heroDamage = toNumber(playerRaw.hero_damage);
  const deaths = toNumber(playerRaw.deaths);

  const purchaseLog = Array.isArray(playerRaw.purchase_log)
    ? (playerRaw.purchase_log as Array<Record<string, unknown>>)
    : null;

  const itemTimings = purchaseLog
    ? purchaseLog
        .filter((entry) => typeof entry.key === 'string' && typeof entry.time === 'number')
        .map((entry) => ({ item: entry.key as string, time: toClock(toNumber(entry.time)), source: 'purchase_log' as const }))
    : [{ item: 'purchase_log', time: 'n/a', source: 'unavailable' as const }];

  const teamKey = toBoolean(playerRaw.isRadiant) ? 'radiant_score' : 'dire_score';
  const teamKillsRaw = payload[teamKey as keyof OpenDotaMatchResponse];
  const teamKills = typeof teamKillsRaw === 'number' && teamKillsRaw > 0 ? teamKillsRaw : null;

  const item0 = toNumber(playerRaw.item_0);
  const item1 = toNumber(playerRaw.item_1);
  const item2 = toNumber(playerRaw.item_2);
  const item3 = toNumber(playerRaw.item_3);
  const item4 = toNumber(playerRaw.item_4);
  const item5 = toNumber(playerRaw.item_5);

  const normalizedBuild = [item0, item1, item2, item3, item4, item5]
    .map((id) => getLifestealerMvpItemName(id))
    .filter((name): name is string => Boolean(name));

  return {
    matchId: toNumber(payload.match_id),
    didRadiantWin: toBoolean(payload.radiant_win),
    durationSeconds,
    player: {
      heroName,
      isRadiant: toBoolean(playerRaw.isRadiant),
      durationMinutes,
      kills,
      deaths,
      assists,
      lastHits,
      lastHitsPerMin: durationMinutes > 0 ? lastHits / durationMinutes : 0,
      heroDamage,
      heroDamagePerMin: durationMinutes > 0 ? heroDamage / durationMinutes : 0,
      gpm: toNumber(playerRaw.gold_per_min),
      xpm: toNumber(playerRaw.xp_per_min),
      killParticipation: teamKills ? (kills + assists) / teamKills : undefined,
      item0,
      item1,
      item2,
      item3,
      item4,
      item5,
      itemTimings,
      buildPlayed: normalizedBuild
    }
  };
}
