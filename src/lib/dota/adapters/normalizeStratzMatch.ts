import { formatGameTime } from '@/lib/dota/utils/time';
import type {
  MatchPhase,
  NormalizedStratzMatch,
  NormalizedStratzPlayer,
  StratzCombatEvent,
  StratzDeathPositionSample,
  StratzFarmDistribution,
  StratzHeroAverageBenchmark,
  StratzPositionSample
} from '@/lib/dota/types/domain';

type UnknownRecord = Record<string, unknown>;

const LIFESTEALER_HERO_ID = 54;
const PREVIEW_LIMIT = 5;

function asArray<T = UnknownRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toPhase(timeSeconds: number): MatchPhase {
  if (timeSeconds < 600) return 'laning';
  if (timeSeconds < 1200) return 'earlyMid';
  if (timeSeconds < 2100) return 'midGame';
  return 'lateGame';
}

function mapCombatEvents(value: unknown): StratzCombatEvent[] {
  return asArray<UnknownRecord>(value).map((entry) => ({
    timeSeconds: asNumber(entry.time),
    time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : undefined,
    raw: entry
  }));
}

export function normalizeStratzMatch(raw: unknown, opts?: { accountId?: number; heroId?: number }) {
  const match = (raw as { match?: UnknownRecord })?.match;
  const players = asArray<UnknownRecord>(match?.players);
  const targetAccountId = opts?.accountId;
  const targetHeroId = opts?.heroId ?? LIFESTEALER_HERO_ID;

  const byAccount = targetAccountId ? players.find((p) => asNumber(p.steamAccountId) === targetAccountId) : undefined;
  const byHeroId = players.find((p) => asNumber(p.heroId) === targetHeroId);
  const fallback = players[0];
  const selected = byAccount ?? byHeroId ?? fallback;
  const selectedBy = byAccount ? 'accountId' : byHeroId ? 'heroId' : 'fallback';

  const selectedStats = (selected?.stats as UnknownRecord | undefined) ?? {};
  const playbackData = (selected?.playbackData as UnknownRecord | undefined) ?? {};
  const positionRaw = asArray<UnknownRecord>(playbackData.playerUpdatePositionEvents);

  const positionSamples: StratzPositionSample[] = positionRaw
    .map((entry) => ({
      timeSeconds: asNumber(entry.time),
      time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : undefined,
      x: asNumber(entry.x) ?? asNumber(entry.positionX),
      y: asNumber(entry.y) ?? asNumber(entry.positionY),
      source: 'stratz_playback' as const
    }));

  const deathEvents = mapCombatEvents(selectedStats.deathEvents);
  const deathTimed = deathEvents.filter((event) => event.timeSeconds !== undefined);
  const deathTimings = deathTimed.map((event) => ({
    timeSeconds: event.timeSeconds as number,
    time: event.time as string,
    phase: toPhase(event.timeSeconds as number),
    source: 'stratz_stats' as const
  }));

  const deathsByPhase = deathTimings.length > 0 ? deathTimings.reduce((acc, item) => {
    acc[item.phase] += 1;
    return acc;
  }, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 }) : undefined;

  const deathPositionSamples: StratzDeathPositionSample[] = deathTimings.map((death) => {
    const nearest = positionSamples
      .filter((p) => typeof p.timeSeconds === 'number' && Math.abs((p.timeSeconds as number) - death.timeSeconds) <= 5)
      .sort((a, b) => Math.abs((a.timeSeconds as number) - death.timeSeconds) - Math.abs((b.timeSeconds as number) - death.timeSeconds))[0];
    return {
      deathTimeSeconds: death.timeSeconds,
      deathTime: death.time,
      x: nearest?.x,
      y: nearest?.y,
      source: 'stratz_playback',
      productReady: false
    };
  });
  const matchPlaybackData = (match?.playbackData as UnknownRecord | undefined) ?? {};
  const mapObjectiveEvents = (value: unknown) => asArray<UnknownRecord>(value).map((entry) => ({
    ...entry,
    time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : entry.time
  }));
  const objectivePlaybackSummary = {
    roshanEventsCount: asArray(matchPlaybackData.roshanEvents).length,
    buildingEventsCount: asArray(matchPlaybackData.buildingEvents).length,
    towerDeathEventsCount: asArray(matchPlaybackData.towerDeathEvents).length,
    wardEventsCount: asArray(matchPlaybackData.wardEvents).length,
    roshanEventsPreview: mapObjectiveEvents(matchPlaybackData.roshanEvents).slice(0, PREVIEW_LIMIT),
    buildingEventsPreview: mapObjectiveEvents(matchPlaybackData.buildingEvents).slice(0, PREVIEW_LIMIT),
    towerDeathEventsPreview: mapObjectiveEvents(matchPlaybackData.towerDeathEvents).slice(0, PREVIEW_LIMIT)
  };

  const farmRaw = selectedStats.farmDistributionReport as UnknownRecord | undefined;
  const farmDistribution: StratzFarmDistribution | null = farmRaw ? {
    laneFarm: asNumber(farmRaw.laneFarm),
    neutralFarm: asNumber(farmRaw.neutralFarm),
    ancientFarm: asNumber(farmRaw.ancientFarm),
    heroFarm: asNumber(farmRaw.heroFarm),
    objectiveFarm: asNumber(farmRaw.objectiveFarm),
    unknown: asNumber(farmRaw.unknown),
    rawPreview: farmRaw
  } : null;

  const heroAverage = asArray<UnknownRecord>(selected?.heroAverage).map((entry) => ({
    time: asNumber(entry.time) ?? 0,
    matchCount: asNumber(entry.matchCount) ?? 0,
    winCount: asNumber(entry.winCount) ?? 0,
    cs: asNumber(entry.cs),
    networth: asNumber(entry.networth),
    goldPerMinute: asNumber(entry.goldPerMinute),
    heroDamage: asNumber(entry.heroDamage),
    deaths: asNumber(entry.deaths),
    kills: asNumber(entry.kills),
    assists: asNumber(entry.assists)
  } satisfies StratzHeroAverageBenchmark));

  const selectedPlayer: NormalizedStratzPlayer | undefined = selected ? {
    steamAccountId: asNumber(selected.steamAccountId),
    heroId: asNumber(selected.heroId),
    isRadiant: selected.isRadiant as boolean | undefined,
    isVictory: selected.isVictory as boolean | undefined,
    lane: (selected.lane as string | undefined),
    position: (selected.position as string | undefined),
    role: (selected.role as string | undefined),
    roleBasic: (selected.roleBasic as string | undefined),
    imp: asNumber(selected.imp) ?? null,
    award: (selected.award as string | null | undefined) ?? null,
    kills: asNumber(selected.kills), deaths: asNumber(selected.deaths), assists: asNumber(selected.assists),
    gpm: asNumber(selected.goldPerMinute), xpm: asNumber(selected.experiencePerMinute), networth: asNumber(selected.networth),
    level: asNumber(selected.level), lastHits: asNumber(selected.numLastHits), denies: asNumber(selected.numDenies),
    heroDamage: asNumber(selected.heroDamage), towerDamage: asNumber(selected.towerDamage),
    itemIds: [0,1,2,3,4,5].map((i) => asNumber(selected[`item${i}Id`])).filter((v): v is number => v !== undefined),
    backpackItemIds: [0,1,2].map((i) => asNumber(selected[`backpack${i}Id`])).filter((v): v is number => v !== undefined),
    neutralItemId: asNumber(selected.neutral0Id) ?? null,
    killEvents: mapCombatEvents(selectedStats.killEvents),
    deathEvents,
    assistEvents: mapCombatEvents(selectedStats.assistEvents),
    positionSamples,
    deathPositionSamples,
    farmDistribution,
    heroAverageBenchmarks: heroAverage
  } : undefined;

  const normalized: NormalizedStratzMatch = {
    matchId: asNumber(match?.id) ?? 0,
    durationSeconds: asNumber(match?.durationSeconds),
    didRadiantWin: match?.didRadiantWin as boolean | undefined,
    averageImp: asNumber(match?.averageImp) ?? null,
    selectedPlayer,
    dataAvailability: {
      playerSummary: Boolean(selectedPlayer), eventStats: deathEvents.length > 0 || (selectedPlayer?.killEvents?.length ?? 0) > 0,
      playback: positionSamples.length > 0, heroAverage: heroAverage.length > 0, deathEvents: deathEvents.length > 0,
      positionEvents: positionSamples.some((p) => p.x !== undefined || p.y !== undefined),
      farmDistribution: Boolean(farmDistribution)
    }
  };

  return { normalized, selectedBy, deathsByPhase, deathTimings, positionSamples, deathPositionSamples, heroAverage, objectivePlaybackSummary };
}
