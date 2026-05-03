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

  const timingsRaw = (playerRaw.benchmarks as Record<string, { raw?: number }> | undefined) ?? {};

  return {
    matchId: toNumber(payload.match_id),
    didRadiantWin: toBoolean(payload.radiant_win),
    durationSeconds: toNumber(payload.duration),
    player: {
      heroName,
      isRadiant: toBoolean(playerRaw.isRadiant),
      kills: toNumber(playerRaw.kills),
      deaths: toNumber(playerRaw.deaths),
      assists: toNumber(playerRaw.assists),
      lastHits: toNumber(playerRaw.last_hits),
      heroDamage: toNumber(playerRaw.hero_damage),
      gpm: toNumber(playerRaw.gold_per_min),
      xpm: toNumber(playerRaw.xp_per_min),
      item0: toNumber(playerRaw.item_0),
      item1: toNumber(playerRaw.item_1),
      item2: toNumber(playerRaw.item_2),
      item3: toNumber(playerRaw.item_3),
      item4: toNumber(playerRaw.item_4),
      item5: toNumber(playerRaw.item_5),
      itemTimings: [
        { item: 'Phase Boots', time: toClock(timingsRaw.gold_per_min?.raw) },
        { item: 'Armlet', time: toClock(timingsRaw.last_hits_per_min?.raw) }
      ]
    }
  };
}
