import type { PreGameDraftInput } from '../../../../lib/dota/types/domain';

export const PRE_GAME_ERROR_CODES = {
  unsupportedInput: 'UNSUPPORTED_PRE_GAME_INPUT',
  failed: 'PRE_GAME_FAILED'
} as const;

type AnalyzePreGame = (input: PreGameDraftInput) => Promise<unknown>;
export type PreGameApiResult = { body: unknown; status: number };

export function preGameFailure(error: unknown): PreGameApiResult {
  console.error('Pre-game analysis failed', error);
  return { body: { errorCode: PRE_GAME_ERROR_CODES.failed }, status: 500 };
}

export async function handlePreGameAnalyze(
  body: unknown,
  analyze: AnalyzePreGame
): Promise<PreGameApiResult> {
  if (
    typeof body !== 'object' || body === null
    || !('hero' in body) || !('role' in body)
    || body.hero !== 'Lifestealer' || body.role !== 'carry'
  ) {
    return {
      body: { errorCode: PRE_GAME_ERROR_CODES.unsupportedInput },
      status: 400
    };
  }

  try {
    return { body: await analyze(body as PreGameDraftInput), status: 200 };
  } catch (error) {
    return preGameFailure(error);
  }
}
