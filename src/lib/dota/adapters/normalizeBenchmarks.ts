import { getItemKeyById, getItemNameById, getItemNameByKey } from '@/lib/dota/data/itemConstants';

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

export function normalizeItemPopularity(heroId: number, payload: unknown) {
  const errors: string[] = [];
  const node = asObject(payload);
  if (!node) errors.push('OpenDota itemPopularity payload is not an object');

  const readPhase = (phase: 'start' | 'early' | 'mid' | 'late') => {
    const value = node?.[phase];
    return asObject(value) as Record<string, number> | undefined;
  };

  const phases = { start: readPhase('start'), early: readPhase('early'), mid: readPhase('mid'), late: readPhase('late') };

  const parseTop = (phaseData: Record<string, number> | undefined) => {
    if (!phaseData) return [];
    return Object.entries(phaseData)
      .map(([itemIdOrKey, count]) => {
        const numericId = Number(itemIdOrKey);
        const isNumericId = Number.isFinite(numericId) && numericId > 0;
        const itemId = isNumericId ? numericId : 0;
        const key = isNumericId ? getItemKeyById(itemId) ?? undefined : itemIdOrKey;
        const name = isNumericId ? getItemNameById(itemId) ?? undefined : getItemNameByKey(itemIdOrKey);
        return { itemId, key, name, count: typeof count === 'number' ? count : 0 };
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
      const raw = asObject(row);
      if (!raw) return null;
      const itemKey = typeof raw.item === 'string' ? raw.item : typeof raw.item_name === 'string' ? raw.item_name : null;
      if (!itemKey) return null;
      const lower = typeof raw.time === 'number' ? raw.time : typeof raw.time_start === 'number' ? raw.time_start : undefined;
      const upper = typeof raw.time_end === 'number' ? raw.time_end : typeof raw.next_time === 'number' ? raw.next_time : undefined;
      const gamesRaw = typeof raw.games === 'number' ? raw.games : typeof raw.games === 'string' ? Number(raw.games) : typeof raw.match_count === 'number' ? raw.match_count : undefined;
      const winsRaw = typeof raw.wins === 'number' ? raw.wins : typeof raw.wins === 'string' ? Number(raw.wins) : undefined;
      const games = Number.isFinite(gamesRaw) ? Number(gamesRaw) : 0;
      const wins = Number.isFinite(winsRaw) ? Number(winsRaw) : 0;
      const winRate = games > 0 ? wins / games : null;
      const timeLabel = typeof raw.label === 'string'
        ? raw.label
        : typeof lower === 'number'
          ? `${Math.floor(lower / 60)}:${String(lower % 60).padStart(2, '0')}`
          : 'n/a';
      return { itemKey, itemName: getItemNameByKey(itemKey), timeLowerBound: lower ?? 0, timeUpperBound: upper, timeLabel, games, wins, winRate };
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
