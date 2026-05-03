import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { runLifestealerCarryPostMatchRules } from '@/lib/dota/rules/postMatch/lifestealerCarry';

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

  return {
    analysis: runLifestealerCarryPostMatchRules(normalized),
    debug: {
      provider: 'opendota',
      stages: {
        fetched: true,
        normalized: true
      },
      summary: {
        hasPlayer: Boolean(normalized.player),
        durationSeconds: normalized.durationSeconds,
        didRadiantWin: normalized.didRadiantWin
      }
    }
  };
}
