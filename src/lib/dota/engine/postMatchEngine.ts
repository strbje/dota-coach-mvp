import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { normalizeStratzMatch } from '@/lib/dota/adapters/normalizeStratzMatch';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { runStratzQuery, STRATZ_EVENTS_QUERY } from '@/lib/dota/clients/stratz';
import { canApplyCarryRules, detectRole } from '@/lib/dota/role/detectRole';
import { UnsupportedPostMatchRoleError } from '@/lib/dota/errors/postMatchError';
import { lifestealerCarryOverride } from '@/lib/dota/rules/heroOverrides/lifestealer';
import { runCarryPostMatchRules } from '@/lib/dota/rules/roleRules/carryRules';
import { getHeroBenchmarks } from '@/lib/dota/data/benchmarks';
import { getStratzHeroAverage } from '@/lib/dota/data/stratzHeroAverages';
import { getHeroItemTimingScenariosResearch } from '@/lib/dota/data/itemTimingScenarios';
import type { PostMatchBenchmarkContext, StratzPostMatchData } from '@/lib/dota/types/domain';

type StratzFetchDebug = {
  attempted: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  bodyLength?: number;
  bodyPreview?: string;
  graphQLErrors?: unknown[];
  error?: string;
  normalizedDeathTimingsCount?: number;
  normalizedDeathsByPhase?: {
    laning: number;
    earlyMid: number;
    midGame: number;
    lateGame: number;
  } | null;
};

async function fetchStratzDeaths(matchId: number): Promise<{ data?: StratzPostMatchData; debug: StratzFetchDebug }> {
  const token = process.env.STRATZ_API_TOKEN;
  if (!token) return { debug: { attempted: false } };

  const queryResult = await runStratzQuery({
    query: STRATZ_EVENTS_QUERY,
    variables: { id: matchId },
    token
  });

  const debug: StratzFetchDebug = {
    attempted: true,
    status: queryResult.status,
    statusText: queryResult.statusText,
    contentType: queryResult.contentType,
    bodyLength: queryResult.bodyLength,
    bodyPreview: queryResult.bodyPreview,
    graphQLErrors: queryResult.graphQLErrors,
    error: queryResult.error
  };

  const payload = queryResult.json;
  if (!payload || typeof payload !== 'object') return { debug };

  const normalized = normalizeStratzMatch(payload);
  debug.normalizedDeathTimingsCount = normalized.deathTimings.length;
  debug.normalizedDeathsByPhase = normalized.deathsByPhase ?? null;

  return {
    data: {
      eventCoverage: normalized.eventCoverage,
      deathTimings: normalized.deathTimings,
      deathsByPhase: normalized.deathsByPhase,
      selectedPlayer: {
        heroId: normalized.normalized.selectedPlayer?.heroId,
        role: normalized.normalized.selectedPlayer?.role,
        roleBasic: normalized.normalized.selectedPlayer?.roleBasic,
        lane: normalized.normalized.selectedPlayer?.lane,
        position: normalized.normalized.selectedPlayer?.position,
        imp: normalized.normalized.selectedPlayer?.imp ?? null
      }
    },
    debug
  };
}

export async function analyzePostMatch(matchId: number, hero = 'Lifestealer') {
  let openDotaPayload: Awaited<ReturnType<typeof fetchOpenDotaMatch>>;

  try {
    openDotaPayload = await fetchOpenDotaMatch(matchId);
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Post-match fetch stage failed: ${parsed.message}`, { cause: parsed });
  }

  let normalized;
  try {
    normalized = await normalizeOpenDotaMatch(openDotaPayload, hero);
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Post-match normalize stage failed: ${parsed.message}`, { cause: parsed });
  }

  const safeStratzDeaths = async () => {
    try {
      return await fetchStratzDeaths(matchId);
    } catch (error) {
      return {
        data: undefined,
        debug: {
          attempted: Boolean(process.env.STRATZ_API_TOKEN),
          error: error instanceof Error ? error.message : String(error)
        } satisfies StratzFetchDebug
      };
    }
  };

  const [stratzResult, heroBenchmarks, heroAverage, itemTimingScenarios] = await Promise.all([
    safeStratzDeaths(),
    getHeroBenchmarks(54),
    getStratzHeroAverage(matchId, 54),
    getHeroItemTimingScenariosResearch(54)
  ]);
  const stratz = stratzResult.data;
  const stratzFetch = stratzResult.debug;
  const benchmarkContext: PostMatchBenchmarkContext = {
    heroBenchmarks,
    heroAverage,
    itemTimingScenarios
  };

  const roleDetection = detectRole({
    stratzRole: stratz?.selectedPlayer?.role,
    stratzRoleBasic: stratz?.selectedPlayer?.roleBasic,
    stratzPosition: stratz?.selectedPlayer?.position,
    stratzLane: stratz?.selectedPlayer?.lane,
    openDotaLaneRole: normalized.player?.laneReview?.laneRole,
    openDotaLane: normalized.player?.laneReview?.lane
  });
  // Carry is the first role rule set. Preserve the previous result when role
  // telemetry is absent; known or ambiguous roles must not be mislabeled as carry.
  if (!canApplyCarryRules(roleDetection)) {
    throw new UnsupportedPostMatchRoleError(roleDetection.role);
  }
  const analysis = runCarryPostMatchRules(normalized, stratz, benchmarkContext, lifestealerCarryOverride);
  const itemAnalysis = analysis.itemAnalysis ?? [];

  return {
    analysis,
    debug: {
      provider: 'opendota+stratz_optional',
      stages: {
        fetched: true,
        normalized: true,
        stratzEnrichment: Boolean(stratz?.deathsByPhase || stratz?.deathTimings?.length)
      },
      summary: {
        roleDetection,
        itemAnalysisAvailable: itemAnalysis.length > 0,
        itemPopularityStatus: itemAnalysis.some((it) => it.popularityStatus !== 'unknown') ? 'available' : 'unavailable',
        itemTimingScenariosStatus: itemAnalysis.some((it) => it.scenarioContext !== undefined) ? 'available' : 'unavailable',
        itemBenchmarkedItemsCount: itemAnalysis.filter((it) => it.popularityStatus !== 'unknown' || it.timingStatus !== 'unknown' || it.scenarioContext !== undefined).length,
        appliedRuleSet: 'carryRules',
        heroOverride: lifestealerCarryOverride.key,
        hasPlayer: Boolean(normalized.player),
        durationSeconds: normalized.durationSeconds,
        didRadiantWin: normalized.didRadiantWin,
        hasStratzToken: Boolean(process.env.STRATZ_API_TOKEN),
        stratzEnrichment: Boolean(stratz?.deathsByPhase || stratz?.deathTimings?.length),
        stratzDeathTimingsCount: stratz?.deathTimings?.length ?? 0,
        stratzDeathsByPhase: stratz?.deathsByPhase ?? null,
        stratzSelectedPlayer: stratz?.selectedPlayer
          ? {
              heroId: stratz.selectedPlayer.heroId,
              role: stratz.selectedPlayer.role,
              roleBasic: stratz.selectedPlayer.roleBasic,
              lane: stratz.selectedPlayer.lane,
              position: stratz.selectedPlayer.position,
              imp: stratz.selectedPlayer.imp ?? null
            }
          : null,
        stratzFetch,
        scoreBreakdown: analysis.scoreBreakdown
      }
    }
  };
}
