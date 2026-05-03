import { normalizeDraftInput } from '@/lib/dota/adapters/normalizeDraftInput';
import { normalizeStratzHeroContext } from '@/lib/dota/adapters/normalizeStratzHeroContext';
import { fetchStratzHeroContext } from '@/lib/dota/clients/stratz';
import { runLifestealerCarryPreGameRules } from '@/lib/dota/rules/preGame/lifestealerCarry';
import type { PreGameDraftInput } from '@/lib/dota/types/domain';

export async function analyzePreGame(input: PreGameDraftInput) {
  const normalized = normalizeDraftInput(input);
  const stratzRaw = await fetchStratzHeroContext(normalized.hero, normalized.role);
  const stratz = normalizeStratzHeroContext(stratzRaw);

  const analysis = runLifestealerCarryPreGameRules(normalized);
  const extraReason = stratz.laneTips[0];
  if (extraReason && stratz.source === 'stratz') {
    analysis.lane.reasons = [...analysis.lane.reasons, `STRATZ note: ${extraReason}`];
  }

  return analysis;
}
