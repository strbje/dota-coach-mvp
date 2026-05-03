import type { NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';
import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

function toClock(sec?: number): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return 'n/a';
  const min = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${min}:${rem}`;
}

export function normalizeOpenDotaMatch(payload: OpenDotaMatchResponse, heroName = 'Lifestealer'): NormalizedOpenDotaMatch {
  const playerRaw = payload.players?.find((p) => p.hero_id === 54) as Record<string, unknown> | undefined;

  const timingsRaw = (playerRaw?.benchmarks as Record<string, { raw?: number }> | undefined) ?? {};

  return {
    matchId: payload.match_id,
    didRadiantWin: payload.radiant_win,
    durationSeconds: payload.duration,
    player: playerRaw
      ? {
          heroName,
          isRadiant: Boolean(playerRaw.isRadiant),
          kills: Number(playerRaw.kills ?? 0),
          deaths: Number(playerRaw.deaths ?? 0),
          assists: Number(playerRaw.assists ?? 0),
          lastHits: Number(playerRaw.last_hits ?? 0),
          heroDamage: Number(playerRaw.hero_damage ?? 0),
          gpm: Number(playerRaw.gold_per_min ?? 0),
          xpm: Number(playerRaw.xp_per_min ?? 0),
          item0: Number(playerRaw.item_0 ?? 0),
          item1: Number(playerRaw.item_1 ?? 0),
          item2: Number(playerRaw.item_2 ?? 0),
          item3: Number(playerRaw.item_3 ?? 0),
          item4: Number(playerRaw.item_4 ?? 0),
          item5: Number(playerRaw.item_5 ?? 0),
          itemTimings: [
            { item: 'Phase Boots', time: toClock(timingsRaw.gold_per_min?.raw) },
            { item: 'Armlet', time: toClock(timingsRaw.last_hits_per_min?.raw) }
          ]
        }
      : undefined
  };
}
