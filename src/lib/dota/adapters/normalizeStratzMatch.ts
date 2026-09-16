import { formatGameTime } from '../utils/time';
import type {
  MatchPhase,
  NormalizedStratzMatch,
  NormalizedStratzPlayer,
  StratzCombatEvent,
  StratzDeathPositionSample,
  StratzDeathEventSource,
  StratzFarmPositionSample,
  StratzFarmDistribution,
  StratzHeroAverageBenchmark,
  StratzEventCoverage,
  StratzPositionSample
} from '../types/domain';
import { normalizeStratzCoordinates } from '../normalize/stratzCoordinates';
import { evaluateDeathRules } from '../rules/deathRules';
import { evaluateFightRules } from '../rules/fightRules';
import { selectPlayer, type PlayerSelector } from '../selection/playerSelector';

type UnknownRecord = Record<string, unknown>;

const PREVIEW_LIMIT = 5;
const MATCH_ROSTER_SIZE = 10;
const TEAM_ROSTER_SIZE = 5;

function asArray<T = UnknownRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function nearestPosition(timeSeconds: number, positions: StratzPositionSample[]) {
  return positions
    .filter((position): position is StratzPositionSample & { timeSeconds: number; rawX: number; rawY: number } =>
      position.timeSeconds !== undefined
      && position.rawX !== undefined
      && position.rawY !== undefined
      && position.coordinateSystem === 'stratz_grid_0_255'
    )
    .map((position) => ({ position, deltaSeconds: Math.abs(position.timeSeconds - timeSeconds) }))
    .sort((a, b) => a.deltaSeconds - b.deltaSeconds)[0];
}

function positionConfidence(deltaSeconds: number | undefined) {
  if (deltaSeconds === undefined || deltaSeconds > 5) return 'unmatched' as const;
  if (deltaSeconds === 0) return 'exact' as const;
  if (deltaSeconds === 1) return 'high' as const;
  if (deltaSeconds <= 3) return 'medium' as const;
  return 'low' as const;
}

export function normalizeStratzMatch(raw: unknown, selector: PlayerSelector) {
  const match = getStratzMatchPayload(raw);
  const players = asArray<UnknownRecord>(match?.players);
  const selected = selectPlayer(players, selector, (player) => ({
    accountId: asNumber(player.steamAccountId),
    playerSlot: asNumber(player.playerSlot),
    heroId: asNumber(player.heroId)
  }), 'STRATZ');
  const selectedBy = selector.accountId !== undefined ? 'accountId' : selector.playerSlot !== undefined ? 'playerSlot' : 'heroId';

  const selectedStats = (selected?.stats as UnknownRecord | undefined) ?? {};
  const playbackData = (selected?.playbackData as UnknownRecord | undefined) ?? {};
  const positionRaw = asArray<UnknownRecord>(playbackData.playerUpdatePositionEvents);

  const positionSamples: StratzPositionSample[] = positionRaw
    .map((entry) => {
      const x = asNumber(entry.x) ?? asNumber(entry.positionX);
      const y = asNumber(entry.y) ?? asNumber(entry.positionY);
      return {
        timeSeconds: asNumber(entry.time),
        time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : undefined,
        x,
        y,
        source: 'stratz_playback' as const,
        ...normalizeStratzCoordinates(x, y)
      };
    });

  const selectedDeathEventsAvailable = Array.isArray(selectedStats.deathEvents);
  const selectedKillEventsAvailable = Array.isArray(selectedStats.killEvents);
  const selectedAssistEventsAvailable = Array.isArray(selectedStats.assistEvents);
  const deathEvents = mapCombatEvents(selectedStats.deathEvents);
  const playbackDeathEventsAvailable = Array.isArray(playbackData.deathEvents);
  const playbackDeathEvents = mapCombatEvents(playbackData.deathEvents);
  const researchDeathEvents = selectedDeathEventsAvailable ? deathEvents : playbackDeathEvents;
  const deathEventSource: StratzDeathEventSource | undefined = selectedDeathEventsAvailable
    ? 'stratz_stats.deathEvents'
    : playbackDeathEventsAvailable ? 'stratz_playback.deathEvents' : undefined;
  const deathTimed = deathEvents.filter((event) => event.timeSeconds !== undefined);
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

  const deathPositionSamples: StratzDeathPositionSample[] = researchDeathEvents
    .filter((death): death is StratzCombatEvent & { timeSeconds: number } => death.timeSeconds !== undefined)
    .map((death) => {
    const nearest = nearestPosition(death.timeSeconds, positionSamples);
    const matched = nearest && nearest.deltaSeconds <= 5 ? nearest.position : undefined;
    return {
      deathTimeSeconds: death.timeSeconds,
      deathTime: death.time ?? formatGameTime(death.timeSeconds),
      x: matched?.x,
      y: matched?.y,
      source: 'stratz_playback',
      deathEventSource: deathEventSource as StratzDeathEventSource,
      deltaSeconds: nearest?.deltaSeconds,
      confidence: positionConfidence(nearest?.deltaSeconds),
      ...(matched ? normalizeStratzCoordinates(matched.rawX, matched.rawY) : {}),
      productReady: false
    };
  });

  const farmPositionSamples: StratzFarmPositionSample[] = (['csEvents', 'goldEvents'] as const).flatMap((field) =>
    asArray<UnknownRecord>(playbackData[field]).map((event) => {
      const timeSeconds = asNumber(event.time);
      const nearest = timeSeconds === undefined ? undefined : nearestPosition(timeSeconds, positionSamples);
      const matched = nearest && nearest.deltaSeconds <= 5 ? nearest.position : undefined;
      return {
        eventType: field === 'csEvents' ? 'cs' as const : 'gold' as const,
        timeSeconds,
        time: timeSeconds === undefined ? undefined : formatGameTime(timeSeconds),
        deltaSeconds: nearest?.deltaSeconds,
        ...(matched ? normalizeStratzCoordinates(matched.rawX, matched.rawY) : {}),
        productReady: false as const
      };
    })
  );
  const matchPlaybackData = (match?.playbackData as UnknownRecord | undefined) ?? {};
  const mapObjectiveEvents = (value: unknown) => asArray<UnknownRecord>(value).map((entry) => {
    const rawX = asNumber(entry.x) ?? asNumber(entry.positionX);
    const rawY = asNumber(entry.y) ?? asNumber(entry.positionY);
    return {
      ...entry,
      time: asNumber(entry.time) !== undefined ? formatGameTime(asNumber(entry.time) ?? 0) : entry.time,
      ...normalizeStratzCoordinates(rawX, rawY),
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
    playerSlot: asNumber(selected.playerSlot),
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
    killEvents: selectedKillEventsAvailable ? mapCombatEvents(selectedStats.killEvents) : undefined,
    deathEvents: selectedDeathEventsAvailable ? deathEvents : undefined,
    assistEvents: selectedAssistEventsAvailable ? mapCombatEvents(selectedStats.assistEvents) : undefined,
    positionSamples,
    deathPositionSamples,
    farmDistribution,
    heroAverageBenchmarks: heroAverage
  } : undefined;

  const eventPlayers = players.map((player) => {
    const stats = (player.stats as UnknownRecord | undefined) ?? {};
    const timed = (value: unknown) => mapCombatEvents(value)
      .filter((event): event is StratzCombatEvent & { timeSeconds: number } => event.timeSeconds !== undefined)
      .map((event) => ({ timeSeconds: event.timeSeconds }));
    return {
      heroId: asNumber(player.heroId),
      isRadiant: typeof player.isRadiant === 'boolean' ? player.isRadiant : undefined,
      killEvents: Array.isArray(stats.killEvents) ? timed(stats.killEvents) : undefined,
      deathEvents: Array.isArray(stats.deathEvents) ? timed(stats.deathEvents) : undefined,
      assistEvents: Array.isArray(stats.assistEvents) ? timed(stats.assistEvents) : undefined
    };
  });
  const selectedEventPlayer = eventPlayers.find((player) => player.heroId === selectedPlayer?.heroId);
  const heroIds = eventPlayers.map((player) => player.heroId);
  const hasCompleteUniqueRoster = eventPlayers.length === MATCH_ROSTER_SIZE
    && heroIds.every((heroId): heroId is number => heroId !== undefined)
    && new Set(heroIds).size === MATCH_ROSTER_SIZE;
  const selectedTeam = selectedEventPlayer?.isRadiant === undefined
    ? []
    : eventPlayers.filter((player) => player.isRadiant === selectedEventPlayer.isRadiant);
  const allPlayerDeathEventsAvailable = hasCompleteUniqueRoster
    && eventPlayers.every((player) => player.deathEvents !== undefined);
  const teamKillEventsAvailable = hasCompleteUniqueRoster
    && eventPlayers.every((player) => player.isRadiant !== undefined)
    && selectedTeam.length === TEAM_ROSTER_SIZE
    && selectedTeam.every((player) => player.killEvents !== undefined);
  const eventCoverage: StratzEventCoverage = {
    selectedDeathEvents: selectedDeathEventsAvailable,
    selectedKillEvents: selectedKillEventsAvailable,
    selectedAssistEvents: selectedAssistEventsAvailable,
    allPlayerDeathEvents: allPlayerDeathEventsAvailable,
    teamKillEvents: teamKillEventsAvailable
  };
  const allPlayerDeaths = allPlayerDeathEventsAvailable
    ? eventPlayers.flatMap((player) => player.deathEvents!.map((event) => ({ ...event, heroId: player.heroId })))
    : undefined;
  const selectedTimedDeaths = selectedDeathEventsAvailable
    ? deathTimed.map((event) => ({ timeSeconds: event.timeSeconds as number, heroId: selectedPlayer?.heroId }))
    : undefined;
  const deathMetrics = evaluateDeathRules({ selectedHeroId: selectedPlayer?.heroId, allPlayerDeaths, selectedDeaths: selectedTimedDeaths });
  const fightMetrics = evaluateFightRules(eventPlayers, selectedPlayer?.heroId);

  const normalized: NormalizedStratzMatch = {
    matchId: asNumber(match?.id) ?? 0,
    durationSeconds: asNumber(match?.durationSeconds),
    didRadiantWin: match?.didRadiantWin as boolean | undefined,
    averageImp: asNumber(match?.averageImp) ?? null,
    selectedPlayer,
    dataAvailability: {
      playerSummary: Boolean(selectedPlayer), eventStats: selectedDeathEventsAvailable || selectedKillEventsAvailable || selectedAssistEventsAvailable,
      playback: positionSamples.length > 0, heroAverage: heroAverage.length > 0, deathEvents: selectedDeathEventsAvailable,
      positionEvents: positionSamples.some((p) => p.x !== undefined || p.y !== undefined),
      farmDistribution: Boolean(farmDistribution)
    }
  };

  return { normalized, selectedBy, deathsByPhase, deathTimings, positionSamples, deathPositionSamples, deathEventSource, farmPositionSamples, heroAverage, objectivePlaybackSummary, eventPlayers, allPlayerDeaths, eventCoverage, deathMetrics, fightMetrics };
}

export function tryNormalizeStratzMatch(raw: unknown, selector: PlayerSelector) {
  try {
    return { normalized: normalizeStratzMatch(raw, selector), selectionError: undefined };
  } catch (error) {
    if (error instanceof Error && error.name === 'PlayerSelectionError') {
      return { normalized: undefined, selectionError: error.message };
    }
    throw error;
  }
}
