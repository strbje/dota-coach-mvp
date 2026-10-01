import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';
import { getGoldReasonConstants } from '@/lib/dota/providers/opendotaConstantsProvider';
import { normalizeGoldReasons } from '@/lib/dota/normalize/goldReasons';
import { selectOpenDotaPlayer } from '@/lib/dota/adapters/selectOpenDotaPlayer';
import type { PlayerSelector } from '@/lib/dota/selection/playerSelector';

type Stage = 'fetch' | 'normalize' | 'unknown';
type Transport = 'fetch' | 'https-fallback' | 'unknown';
export type DebugDependencies = {
  fetchMatch: typeof fetchOpenDotaMatch;
  normalizeMatch: typeof normalizeOpenDotaMatch;
  getConstants: typeof getGoldReasonConstants;
};

const defaultDependencies: DebugDependencies = {
  fetchMatch: fetchOpenDotaMatch,
  normalizeMatch: normalizeOpenDotaMatch,
  getConstants: getGoldReasonConstants
};

function logDebugError(matchId: string | number, stage: Stage, error: unknown) {
  const parsed = error instanceof Error ? error : new Error(String(error));
  const cause = parsed.cause as { message?: string } | undefined;

  console.error('[debug/match] failure', { matchId, stage, errorName: parsed.name, errorMessage: parsed.message, errorCause: cause?.message, timestamp: new Date().toISOString() });
}

export async function handleDebugMatch(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  dependencies: DebugDependencies = defaultDependencies
) {
  const hasApiKey = Boolean(process.env.OPENDOTA_API_KEY);
  const { id } = await params;
  const matchId = id.trim() === '' ? Number.NaN : Number(id);
  const searchParams = new URL(request.url).searchParams;
  const playerSlotParam = searchParams.get('playerSlot');
  const heroIdParam = searchParams.get('heroId');
  const hasInvalidExplicitSelector = [playerSlotParam, heroIdParam]
    .some((value) => value !== null && value.trim() === '');
  const parseSelectorValue = (value: string | null) => value === null || value.trim() === '' ? undefined : Number(value);
  const playerSlot = parseSelectorValue(playerSlotParam);
  const heroId = parseSelectorValue(heroIdParam);
  const hasSelectorParameter = playerSlotParam !== null || heroIdParam !== null;
  const selector: PlayerSelector = hasSelectorParameter
    ? { ...(playerSlot !== undefined ? { playerSlot } : {}), ...(heroId !== undefined ? { heroId } : {}) }
    : { heroId: 54 };

  if (!Number.isSafeInteger(matchId) || matchId <= 0 || hasInvalidExplicitSelector || Object.keys(selector).length === 0
    || Object.values(selector).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return NextResponse.json({ ok: false, source: 'opendota', matchId: id, hasApiKey, stage: 'unknown', error: 'match id must be a positive safe integer and player selector values must be non-negative safe integers', errorName: 'ValidationError', errorCause: null, timestamp: new Date().toISOString() }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof fetchOpenDotaMatch>>;

  try { payload = await dependencies.fetchMatch(matchId); } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;
    const transport = ((parsed as { transport?: Transport }).transport ?? 'unknown') as Transport;
    logDebugError(matchId, 'fetch', parsed);
    return NextResponse.json({ ok: false, source: 'opendota', matchId, hasApiKey, stage: 'fetch', transport, error: parsed.message, errorName: parsed.name, errorCause: cause?.message ?? null, timestamp: new Date().toISOString() }, { status: 502 });
  }

  try {
    const normalized = await dependencies.normalizeMatch(payload, selector);
    const player = selectOpenDotaPlayer(Array.isArray(payload.players) ? payload.players : [], selector) as Record<string, unknown>;
    const raw = player && typeof player.gold_reasons === 'object' && player.gold_reasons ? player.gold_reasons as Record<string, number> : {};
    const constants = await dependencies.getConstants();
    const goldReasonsDebug = normalizeGoldReasons(raw, constants);

    return NextResponse.json({ ok: true, source: 'opendota', matchId, selector, hasApiKey, stages: { fetched: true, normalized: true }, normalized, goldReasonsDebug: { raw, ...goldReasonsDebug } });
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;
    logDebugError(matchId, 'normalize', parsed);
    return NextResponse.json({ ok: false, source: 'opendota', matchId, hasApiKey, stage: 'normalize', error: parsed.message, errorName: parsed.name, errorCause: cause?.message ?? null, timestamp: new Date().toISOString() }, { status: 502 });
  }
}
