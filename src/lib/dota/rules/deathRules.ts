import type { MatchPhase } from '../types/domain';
import { normalizeObjectiveType } from './postMatch/objectives';

export type TimedDeath = {
  timeSeconds: number;
  heroId?: number;
};

export type TimedKeyItem = {
  key: string;
  item: string;
  timeSeconds: number;
  time: string;
};

export type TimedObjective = {
  timeSeconds: number;
  type: string;
};

export type MetricReadiness = 'normalized' | 'research' | 'unavailable';

export type DeathRulesSummary = {
  firstDeathInKillCluster: {
    value: number | null;
    clusterWindowSeconds: number;
    minimumDeathsPerCluster: number;
    clustersWithSelectedPlayerDeath: number;
    ambiguousFirstDeathClusters: number;
    source: 'stratz_stats.deathEvents' | 'unavailable';
    readiness: 'research' | 'unavailable';
  };
  deathsAfterKeyItem: {
    value: number | null;
    windowSeconds: number;
    items: Array<{ itemKey: string; item: string; itemTime: string; deaths: number }>;
    source: 'stratz_stats.deathEvents+opendota.purchase_log' | 'unavailable';
    readiness: MetricReadiness;
  };
  deathsBeforeObjective: {
    value: number | null;
    windowSeconds: number;
    byType: Record<string, number>;
    source: 'stratz_stats.deathEvents+opendota.objectives' | 'unavailable';
    readiness: 'research' | 'unavailable';
  };
  lateDeathsWithoutBuyback: {
    value: null;
    source: 'unconfirmed';
    readiness: 'unavailable';
  };
};

const KEY_ITEM_DEATH_WINDOW_SECONDS = 5 * 60;
const OBJECTIVE_LOOKBACK_SECONDS = 2 * 60;
const KILL_CLUSTER_WINDOW_SECONDS = 30;
const MINIMUM_DEATHS_PER_CLUSTER = 2;
const IMPORTANT_OBJECTIVE_TYPES = new Set(['building', 'barracks', 'roshan', 'aegis']);

function buildClusters(deaths: TimedDeath[], windowSeconds: number): TimedDeath[][] {
  const sorted = [...deaths].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const clusters: TimedDeath[][] = [];
  for (const death of sorted) {
    const current = clusters.at(-1);
    // Anchor the window at the first death so a chain of events cannot create an
    // arbitrarily long "fight". This remains a research heuristic, not a teamfight.
    if (!current || death.timeSeconds - current[0].timeSeconds > windowSeconds) clusters.push([death]);
    else current.push(death);
  }
  return clusters;
}

export function evaluateDeathRules(input: {
  selectedHeroId?: number;
  allPlayerDeaths?: TimedDeath[];
  selectedDeaths?: TimedDeath[];
  keyItems?: TimedKeyItem[];
  objectives?: TimedObjective[];
}): DeathRulesSummary {
  const selectedDeaths = input.selectedDeaths;
  const allDeaths = input.allPlayerDeaths;
  const keyItems = input.keyItems ?? [];
  const objectives = (input.objectives ?? [])
    .map((objective) => ({ ...objective, type: normalizeObjectiveType(objective.type) }))
    .filter((objective) => IMPORTANT_OBJECTIVE_TYPES.has(objective.type));
  const hasSelectedDeaths = selectedDeaths !== undefined;
  const hasAllDeaths = allDeaths !== undefined && input.selectedHeroId !== undefined;

  const relevantClusters = hasAllDeaths
    ? buildClusters(allDeaths, KILL_CLUSTER_WINDOW_SECONDS)
        .filter((cluster) => cluster.length >= MINIMUM_DEATHS_PER_CLUSTER)
        .filter((cluster) => cluster.some((death) => death.heroId === input.selectedHeroId))
    : [];
  const clusterFirstDeaths = relevantClusters.map((cluster) => {
    const minimumTime = Math.min(...cluster.map((death) => death.timeSeconds));
    return cluster.filter((death) => death.timeSeconds === minimumTime);
  });
  const ambiguousFirstDeathClusters = clusterFirstDeaths.filter((deaths) => deaths.length > 1).length;
  const firstDeathCount = clusterFirstDeaths.filter((deaths) => deaths.length === 1 && deaths[0].heroId === input.selectedHeroId).length;

  const hasKeyItems = hasSelectedDeaths && keyItems.length > 0;
  const itemRows = hasKeyItems
    ? keyItems.map((item) => ({
        itemKey: item.key,
        item: item.item,
        itemTime: item.time,
        deaths: selectedDeaths.filter((death) => death.timeSeconds >= item.timeSeconds && death.timeSeconds <= item.timeSeconds + KEY_ITEM_DEATH_WINDOW_SECONDS).length
      }))
    : [];
  const deathsAfterAnyKeyItem = hasKeyItems
    ? selectedDeaths.filter((death) => keyItems.some((item) => death.timeSeconds >= item.timeSeconds && death.timeSeconds <= item.timeSeconds + KEY_ITEM_DEATH_WINDOW_SECONDS)).length
    : null;

  const hasObjectives = hasSelectedDeaths && objectives.length > 0;
  const objectivePairs = hasObjectives
    ? objectives.flatMap((objective) => selectedDeaths
        .map((death, deathIndex) => ({ death, deathIndex }))
        .filter(({ death }) => death.timeSeconds <= objective.timeSeconds && death.timeSeconds >= objective.timeSeconds - OBJECTIVE_LOOKBACK_SECONDS)
        .map(({ deathIndex }) => ({ type: objective.type, deathIndex })))
    : [];
  const deathsByObjectiveType = objectivePairs.reduce<Record<string, Set<number>>>((acc, pair) => {
    (acc[pair.type] ??= new Set()).add(pair.deathIndex);
    return acc;
  }, {});
  const byType = Object.fromEntries(Object.entries(deathsByObjectiveType).map(([type, deathIndices]) => [type, deathIndices.size]));

  return {
    firstDeathInKillCluster: {
      value: hasAllDeaths ? firstDeathCount : null,
      clusterWindowSeconds: KILL_CLUSTER_WINDOW_SECONDS,
      minimumDeathsPerCluster: MINIMUM_DEATHS_PER_CLUSTER,
      clustersWithSelectedPlayerDeath: hasAllDeaths ? relevantClusters.length : 0,
      ambiguousFirstDeathClusters: hasAllDeaths ? ambiguousFirstDeathClusters : 0,
      source: hasAllDeaths ? 'stratz_stats.deathEvents' : 'unavailable',
      readiness: hasAllDeaths ? 'research' : 'unavailable'
    },
    deathsAfterKeyItem: {
      value: deathsAfterAnyKeyItem,
      windowSeconds: KEY_ITEM_DEATH_WINDOW_SECONDS,
      items: itemRows,
      source: hasKeyItems ? 'stratz_stats.deathEvents+opendota.purchase_log' : 'unavailable',
      readiness: hasKeyItems ? 'normalized' : 'unavailable'
    },
    deathsBeforeObjective: {
      value: hasObjectives ? new Set(objectivePairs.map((pair) => pair.deathIndex)).size : null,
      windowSeconds: OBJECTIVE_LOOKBACK_SECONDS,
      byType,
      source: hasObjectives ? 'stratz_stats.deathEvents+opendota.objectives' : 'unavailable',
      readiness: hasObjectives ? 'research' : 'unavailable'
    },
    lateDeathsWithoutBuyback: { value: null, source: 'unconfirmed', readiness: 'unavailable' }
  };
}

export function phaseForEvent(timeSeconds: number): MatchPhase {
  if (timeSeconds < 600) return 'laning';
  if (timeSeconds < 1200) return 'earlyMid';
  if (timeSeconds < 2100) return 'midGame';
  return 'lateGame';
}
