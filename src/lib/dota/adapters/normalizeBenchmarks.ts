import { getItemKeyById, getItemNameById, getItemNameByKey, humanizeItemKey, type ItemConstant } from '../data/itemConstants';
import { normalizeItemTimingBucket } from '../analyze/itemTimingBenchmarks';

type PercentileRow = { percentile: number; value: number };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizePercentiles(value: unknown): PercentileRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((row) => {
      const raw = asObject(row);
      if (!raw) return null;
      const percentile = typeof raw.percentile === 'number' ? raw.percentile : null;
      const metricValue = typeof raw.value === 'number' ? raw.value : null;
      if (percentile === null || metricValue === null) return null;
      return { percentile, value: metricValue };
    })
    .filter((row): row is PercentileRow => Boolean(row));

  return rows.length ? rows : undefined;
}

export function normalizeHeroBenchmarks(heroId: number, payload: unknown) {
  const errors: string[] = [];
  const metricsNode = asObject(payload)?.result;
  const metrics = asObject(metricsNode);

  if (!metrics) errors.push('OpenDota benchmarks payload.result missing or invalid');

  const normalized = {
    source: 'opendota' as const,
    heroId,
    available: Boolean(metrics),
    metrics: {
      gold_per_min: normalizePercentiles(metrics?.gold_per_min),
      xp_per_min: normalizePercentiles(metrics?.xp_per_min),
      last_hits_per_min: normalizePercentiles(metrics?.last_hits_per_min),
      hero_damage_per_min: normalizePercentiles(metrics?.hero_damage_per_min),
      tower_damage: normalizePercentiles(metrics?.tower_damage),
      kills_per_min: normalizePercentiles(metrics?.kills_per_min)
    },
    errors: errors.length ? errors : undefined
  };

  normalized.available = Object.values(normalized.metrics).some((it) => Array.isArray(it) && it.length > 0);
  return normalized;
}

export type ItemPopularityLookup = {
  itemKeyById: Record<number, string>;
  itemByKey: Record<string, ItemConstant>;
};

export function normalizeItemPopularity(heroId: number, payload: unknown, itemLookup?: ItemPopularityLookup) {
  const errors: string[] = [];
  const node = asObject(payload);
  if (!node) errors.push('OpenDota itemPopularity payload is not an object');

  const phaseKeys = {
    start: 'start_game_items',
    early: 'early_game_items',
    mid: 'mid_game_items',
    late: 'late_game_items'
  } as const;
  const readPhase = (phase: keyof typeof phaseKeys) => {
    // OpenDota's documented wire keys use *_game_items. Keep the short-key
    // fallback for captured/legacy fixtures, but never require it.
    const value = node?.[phaseKeys[phase]] ?? node?.[phase];
    return asObject(value) as Record<string, number> | undefined;
  };

  const phases = { start: readPhase('start'), early: readPhase('early'), mid: readPhase('mid'), late: readPhase('late') };

  const parseTop = (phaseData: Record<string, number> | undefined) => {
    if (!phaseData) return [];
    return Object.entries(phaseData)
      .flatMap(([itemIdOrKey, count]) => {
        if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return [];
        const numericId = Number(itemIdOrKey);
        const isNumericId = Number.isFinite(numericId) && numericId > 0;
        const itemId = isNumericId ? numericId : 0;
        const key = isNumericId
          ? itemLookup ? itemLookup.itemKeyById[itemId] : getItemKeyById(itemId) ?? undefined
          : itemIdOrKey;
        const name = key
          ? itemLookup ? itemLookup.itemByKey[key]?.dname ?? humanizeItemKey(key) : isNumericId ? getItemNameById(itemId) ?? undefined : getItemNameByKey(key)
          : undefined;
        return [{ itemId, key, name, count }];
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const topItemsByPhase = {
    start: parseTop(phases.start),
    early: parseTop(phases.early),
    mid: parseTop(phases.mid),
    late: parseTop(phases.late)
  };

  const available = Object.values(topItemsByPhase).some((rows) => rows.length > 0);
  if (node && !available) errors.push('OpenDota itemPopularity contains no item counts for this hero');

  return {
    source: 'opendota' as const,
    heroId,
    available,
    phases,
    topItemsByPhase,
    errors: errors.length ? errors : undefined
  };
}

export function normalizeItemTimingScenarios(heroId: number, payload: unknown) {
  const errors: string[] = [];
  const rows = Array.isArray(payload) ? payload : [];
  if (!Array.isArray(payload)) errors.push('OpenDota itemTimings payload is not an array');

  const items = rows.slice(0, 50).map((row) => {
    const raw = asObject(row);
    const itemKey = typeof raw?.item === 'string' ? raw.item : typeof raw?.item_name === 'string' ? raw.item_name : undefined;
    const itemName = itemKey ? getItemNameByKey(itemKey) : undefined;
    return { itemKey, itemName, raw: row };
  });

  const timingBuckets = rows
    .map((row) => {
      const bucket = normalizeItemTimingBucket(row);
      return bucket ? { ...bucket, itemName: getItemNameByKey(bucket.itemKey) } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    source: 'opendota' as const,
    heroId,
    available: items.length > 0,
    items,
    timingBuckets: timingBuckets.length ? timingBuckets : undefined,
    errors: errors.length ? errors : undefined
  };
}

export function normalizeStratzHeroAverage(matchId: number, selectedHeroId: number, payload: unknown) {
  const warnings: string[] = [];
  const players = (asObject(payload)?.data as Record<string, unknown> | undefined)?.match as Record<string, unknown> | undefined;
  const playerRows = Array.isArray(players?.players) ? (players?.players as unknown[]) : [];
  const selected = playerRows.find((row) => asObject(row)?.heroId === selectedHeroId);

  if (!selected) warnings.push(`No STRATZ player found for heroId=${selectedHeroId}`);
  const selectedObj = asObject(selected);
  const heroAverageRows = Array.isArray(selectedObj?.heroAverage) ? (selectedObj?.heroAverage as unknown[]) : [];

  const samples = heroAverageRows
    .map((row) => {
      const raw = asObject(row);
      if (!raw || typeof raw.time !== 'number') return null;
      return {
        time: raw.time,
        position: typeof raw.position === 'string' ? raw.position : undefined,
        matchCount: typeof raw.matchCount === 'number' ? raw.matchCount : undefined,
        winCount: typeof raw.winCount === 'number' ? raw.winCount : undefined,
        cs: typeof raw.cs === 'number' ? raw.cs : undefined,
        networth: typeof raw.networth === 'number' ? raw.networth : undefined,
        goldPerMinute: typeof raw.goldPerMinute === 'number' ? raw.goldPerMinute : undefined,
        heroDamage: typeof raw.heroDamage === 'number' ? raw.heroDamage : undefined,
        towerDamage: typeof raw.towerDamage === 'number' ? raw.towerDamage : undefined,
        deaths: typeof raw.deaths === 'number' ? raw.deaths : undefined,
        teamKills: typeof raw.teamKills === 'number' ? raw.teamKills : undefined,
        goldLost: typeof raw.goldLost === 'number' ? raw.goldLost : undefined,
        goldFed: typeof raw.goldFed === 'number' ? raw.goldFed : undefined,
        buybackCount: typeof raw.buybackCount === 'number' ? raw.buybackCount : undefined
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    source: 'stratz' as const,
    matchId,
    selectedHeroId,
    selectedPosition: typeof selectedObj?.position === 'string' ? selectedObj.position : undefined,
    available: samples.length > 0,
    samples,
    methodologyStatus: 'unknown' as const,
    warnings
  };
}
