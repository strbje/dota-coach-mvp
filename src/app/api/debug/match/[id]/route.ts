import { NextResponse } from 'next/server';
import { fetchOpenDotaMatch } from '@/lib/dota/clients/opendota';
import { normalizeOpenDotaMatch } from '@/lib/dota/adapters/normalizeOpenDotaMatch';

type Stage = 'fetch' | 'normalize' | 'unknown';

function logDebugError(matchId: string | number, stage: Stage, error: unknown) {
  const parsed = error instanceof Error ? error : new Error(String(error));
  const cause = parsed.cause as { message?: string } | undefined;

  console.error('[debug/match] failure', {
    matchId,
    stage,
    errorName: parsed.name,
    errorMessage: parsed.message,
    errorCause: cause?.message,
    timestamp: new Date().toISOString()
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const hasApiKey = Boolean(process.env.OPENDOTA_API_KEY);
  const { id } = await params;
  const matchId = Number(id);

  if (!Number.isFinite(matchId)) {
    return NextResponse.json(
      {
        ok: false,
        source: 'opendota',
        matchId: id,
        hasApiKey,
        stage: 'unknown',
        error: 'id must be numeric',
        errorName: 'ValidationError',
        errorCause: null,
        timestamp: new Date().toISOString()
      },
      { status: 400 }
    );
  }

  let payload: Awaited<ReturnType<typeof fetchOpenDotaMatch>>;

  try {
    payload = await fetchOpenDotaMatch(matchId);
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;

    logDebugError(matchId, 'fetch', parsed);

    return NextResponse.json(
      {
        ok: false,
        source: 'opendota',
        matchId,
        hasApiKey,
        stage: 'fetch',
        error: parsed.message,
        errorName: parsed.name,
        errorCause: cause?.message ?? null,
        timestamp: new Date().toISOString()
      },
      { status: 502 }
    );
  }

  try {
    const normalized = normalizeOpenDotaMatch(payload);

    return NextResponse.json({
      ok: true,
      source: 'opendota',
      matchId,
      hasApiKey,
      stages: {
        fetched: true,
        normalized: true
      },
      normalized
    });
  } catch (error) {
    const parsed = error instanceof Error ? error : new Error(String(error));
    const cause = parsed.cause as { message?: string } | undefined;

    logDebugError(matchId, 'normalize', parsed);

    return NextResponse.json(
      {
        ok: false,
        source: 'opendota',
        matchId,
        hasApiKey,
        stage: 'normalize',
        error: parsed.message,
        errorName: parsed.name,
        errorCause: cause?.message ?? null,
        timestamp: new Date().toISOString()
      },
      { status: 502 }
    );
  }
}
