import { formatGameTime, getItemIconUrlByKey, getItemNameById, getItemNameByKey } from '@/lib/dota/constants/items';
import type { NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';
import type { OpenDotaMatchResponse } from '@/lib/dota/types/providers';

const TRACKED_ITEM_KEYS = new Set([
  'phase_boots',
  'armlet',
  'desolator',
  'basher',
  'black_king_bar',
  'sange_and_yasha',
  'assault',
  'abyssal_blade',
  'satanic',
  'mjollnir',
  'radiance',
  'monkey_king_bar',
  'butterfly',
  'heart'
]);

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

  if (!playerRaw) throw new Error('Target hero/player not found in OpenDota payload');

  const durationSeconds = toNumber(payload.duration);
  const durationMinutes = durationSeconds > 0 ? durationSeconds / 60 : 0;
  const kills = toNumber(playerRaw.kills);
  const assists = toNumber(playerRaw.assists);
  const lastHits = toNumber(playerRaw.last_hits);
  const heroDamage = toNumber(playerRaw.hero_damage);
  const deaths = toNumber(playerRaw.deaths);

  const rawPurchaseLog = Array.isArray(playerRaw.purchase_log) ? (playerRaw.purchase_log as Array<Record<string, unknown>>) : null;
  const itemTimingSource = rawPurchaseLog ? 'purchase_log' : 'unavailable';

  const seen = new Set<string>();
  const itemTimings = (rawPurchaseLog ?? [])
    .filter((entry) => typeof entry.key === 'string' && TRACKED_ITEM_KEYS.has(entry.key) && typeof entry.time === 'number')
    .filter((entry) => {
      if (seen.has(entry.key as string)) return false;
      seen.add(entry.key as string);
      return true;
    })
    .map((entry) => {
      const timeSeconds = toNumber(entry.time);
      return {
        key: entry.key as string,
        item: getItemNameByKey(entry.key as string),
        time: formatGameTime(timeSeconds),
        timeSeconds,
        iconUrl: getItemIconUrlByKey(entry.key as string) ?? undefined,
        source: 'purchase_log' as const
      };
    });



  const rawDeathLog = Array.isArray(playerRaw.deaths_log)
    ? (playerRaw.deaths_log as Array<Record<string, unknown>>)
    : Array.isArray(playerRaw.death_log)
      ? (playerRaw.death_log as Array<Record<string, unknown>>)
      : null;

  const deathTimings = (rawDeathLog ?? [])
    .filter((entry) => typeof entry.time === 'number')
    .map((entry) => {
      const timeSeconds = toNumber(entry.time);
      const phase =
        timeSeconds < 600
          ? 'laning'
          : timeSeconds < 1200
            ? 'earlyMid'
            : timeSeconds < 2100
              ? 'midGame'
              : 'lateGame';

      return { timeSeconds, time: formatGameTime(timeSeconds), phase } as const;
    });

  const deathsByPhase = deathTimings.reduce(
    (acc, timing) => {
      acc[timing.phase] += 1;
      return acc;
    },
    { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 }
  );

  const deathDataSource = rawDeathLog ? 'death_log' : 'unavailable';

  const teamKey = toBoolean(playerRaw.isRadiant) ? 'radiant_score' : 'dire_score';
  const teamKillsRaw = payload[teamKey as keyof OpenDotaMatchResponse];
  const teamKills = typeof teamKillsRaw === 'number' && teamKillsRaw > 0 ? teamKillsRaw : null;

  const rawItemIds = [0, 1, 2, 3, 4, 5].map((slot) => toNumber(playerRaw[`item_${slot}`]));
  const unknownItemIds = rawItemIds.filter((id) => id > 0 && !getItemNameById(id));
  const buildPlayed = rawItemIds.map((id) => getItemNameById(id)).filter((name): name is string => Boolean(name));

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
      item0: rawItemIds[0],
      item1: rawItemIds[1],
      item2: rawItemIds[2],
      item3: rawItemIds[3],
      item4: rawItemIds[4],
      item5: rawItemIds[5],
      itemTimings,
      itemTimingSource,
      buildPlayed,
      rawPurchaseLogPreview: (rawPurchaseLog ?? [])
        .filter((entry) => typeof entry.key === 'string' && typeof entry.time === 'number')
        .slice(0, 30)
        .map((entry) => ({ key: entry.key as string, time: toNumber(entry.time) })),
      rawItemIds,
      unknownItemIds,
      deathTimings,
      deathsByPhase,
      deathDataSource
    }
  };
}
