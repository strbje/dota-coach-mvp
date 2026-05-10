import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { normalizeStratzMatch } from '@/lib/dota/adapters/normalizeStratzMatch';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { runLifestealerCarryPostMatchRules } from '@/lib/dota/rules/postMatch/lifestealerCarry';
import type { StratzPostMatchData } from '@/lib/dota/types/domain';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

async function fetchStratzDeaths(matchId: number): Promise<StratzPostMatchData | undefined> {
  const token = process.env.STRATZ_API_TOKEN;
  if (!token) return undefined;

  const response = await fetch(STRATZ_GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query PostMatchStratzDeaths($id: Long!) {
        match(id: $id) {
          id
          players {
            steamAccountId
            heroId
            lane
            position
            role
            imp
            stats { deathEvents { time } }
          }
        }
      }`,
      variables: { id: matchId }
    }),
    cache: 'no-store'
  });
  if (!response.ok) return undefined;
  const payload = await response.json();
  const normalized = normalizeStratzMatch(payload);
  return {
    deathTimings: normalized.deathTimings,
    deathsByPhase: normalized.deathsByPhase,
    selectedPlayer: {
      heroId: normalized.normalized.selectedPlayer?.heroId,
      role: normalized.normalized.selectedPlayer?.role,
      lane: normalized.normalized.selectedPlayer?.lane,
      position: normalized.normalized.selectedPlayer?.position,
      imp: normalized.normalized.selectedPlayer?.imp ?? null
    }
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
  try {
    stratz = await fetchStratzDeaths(matchId);
  } catch {
    stratz = undefined;
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
          : null
      }
    }
  };
}
