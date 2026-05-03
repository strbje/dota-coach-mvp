import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { runLifestealerCarryPostMatchRules } from '@/lib/dota/rules/postMatch/lifestealerCarry';

export async function analyzePostMatch(matchId: number, hero = 'Lifestealer') {
  const openDotaPayload = await fetchOpenDotaMatch(matchId);
  const normalized = normalizeOpenDotaMatch(openDotaPayload, hero);
  return {
    analysis: runLifestealerCarryPostMatchRules(normalized),
    debug: {
      provider: 'opendota',
      summary: {
        hasPlayer: Boolean(normalized.player),
        durationSeconds: normalized.durationSeconds,
        didRadiantWin: normalized.didRadiantWin
      }
    }
  };
}
