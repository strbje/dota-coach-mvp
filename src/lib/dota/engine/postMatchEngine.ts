import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { normalizeStratzMatch } from '@/lib/dota/adapters/normalizeStratzMatch';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { runStratzQuery, STRATZ_EVENTS_QUERY } from '@/lib/dota/clients/stratz';
import { runLifestealerCarryPostMatchRules } from '@/lib/dota/rules/postMatch/lifestealerCarry';
import type { StratzPostMatchData } from '@/lib/dota/types/domain';

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
      deathTimings: normalized.deathTimings,
      deathsByPhase: normalized.deathsByPhase,
      selectedPlayer: {
        heroId: normalized.normalized.selectedPlayer?.heroId,
        role: normalized.normalized.selectedPlayer?.role,
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
    normalized = normalizeOpenDotaMatch(openDotaPayload, hero);
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Post-match normalize stage failed: ${parsed.message}`, { cause: parsed });
  }

  let stratz: StratzPostMatchData | undefined;
  let stratzFetch: StratzFetchDebug = { attempted: Boolean(process.env.STRATZ_API_TOKEN) };
  try {
    const result = await fetchStratzDeaths(matchId);
    stratz = result.data;
    stratzFetch = result.debug;
  } catch (error) {
    stratz = undefined;
    stratzFetch = {
      attempted: Boolean(process.env.STRATZ_API_TOKEN),
      error: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    analysis: runLifestealerCarryPostMatchRules(normalized, stratz),
    debug: {
      provider: 'opendota+stratz_optional',
      stages: {
        fetched: true,
        normalized: true,
        stratzEnrichment: Boolean(stratz?.deathsByPhase || stratz?.deathTimings?.length)
      },
      summary: {
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
              lane: stratz.selectedPlayer.lane,
              position: stratz.selectedPlayer.position,
              imp: stratz.selectedPlayer.imp ?? null
            }
          : null,
        stratzFetch
      }
    }
  };
}
