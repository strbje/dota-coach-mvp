import { normalizeStratzCoordinates } from '../normalize/stratzCoordinates';
import { formatGameTime } from '../utils/time';
import type {
  MatchPhase,
  NormalizedStratzMatch,
  NormalizedStratzPlayer,
  StratzCombatEvent,
  StratzDeathPositionSample,
  StratzFarmEventPositionSample,
  StratzFarmDistribution,
  StratzHeroAverageBenchmark,
  StratzPositionSample
} from '../types/domain';

type UnknownRecord = Record<string, unknown>;

const LIFESTEALER_HERO_ID = 54;
const PREVIEW_LIMIT = 5;

function asArray<T = UnknownRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hasArrayField(record: UnknownRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field) && Array.isArray(record[field]);
}

function hasFullUniqueRoster(players: UnknownRecord[]): boolean {
  if (players.length !== 10) return false;
  const slots = players.map((player) => asNumber(player.playerSlot));
  if (slots.some((slot) => slot === undefined) || new Set(slots).size !== 10) return false;
  return players.filter((player) => player.isRadiant === true).length === 5
    && players.filter((player) => player.isRadiant === false).length === 5;
}

function getStratzMatchPayload(raw: unknown): UnknownRecord | undefined {
  const direct = (raw as { match?: UnknownRecord })?.match;
  if (direct) return direct;

  const nested = (raw as { data?: { match?: UnknownRecord } })?.data?.match;
  if (nested) return nested;

  return undefined;
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

function readCoordinate(entry: UnknownRecord, axis: 'X' | 'Y'): number | undefined {
  return asNumber(entry[axis.toLowerCase()]) ?? asNumber(entry[`position${axis}`]);
}

function mapPositionSample(entry: UnknownRecord): StratzPositionSample {
  const timeSeconds = asNumber(entry.time);
  const rawX = readCoordinate(entry, 'X');
  const rawY = readCoordinate(entry, 'Y');
  const coordinates = normalizeStratzCoordinates(rawX, rawY);

  return {
    timeSeconds,
    time: timeSeconds !== undefined ? formatGameTime(timeSeconds) : undefined,
    x: coordinates?.rawX,
    y: coordinates?.rawY,
    rawX: coordinates?.rawX,
    rawY: coordinates?.rawY,
    mapX: coordinates?.mapX,
    mapY: coordinates?.mapY,
    worldX: coordinates?.worldX,
    worldY: coordinates?.worldY,
    coordinateSystem: coordinates?.coordinateSystem,
    coordinateValidation: coordinates?.validation ?? 'missing',
    source: 'stratz_playback',
    confidence: coordinates ? 'observed' : 'missing_coordinates',
    productReady: false
  };
}

function nearestPosition(positions: StratzPositionSample[], eventTimeSeconds: number, windowSeconds = 5) {
  const nearest = positions
    .filter((position) => position.timeSeconds !== undefined && position.rawX !== undefined && position.rawY !== undefined)
    .map((position) => ({ position, deltaSeconds: Math.abs((position.timeSeconds as number) - eventTimeSeconds) }))
    .sort((a, b) => a.deltaSeconds - b.deltaSeconds)[0];

  if (!nearest) return { position: undefined, deltaSeconds: undefined, confidence: 'unmatched' as const };
  if (nearest.deltaSeconds > windowSeconds) {
    return { position: undefined, deltaSeconds: nearest.deltaSeconds, confidence: 'unmatched' as const };
  }
  const confidence = nearest.deltaSeconds === 0
    ? 'exact' as const
    : nearest.deltaSeconds <= 1
      ? 'high' as const
      : nearest.deltaSeconds <= 3
        ? 'medium' as const
        : 'low' as const;
  return { ...nearest, confidence };
}

export function normalizeStratzMatch(raw: unknown, opts?: { accountId?: number; heroId?: number }) {
  const match = getStratzMatchPayload(raw);
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

  const positionSamples = positionRaw.map(mapPositionSample);

  const selectedDeathEventsAvailable = hasArrayField(selectedStats, 'deathEvents');
  const selectedKillEventsAvailable = hasArrayField(selectedStats, 'killEvents');
  const selectedAssistEventsAvailable = hasArrayField(selectedStats, 'assistEvents');
  const deathEvents = selectedDeathEventsAvailable ? mapCombatEvents(selectedStats.deathEvents) : undefined;
  const killEvents = selectedKillEventsAvailable ? mapCombatEvents(selectedStats.killEvents) : undefined;
  const assistEvents = selectedAssistEventsAvailable ? mapCombatEvents(selectedStats.assistEvents) : undefined;
  const eventPlayers = players.filter((player) => {
    const stats = (player.stats as UnknownRecord | undefined) ?? {};
    return hasArrayField(stats, 'deathEvents') || hasArrayField(stats, 'killEvents') || hasArrayField(stats, 'assistEvents');
  }).length;
  const fullRoster = hasFullUniqueRoster(players);
  const allPlayerDeathsAvailable = fullRoster && players.every((player) => {
    const stats = (player.stats as UnknownRecord | undefined) ?? {};
    return hasArrayField(stats, 'deathEvents');
  });
  const allPlayerDeaths = allPlayerDeathsAvailable
    ? players.flatMap((player) => mapCombatEvents(((player.stats as UnknownRecord).deathEvents)))
    : undefined;
  const eventCoverage = {
    selectedDeathEvents: selectedDeathEventsAvailable,
    selectedKillEvents: selectedKillEventsAvailable,
    selectedAssistEvents: selectedAssistEventsAvailable,
    eventPlayers,
    fullRoster,
    allPlayerDeaths: allPlayerDeathsAvailable
  };

  // Canonical combat telemetry comes only from stats. Playback deaths are a
  // separate research fallback used exclusively for position association.
  const associationDeathEvents = selectedDeathEventsAvailable
    ? deathEvents ?? []
    : mapCombatEvents(playbackData.deathEvents);
  const deathEventSource = selectedDeathEventsAvailable
    ? 'stratz_stats.deathEvents' as const
    : 'stratz_playback.deathEvents' as const;
  const deathTimed = (deathEvents ?? []).filter((event) => event.timeSeconds !== undefined);
  const deathTimings = deathTimed.map((event) => ({
    timeSeconds: event.timeSeconds as number,
    time: event.time as string,
    phase: toPhase(event.timeSeconds as number),
    source: 'stratz_stats' as const
  }));

  const deathsByPhase = selectedDeathEventsAvailable ? deathTimings.reduce((acc, item) => {
    acc[item.phase] += 1;
    return acc;
  }, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 }) : undefined;

  const deathPositionSamples: StratzDeathPositionSample[] = associationDeathEvents
    .filter((event): event is StratzCombatEvent & { timeSeconds: number; time: string } => event.timeSeconds !== undefined && event.time !== undefined)
    .map((death) => {
    const nearest = nearestPosition(positionSamples, death.timeSeconds);
    return {
      deathTimeSeconds: death.timeSeconds,
      deathTime: death.time,
      x: nearest.position?.rawX,
      y: nearest.position?.rawY,
      rawX: nearest.position?.rawX,
      rawY: nearest.position?.rawY,
      mapX: nearest.position?.mapX,
      mapY: nearest.position?.mapY,
      worldX: nearest.position?.worldX,
      worldY: nearest.position?.worldY,
      coordinateSystem: nearest.position?.coordinateSystem,
      positionTimeSeconds: nearest.position?.timeSeconds,
      deltaSeconds: nearest.deltaSeconds,
      source: 'stratz_playback',
      deathEventSource,
      confidence: nearest.confidence,
      productReady: false
    };
  });

  const farmEventPositionSamples: StratzFarmEventPositionSample[] = [
    ...asArray<UnknownRecord>(playbackData.csEvents).map((event) => ({ event, eventType: 'cs' as const })),
    ...asArray<UnknownRecord>(playbackData.goldEvents).map((event) => ({ event, eventType: 'gold' as const }))
  ].flatMap(({ event, eventType }) => {
    const eventTimeSeconds = asNumber(event.time);
    if (eventTimeSeconds === undefined) return [];
    const nearest = nearestPosition(positionSamples, eventTimeSeconds);
    return [{
      eventType,
      eventTimeSeconds,
      eventTime: formatGameTime(eventTimeSeconds),
      position: nearest.position,
      deltaSeconds: nearest.deltaSeconds,
      confidence: nearest.confidence,
      productReady: false as const
    }];
  });
  const matchPlaybackData = (match?.playbackData as UnknownRecord | undefined) ?? {};
  const mapObjectiveEvents = (value: unknown) => asArray<UnknownRecord>(value).map((entry) => {
    const coordinates = normalizeStratzCoordinates(readCoordinate(entry, 'X'), readCoordinate(entry, 'Y'));
    return {
      ...entry,
      timeSeconds: asNumber(entry.time),
      time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : entry.time,
      coordinates,
      teamAttribution: 'unconfirmed' as const,
      productReady: false as const
    };
  });
  const objectivePlaybackSummary = {
    roshanEventsCount: asArray(matchPlaybackData.roshanEvents).length,
    buildingEventsCount: asArray(matchPlaybackData.buildingEvents).length,
    towerDeathEventsCount: asArray(matchPlaybackData.towerDeathEvents).length,
    wardEventsCount: asArray(matchPlaybackData.wardEvents).length,
    roshanEventsPreview: mapObjectiveEvents(matchPlaybackData.roshanEvents).slice(0, PREVIEW_LIMIT),
    buildingEventsPreview: mapObjectiveEvents(matchPlaybackData.buildingEvents).slice(0, PREVIEW_LIMIT),
    towerDeathEventsPreview: mapObjectiveEvents(matchPlaybackData.towerDeathEvents).slice(0, PREVIEW_LIMIT),
    wardEventsPreview: mapObjectiveEvents(matchPlaybackData.wardEvents).slice(0, PREVIEW_LIMIT)
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
    killEvents,
    deathEvents,
    assistEvents,
    positionSamples,
    deathPositionSamples,
    farmEventPositionSamples,
    farmDistribution,
    heroAverageBenchmarks: heroAverage
  } : undefined;

  const normalized: NormalizedStratzMatch = {
    matchId: asNumber(match?.id) ?? 0,
    durationSeconds: asNumber(match?.durationSeconds),
    didRadiantWin: match?.didRadiantWin as boolean | undefined,
    averageImp: asNumber(match?.averageImp) ?? null,
    selectedPlayer,
    eventCoverage,
    dataAvailability: {
      playerSummary: Boolean(selectedPlayer), eventStats: selectedDeathEventsAvailable || selectedKillEventsAvailable || selectedAssistEventsAvailable,
      playback: positionSamples.length > 0, heroAverage: heroAverage.length > 0, deathEvents: selectedDeathEventsAvailable,
      positionEvents: positionSamples.some((p) => p.x !== undefined || p.y !== undefined),
      farmDistribution: Boolean(farmDistribution)
    }
  };

  return { normalized, selectedBy, selectedDeathEventsAvailable, selectedKillEventsAvailable, selectedAssistEventsAvailable, eventPlayers, eventCoverage, allPlayerDeaths, deathsByPhase, deathTimings, positionSamples, deathPositionSamples, farmEventPositionSamples, heroAverage, objectivePlaybackSummary };
}
